import { Router } from "express";
import { pool } from "../config/database.js";
import { autentikasi, hanyaKaryawan } from "../middlewares/authMiddleware.js";
import {
  asyncHandler,
  sendError,
  toEmployeeDashboardDTO,
  toPlacementDashboardDTO,
} from "../utils/http.js";
import {
  ALLOWED_IMAGE_MIME_TYPES,
  calculateLateMinutes,
  getJakartaTime,
  haversineDistance,
  isAttendanceOpen,
  isValidBase64Image,
  isValidCoordinate,
  isValidDateString,
  sanitizeFilename,
} from "../utils/business.js";

const router = Router();
router.use(autentikasi, hanyaKaryawan);

async function getEmployee(client, userId) {
  const result = await client.query(
    `SELECT k.id_karyawan, k.id_pengguna, k.nomor_induk AS nip, k.nama_lengkap, k.nomor_telepon,
            k.tanggal_bergabung, k.status_karyawan, COALESCE(k.hari_libur, '{}') AS hari_libur,
            p.nama_pengguna, p.email
     FROM karyawan k
     JOIN pengguna p ON p.id_pengguna = k.id_pengguna
     WHERE k.id_pengguna = $1 AND k.status_karyawan = 'aktif'`,
    [userId],
  );
  return result.rows[0];
}

async function getPlacement(client, employeeId) {
  const result = await client.query(
    `SELECT pk.id_penempatan, pk.id_karyawan, pk.id_cabang,
            pk.berlaku_mulai AS tanggal_mulai, pk.berlaku_sampai AS tanggal_selesai,
            c.nama_cabang, c.kode_cabang, c.lintang AS latitude, c.bujur AS longitude,
            c.radius_meter, c.status_cabang
     FROM penempatan_karyawan pk
     JOIN cabang c ON c.id_cabang = pk.id_cabang
     WHERE pk.id_karyawan = $1
       AND pk.berlaku_mulai <= CURRENT_DATE
       AND (pk.berlaku_sampai IS NULL OR pk.berlaku_sampai >= CURRENT_DATE)
       AND c.status_cabang = 'aktif'
     ORDER BY pk.berlaku_mulai DESC
     LIMIT 1`,
    [employeeId],
  );
  return result.rows[0];
}

async function getOrCreateTodaySchedule(
  client,
  employeeId,
  placement,
  hariLibur = [],
) {
  if (!placement) return null;

  const todayDayName = new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    timeZone: "Asia/Jakarta",
  }).format(new Date());
  const isOffDay = Array.isArray(hariLibur) && hariLibur.includes(todayDayName);

  // Check if today's schedule already exists
  const existing = await client.query(
    "SELECT * FROM jadwal_kerja WHERE id_karyawan = $1 AND tanggal_kerja = CURRENT_DATE",
    [employeeId],
  );
  if (existing.rows[0]) {
    // Sinkronisasi status_jadwal jika preferensi libur diperbarui
    if (isOffDay && existing.rows[0].status_jadwal !== "libur") {
      await client.query(
        "UPDATE jadwal_kerja SET status_jadwal = 'libur', diperbarui_pada = NOW() WHERE id_jadwal = $1",
        [existing.rows[0].id_jadwal],
      );
      existing.rows[0].status_jadwal = "libur";
    }

    const isPakuan = placement.kode_cabang === "PAKUAN";
    const namaJadwal =
      existing.rows[0].status_jadwal === "libur"
        ? "Hari Libur Mingguan"
        : isPakuan
          ? String(existing.rows[0].jam_masuk).slice(0, 2) === "09"
            ? "Pakuan Shift Pagi"
            : "Pakuan Shift Siang"
          : `${placement.nama_cabang} Reguler`;
    return {
      ...existing.rows[0],
      nama_jadwal: namaJadwal,
      is_libur: existing.rows[0].status_jadwal === "libur",
      hari_nama: todayDayName,
    };
  }

  // Determine schedule parameters
  let jamMasuk = "10:00:00";
  let jamPulang = "22:00:00";
  let toleransi = 10;
  let namaJadwal = isOffDay
    ? "Hari Libur Mingguan"
    : `${placement.nama_cabang} Reguler`;

  if (placement.kode_cabang === "PAKUAN") {
    const currentHour = getJakartaTime().hour;
    if (currentHour >= 13) {
      jamMasuk = "14:00:00";
      jamPulang = "22:00:00";
      if (!isOffDay) namaJadwal = "Pakuan Shift Siang";
    } else {
      jamMasuk = "09:00:00";
      jamPulang = "14:00:00";
      if (!isOffDay) namaJadwal = "Pakuan Shift Pagi";
    }
  } else {
    const branchSched = await client.query(
      "SELECT * FROM jadwal_umum_cabang WHERE id_cabang = $1 AND berlaku_mulai <= CURRENT_DATE ORDER BY berlaku_mulai DESC LIMIT 1",
      [placement.id_cabang],
    );
    if (branchSched.rows[0]) {
      jamMasuk = branchSched.rows[0].jam_masuk || "10:00:00";
      jamPulang = branchSched.rows[0].jam_pulang || "22:00:00";
      toleransi = branchSched.rows[0].toleransi_menit ?? 10;
    }
  }

  const created = await client.query(
    `INSERT INTO jadwal_kerja (id_karyawan, id_cabang, tanggal_kerja, jam_masuk, jam_pulang, toleransi_menit, sumber_jadwal, status_jadwal)
     VALUES ($1, $2, CURRENT_DATE, $3, $4, $5, 'umum', $6)
     ON CONFLICT (id_karyawan, tanggal_kerja) DO UPDATE SET status_jadwal = $6, diperbarui_pada = NOW()
     RETURNING *`,
    [
      employeeId,
      placement.id_cabang,
      jamMasuk,
      jamPulang,
      toleransi,
      isOffDay ? "libur" : "kerja",
    ],
  );

  return {
    ...created.rows[0],
    nama_jadwal: namaJadwal,
    is_libur: isOffDay,
    hari_nama: todayDayName,
  };
}

function validateProof(latitude, longitude, accuracy, foto) {
  if (
    !isValidCoordinate(latitude, -90, 90) ||
    !isValidCoordinate(longitude, -180, 180)
  ) {
    return "Koordinat GPS tidak valid.";
  }
  if (
    accuracy !== undefined &&
    accuracy !== null &&
    (!Number.isFinite(Number(accuracy)) ||
      Number(accuracy) <= 0 ||
      Number(accuracy) > 3000)
  ) {
    return "Akurasi GPS tidak memadai. Coba ambil lokasi di area terbuka.";
  }
  if (!isValidBase64Image(foto, 10_000_000)) {
    return "Foto kamera tidak valid atau ukurannya terlalu besar.";
  }
  return null;
}

// 1. Dashboard Karyawan
router.get(
  "/dashboard",
  asyncHandler(async (req, res) => {
    const employee = await getEmployee(pool, req.pengguna.id_pengguna);
    if (!employee) return sendError(res, 404, "Data karyawan tidak ditemukan.");

    const placement = await getPlacement(pool, employee.id_karyawan);
    let schedule = null;
    let todayAttendance = null;

    if (placement) {
      schedule = await getOrCreateTodaySchedule(
        pool,
        employee.id_karyawan,
        placement,
        employee.hari_libur,
      );
      if (schedule) {
        const att = await pool.query(
          `SELECT a.id_absensi, a.waktu_masuk, a.waktu_pulang,
                  a.status_absensi AS status_kehadiran, a.menit_terlambat,
                  a.foto_masuk, a.foto_pulang
           FROM absensi a
           WHERE a.id_jadwal = $1`,
          [schedule.id_jadwal],
        );
        todayAttendance = att.rows[0] || null;
      }
    }

    res.json({
      success: true,
      karyawan: toEmployeeDashboardDTO(employee),
      is_libur:
        schedule?.status_jadwal === "libur" || schedule?.is_libur || false,
      hari_libur: employee.hari_libur || [],
      penempatan: toPlacementDashboardDTO(placement, schedule),
      absensi_hari_ini: todayAttendance,
      presensi_dibuka: isAttendanceOpen(),
    });
  }),
);

// 2. Presensi Masuk
router.post(
  "/attendance/clock-in",
  asyncHandler(async (req, res) => {
    // Validasi jam operasional: Pukul 00:01 s.d. 06:59 WIB presensi belum dibuka
    if (!isAttendanceOpen()) {
      return sendError(res, 400, "Presensi belum dibuka");
    }

    const { latitude, longitude, accuracy = 10, foto } = req.body || {};
    const validationError = validateProof(latitude, longitude, accuracy, foto);
    if (validationError) return sendError(res, 400, validationError);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const employee = await getEmployee(client, req.pengguna.id_pengguna);
      if (!employee) {
        await client.query("ROLLBACK");
        return sendError(res, 404, "Data karyawan tidak ditemukan.");
      }

      const placement = await getPlacement(client, employee.id_karyawan);
      if (!placement) {
        await client.query("ROLLBACK");
        return sendError(
          res,
          409,
          "Anda belum memiliki penempatan cabang aktif.",
        );
      }

      const distance = haversineDistance(
        latitude,
        longitude,
        placement.latitude,
        placement.longitude,
      );
      if (distance > placement.radius_meter) {
        await client.query("ROLLBACK");
        return sendError(
          res,
          422,
          `Presensi ditolak. Jarak Anda ${Math.round(distance)} meter dari cabang (maksimal ${placement.radius_meter} meter).`,
        );
      }

      const schedule = await getOrCreateTodaySchedule(
        client,
        employee.id_karyawan,
        placement,
        employee.hari_libur,
      );
      if (!schedule) {
        await client.query("ROLLBACK");
        return sendError(res, 500, "Gagal memproses jadwal kerja hari ini.");
      }

      if (schedule.status_jadwal === "libur" || schedule.is_libur) {
        await client.query("ROLLBACK");
        const todayDayName = new Intl.DateTimeFormat("id-ID", {
          weekday: "long",
          timeZone: "Asia/Jakarta",
        }).format(new Date());
        return sendError(
          res,
          400,
          `Hari ini (${todayDayName}) adalah hari libur mingguan Anda. Anda tidak perlu melakukan presensi.`,
        );
      }

      const existing = await client.query(
        "SELECT id_absensi, waktu_masuk FROM absensi WHERE id_jadwal = $1 FOR UPDATE",
        [schedule.id_jadwal],
      );
      if (existing.rows[0]?.waktu_masuk) {
        await client.query("ROLLBACK");
        return sendError(res, 409, "Presensi masuk hari ini sudah tercatat.");
      }

      const now = new Date();
      const late = schedule.jam_masuk
        ? calculateLateMinutes(
            now,
            schedule.jam_masuk,
            schedule.toleransi_menit ?? 10,
          )
        : 0;
      const status = late > 0 ? "Terlambat" : "Hadir";

      const userAgent = (req.headers["user-agent"] || "").slice(0, 500);

      const result = existing.rows[0]
        ? await client.query(
            `UPDATE absensi
             SET waktu_masuk = NOW(), lintang_masuk = $1, bujur_masuk = $2,
                 status_absensi = $3, menit_terlambat = $4, foto_masuk = $5,
                 device_info = $6, diperbarui_pada = NOW()
             WHERE id_absensi = $7
             RETURNING id_absensi, waktu_masuk, waktu_pulang, status_absensi AS status_kehadiran, menit_terlambat, foto_masuk`,
            [
              latitude,
              longitude,
              status,
              late,
              foto,
              userAgent,
              existing.rows[0].id_absensi,
            ],
          )
        : await client.query(
            `INSERT INTO absensi (id_jadwal, waktu_masuk, lintang_masuk, bujur_masuk, status_absensi, menit_terlambat, foto_masuk, device_info)
             VALUES ($1, NOW(), $2, $3, $4, $5, $6, $7)
             RETURNING id_absensi, waktu_masuk, waktu_pulang, status_absensi AS status_kehadiran, menit_terlambat, foto_masuk`,
            [
              schedule.id_jadwal,
              latitude,
              longitude,
              status,
              late,
              foto,
              userAgent,
            ],
          );

      await client.query("COMMIT");
      res.status(201).json({
        success: true,
        message: "Presensi masuk berhasil.",
        jarak_meter: Math.round(distance),
        absensi: result.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }),
);

// 3. Presensi Pulang
router.post(
  "/attendance/clock-out",
  asyncHandler(async (req, res) => {
    // Validasi jam operasional: Pukul 00:01 s.d. 06:59 WIB presensi belum dibuka
    if (!isAttendanceOpen()) {
      return sendError(res, 400, "Presensi belum dibuka");
    }

    const { latitude, longitude, accuracy = 10, foto } = req.body || {};
    const validationError = validateProof(latitude, longitude, accuracy, foto);
    if (validationError) return sendError(res, 400, validationError);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const employee = await getEmployee(client, req.pengguna.id_pengguna);
      const placement =
        employee && (await getPlacement(client, employee.id_karyawan));
      if (!employee || !placement) {
        await client.query("ROLLBACK");
        return sendError(res, 404, "Penempatan aktif tidak ditemukan.");
      }

      const distance = haversineDistance(
        latitude,
        longitude,
        placement.latitude,
        placement.longitude,
      );
      if (distance > placement.radius_meter) {
        await client.query("ROLLBACK");
        return sendError(
          res,
          422,
          `Presensi ditolak. Jarak Anda ${Math.round(distance)} meter dari cabang.`,
        );
      }

      const schedule = await getOrCreateTodaySchedule(
        client,
        employee.id_karyawan,
        placement,
        employee.hari_libur,
      );
      if (!schedule) {
        await client.query("ROLLBACK");
        return sendError(res, 500, "Jadwal kerja tidak ditemukan.");
      }

      const userAgent = (req.headers["user-agent"] || "").slice(0, 500);

      const result = await client.query(
        `UPDATE absensi
         SET waktu_pulang = NOW(), lintang_pulang = $1, bujur_pulang = $2,
             foto_pulang = $3,
             device_info = COALESCE(device_info, $4),
             diperbarui_pada = NOW()
         WHERE id_jadwal = $5 AND waktu_masuk IS NOT NULL AND waktu_pulang IS NULL
         RETURNING id_absensi, waktu_masuk, waktu_pulang, status_absensi AS status_kehadiran, menit_terlambat, foto_pulang`,
        [
          latitude,
          longitude,
          foto,
          userAgent,
          schedule.id_jadwal,
        ],
      );

      if (!result.rows[0]) {
        await client.query("ROLLBACK");
        return sendError(
          res,
          409,
          "Presensi masuk belum ada atau presensi pulang sudah tercatat.",
        );
      }

      await client.query("COMMIT");
      res.json({
        success: true,
        message: "Presensi pulang berhasil.",
        jarak_meter: Math.round(distance),
        absensi: result.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }),
);

// 4. Riwayat Presensi Pribadi
router.get(
  "/attendance",
  asyncHandler(async (req, res) => {
    const { dari, sampai } = req.query;
    if (dari && !isValidDateString(dari)) {
      return sendError(
        res,
        400,
        "Format tanggal 'dari' tidak valid (YYYY-MM-DD).",
      );
    }
    if (sampai && !isValidDateString(sampai)) {
      return sendError(
        res,
        400,
        "Format tanggal 'sampai' tidak valid (YYYY-MM-DD).",
      );
    }

    const employee = await getEmployee(pool, req.pengguna.id_pengguna);
    if (!employee) return sendError(res, 404, "Data karyawan tidak ditemukan.");

    const result = await pool.query(
      `SELECT a.id_absensi,
              j.tanggal_kerja AS tanggal,
              c.nama_cabang,
              a.waktu_masuk,
              a.waktu_pulang,
              a.status_absensi AS status_kehadiran,
              a.menit_terlambat,
              a.foto_masuk,
              a.foto_pulang,
              CASE 
                WHEN a.status_absensi ILIKE 'terlambat' THEN a.menit_terlambat * 1000
                WHEN a.status_absensi ILIKE 'izin' THEN 65000
                WHEN a.status_absensi ILIKE 'alfa' THEN 100000
                ELSE 0
              END AS potongan
       FROM absensi a
       JOIN jadwal_kerja j ON j.id_jadwal = a.id_jadwal
       JOIN cabang c ON c.id_cabang = j.id_cabang
       WHERE j.id_karyawan = $1
         AND ($2::date IS NULL OR j.tanggal_kerja >= $2)
         AND ($3::date IS NULL OR j.tanggal_kerja <= $3)
       ORDER BY j.tanggal_kerja DESC, a.waktu_masuk DESC`,
      [employee.id_karyawan, dari || null, sampai || null],
    );
    res.json({ success: true, data: result.rows });
  }),
);

// 5. Pengajuan Izin dan Sakit
router.get(
  "/submissions",
  asyncHandler(async (req, res) => {
    const employee = await getEmployee(pool, req.pengguna.id_pengguna);
    if (!employee) return sendError(res, 404, "Data karyawan tidak ditemukan.");

    const result = await pool.query(
      `SELECT id_pengajuan,
              LOWER(jenis_pengajuan) AS jenis,
              tanggal_mulai,
              tanggal_selesai,
              alasan,
              nama_file_bukti,
              kunci_file_bukti AS foto_bukti,
              tipe_file_bukti,
              ukuran_file_bukti,
              LOWER(status_pengajuan) AS status,
              diajukan_pada,
              catatan_admin
       FROM pengajuan
       WHERE id_karyawan = $1
       ORDER BY diajukan_pada DESC`,
      [employee.id_karyawan],
    );
    res.json({ success: true, data: result.rows });
  }),
);

router.post(
  "/submissions",
  asyncHandler(async (req, res) => {
    const {
      jenis,
      tanggal_mulai,
      tanggal_selesai,
      alasan,
      foto_bukti,
      nama_file,
      tipe_file,
      ukuran_file,
    } = req.body || {};

    const jenisNormalized =
      (jenis || "").toLowerCase() === "izin"
        ? "Izin"
        : (jenis || "").toLowerCase() === "sakit"
          ? "Sakit"
          : null;
    if (
      !jenisNormalized ||
      !tanggal_mulai ||
      typeof alasan !== "string" ||
      !alasan.trim()
    ) {
      return sendError(
        res,
        400,
        "Jenis (izin/sakit), tanggal mulai, dan alasan wajib diisi.",
      );
    }

    if (alasan.trim().length > 1000) {
      return sendError(res, 400, "Alasan maksimal 1000 karakter.");
    }

    const end = tanggal_selesai || tanggal_mulai;
    if (!isValidDateString(tanggal_mulai) || !isValidDateString(end)) {
      return sendError(
        res,
        400,
        "Format tanggal pengajuan tidak valid (YYYY-MM-DD).",
      );
    }
    if (end < tanggal_mulai) {
      return sendError(
        res,
        400,
        "Tanggal selesai tidak boleh sebelum tanggal mulai.",
      );
    }

    const diffDays =
      Math.round(
        (new Date(end) - new Date(tanggal_mulai)) / (1000 * 60 * 60 * 24),
      ) + 1;
    if (diffDays > 60) {
      return sendError(
        res,
        400,
        "Rentang pengajuan izin/sakit maksimal 60 hari.",
      );
    }

    // Wajib melampirkan foto/gambar bukti yang aman (bukan SVG/script)
    if (!isValidBase64Image(foto_bukti, 10_000_000)) {
      return sendError(
        res,
        400,
        "Lampiran foto/gambar bukti surat izin atau sakit wajib diunggah (format JPG, PNG, atau WEBP).",
      );
    }

    const safeFileName = sanitizeFilename(
      nama_file,
      jenisNormalized === "Sakit" ? "surat_sakit.jpg" : "surat_izin.jpg",
    );
    const normalizedMime = String(tipe_file || "").toLowerCase();
    const safeMimeType = ALLOWED_IMAGE_MIME_TYPES.includes(normalizedMime)
      ? normalizedMime
      : "image/jpeg";
    const parsedSize = Number.parseInt(ukuran_file, 10);
    const safeFileSize =
      Number.isInteger(parsedSize) && parsedSize > 0
        ? parsedSize
        : Math.round((foto_bukti.length * 3) / 4);

    const employee = await getEmployee(pool, req.pengguna.id_pengguna);
    if (!employee) return sendError(res, 404, "Data karyawan tidak ditemukan.");

    const result = await pool.query(
      `INSERT INTO pengajuan (
         id_karyawan, jenis_pengajuan, tanggal_mulai, tanggal_selesai, alasan,
         kunci_file_bukti, nama_file_bukti, tipe_file_bukti, ukuran_file_bukti,
         status_pengajuan
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'Menunggu')
       RETURNING id_pengajuan,
                 LOWER(jenis_pengajuan) AS jenis,
                 tanggal_mulai,
                 tanggal_selesai,
                 alasan,
                 nama_file_bukti,
                 tipe_file_bukti,
                 ukuran_file_bukti,
                 LOWER(status_pengajuan) AS status,
                 diajukan_pada,
                 catatan_admin`,
      [
        employee.id_karyawan,
        jenisNormalized,
        tanggal_mulai,
        end,
        alasan.trim(),
        foto_bukti,
        safeFileName,
        safeMimeType,
        safeFileSize,
      ],
    );

    res.status(201).json({
      success: true,
      message: "Pengajuan izin/sakit berhasil dikirim.",
      data: result.rows[0],
    });
  }),
);

export default router;
