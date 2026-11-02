import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { pool } from "../config/database.js";
import { autentikasi, hanyaAdmin } from "../middlewares/authMiddleware.js";
import { createRateLimiter } from "../middlewares/securityMiddleware.js";
import {
  asyncHandler,
  sendError,
  toAdminAccountDTO,
} from "../utils/http.js";
import { buildExcelWorkbook } from "../utils/excelReportGenerator.js";
import {
  ALLOWED_ATTENDANCE_STATUS,
  isValidCoordinate,
  isValidDateString,
  isValidEmail,
  isValidPositiveId,
  isValidTimeString,
} from "../utils/business.js";

const router = Router();
router.use(autentikasi, hanyaAdmin);

const adminAccountRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 15,
  keyPrefix: "admin-account",
  message:
    "Terlalu banyak percobaan perubahan akun. Silakan coba lagi beberapa saat.",
});

// 0. Profil & Pengaturan Akun Administrator
router.get(
  "/account",
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      `SELECT nama_pengguna, email, peran
       FROM pengguna
       WHERE id_pengguna = $1 AND peran = 'admin'`,
      [req.pengguna.id_pengguna],
    );

    if (!result.rows[0]) {
      return sendError(res, 404, "Akun administrator tidak ditemukan.");
    }

    res.json({ success: true, data: toAdminAccountDTO(result.rows[0]) });
  }),
);

router.patch(
  "/account",
  adminAccountRateLimiter,
  asyncHandler(async (req, res) => {
    const { nama_pengguna, email, kata_sandi_saat_ini, kata_sandi_baru } =
      req.body || {};

    if (
      !nama_pengguna ||
      typeof nama_pengguna !== "string" ||
      !nama_pengguna.trim() ||
      nama_pengguna.trim().length > 100
    ) {
      return sendError(res, 400, "Username administrator wajib diisi.");
    }

    if (!isValidEmail(email)) {
      return sendError(res, 400, "Format email administrator tidak valid.");
    }

    if (!kata_sandi_saat_ini || typeof kata_sandi_saat_ini !== "string") {
      return sendError(
        res,
        400,
        "Kata sandi saat ini wajib diisi untuk verifikasi keamanan.",
      );
    }

    if (
      kata_sandi_baru &&
      typeof kata_sandi_baru === "string" &&
      (kata_sandi_baru.length < 6 || kata_sandi_baru.length > 200)
    ) {
      return sendError(res, 400, "Kata sandi baru minimal 6 karakter.");
    }

    const adminRes = await pool.query(
      "SELECT id_pengguna, nama_pengguna, email, kata_sandi_hash, peran FROM pengguna WHERE id_pengguna = $1 AND peran = 'admin'",
      [req.pengguna.id_pengguna],
    );

    const admin = adminRes.rows[0];
    if (!admin) {
      return sendError(res, 404, "Akun administrator tidak ditemukan.");
    }

    // Verifikasi kata sandi saat ini
    const validPassword = await bcrypt.compare(
      kata_sandi_saat_ini,
      admin.kata_sandi_hash,
    );
    if (!validPassword) {
      return sendError(res, 401, "Kata sandi saat ini tidak valid.");
    }

    // Cek keunikan username dan email terhadap pengguna lain
    const duplicate = await pool.query(
      `SELECT id_pengguna FROM pengguna
       WHERE (LOWER(nama_pengguna) = LOWER($1) OR LOWER(email) = LOWER($2))
         AND id_pengguna != $3`,
      [
        nama_pengguna.trim(),
        email.trim().toLowerCase(),
        req.pengguna.id_pengguna,
      ],
    );

    if (duplicate.rows.length > 0) {
      return sendError(
        res,
        409,
        "Username atau email tersebut sudah digunakan oleh akun lain.",
      );
    }

    let newHash = admin.kata_sandi_hash;
    if (kata_sandi_baru && kata_sandi_baru.trim()) {
      newHash = await bcrypt.hash(kata_sandi_baru.trim(), 12);
    }

    const updated = await pool.query(
      `UPDATE pengguna
       SET nama_pengguna = $1, email = $2, kata_sandi_hash = $3, diperbarui_pada = NOW()
       WHERE id_pengguna = $4
       RETURNING id_pengguna, nama_pengguna, email, peran`,
      [
        nama_pengguna.trim(),
        email.trim().toLowerCase(),
        newHash,
        req.pengguna.id_pengguna,
      ],
    );

    const updatedUser = updated.rows[0];

    // Refresh token JWT
    const token = jwt.sign(
      {
        id_pengguna: updatedUser.id_pengguna.toString(),
        peran: updatedUser.peran,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRES_IN || "1h",
        algorithm: "HS256",
      },
    );

    res.json({
      success: true,
      message: "Akun administrator berhasil diperbarui.",
      data: toAdminAccountDTO(updatedUser),
      token,
    });
  }),
);

// 1. Dashboard summary
router.get(
  "/summary",
  asyncHandler(async (req, res) => {
    const [employees, branches, attendance, submissions] = await Promise.all([
      pool.query(
        "SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status_karyawan='aktif')::int AS aktif FROM karyawan",
      ),
      pool.query(
        "SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status_cabang='aktif')::int AS aktif FROM cabang",
      ),
      pool.query(`SELECT COUNT(*)::int AS total,
                         COUNT(*) FILTER (WHERE a.status_absensi ILIKE 'terlambat')::int AS terlambat
                  FROM absensi a
                  JOIN jadwal_kerja j ON j.id_jadwal = a.id_jadwal
                  WHERE j.tanggal_kerja = CURRENT_DATE`),
      pool.query(
        "SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status_pengajuan ILIKE 'menunggu')::int AS menunggu FROM pengajuan",
      ),
    ]);
    res.json({
      success: true,
      data: {
        karyawan: employees.rows[0],
        cabang: branches.rows[0],
        presensi_hari_ini: attendance.rows[0],
        pengajuan: submissions.rows[0],
      },
    });
  }),
);

// 2. Data Karyawan
router.get(
  "/employees",
  asyncHandler(async (req, res) => {
    const statusFilter = req.query.status ? String(req.query.status) : null;
    if (statusFilter && !["aktif", "nonaktif"].includes(statusFilter)) {
      return sendError(res, 400, "Filter status karyawan tidak valid.");
    }
    const searchQuery = req.query.q
      ? String(req.query.q).trim().slice(0, 100)
      : null;

    const result = await pool.query(
      `SELECT k.id_karyawan, k.id_pengguna, k.nomor_induk AS nip, k.nama_lengkap, k.nomor_telepon,
              k.tanggal_bergabung, k.status_karyawan,
              COALESCE(k.hari_libur, '{}') AS hari_libur,
              p.nama_pengguna, p.email, p.status_akun,
              COALESCE(
                json_agg(
                  json_build_object(
                    'id_penempatan', pk.id_penempatan,
                    'id_cabang', c.id_cabang,
                    'nama_cabang', c.nama_cabang,
                    'tanggal_mulai', pk.berlaku_mulai,
                    'tanggal_selesai', pk.berlaku_sampai
                  )
                ) FILTER (WHERE pk.id_penempatan IS NOT NULL),
                '[]'
              ) AS penempatan
       FROM karyawan k
       JOIN pengguna p ON p.id_pengguna = k.id_pengguna
       LEFT JOIN penempatan_karyawan pk ON pk.id_karyawan = k.id_karyawan
       LEFT JOIN cabang c ON c.id_cabang = pk.id_cabang
       WHERE ($1::text IS NULL OR k.status_karyawan = $1)
         AND ($2::text IS NULL OR concat_ws(' ', k.nama_lengkap, k.nomor_induk, p.email, p.nama_pengguna, c.nama_cabang) ILIKE '%' || $2 || '%')
       GROUP BY k.id_karyawan, p.id_pengguna
       ORDER BY k.nama_lengkap`,
      [statusFilter, searchQuery],
    );
    res.json({ success: true, data: result.rows });
  }),
);

router.post(
  "/employees",
  asyncHandler(async (req, res) => {
    const {
      nama_pengguna,
      email,
      kata_sandi,
      nip,
      nomor_induk,
      nama_lengkap,
      nomor_telepon,
      tanggal_bergabung,
      hari_libur,
    } = req.body || {};
    const actualNip = String(nip || nomor_induk || "").trim();
    if (
      ![nama_pengguna, email, kata_sandi, actualNip, nama_lengkap].every(
        (v) => typeof v === "string" && v.trim(),
      )
    ) {
      return sendError(res, 400, "Data akun dan karyawan wajib lengkap.");
    }
    if (!isValidEmail(email)) {
      return sendError(res, 400, "Format email karyawan tidak valid.");
    }
    if (kata_sandi.length < 8 || kata_sandi.length > 200) {
      return sendError(res, 400, "Kata sandi minimal 8 karakter.");
    }
    if (tanggal_bergabung && !isValidDateString(tanggal_bergabung)) {
      return sendError(res, 400, "Format tanggal bergabung tidak valid.");
    }

    const validDays = [
      "Senin",
      "Selasa",
      "Rabu",
      "Kamis",
      "Jumat",
      "Sabtu",
      "Minggu",
    ];
    const cleanDays = Array.isArray(hari_libur)
      ? hari_libur.filter((d) => validDays.includes(d))
      : [];

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const hash = await bcrypt.hash(kata_sandi, 12);
      const user = await client.query(
        "INSERT INTO pengguna (nama_pengguna, email, kata_sandi_hash, peran) VALUES ($1, $2, $3, 'karyawan') RETURNING id_pengguna, nama_pengguna, email, peran",
        [nama_pengguna.trim(), email.trim().toLowerCase(), hash],
      );
      const employee = await client.query(
        `INSERT INTO karyawan (id_pengguna, nomor_induk, nama_lengkap, nomor_telepon, tanggal_bergabung, hari_libur)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id_karyawan, id_pengguna, nomor_induk AS nip, nama_lengkap, nomor_telepon, tanggal_bergabung, status_karyawan, hari_libur`,
        [
          user.rows[0].id_pengguna,
          actualNip,
          nama_lengkap.trim(),
          nomor_telepon ? String(nomor_telepon).trim() : null,
          tanggal_bergabung || null,
          cleanDays,
        ],
      );
      await client.query("COMMIT");
      res.status(201).json({
        success: true,
        data: { ...employee.rows[0], nip: actualNip, pengguna: user.rows[0] },
      });
    } catch (error) {
      await client.query("ROLLBACK");
      if (error.code === "23505")
        return sendError(
          res,
          409,
          "Username, email, atau NIP sudah digunakan.",
        );
      throw error;
    } finally {
      client.release();
    }
  }),
);

router.patch(
  "/employees/:id/status",
  asyncHandler(async (req, res) => {
    if (!isValidPositiveId(req.params.id)) {
      return sendError(res, 400, "ID karyawan tidak valid.");
    }
    const { status_karyawan } = req.body || {};
    if (!["aktif", "nonaktif"].includes(status_karyawan)) {
      return sendError(res, 400, "Status karyawan tidak valid.");
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        "UPDATE karyawan SET status_karyawan=$1, diperbarui_pada=NOW() WHERE id_karyawan=$2 RETURNING id_pengguna",
        [status_karyawan, req.params.id],
      );
      if (!result.rows[0]) {
        await client.query("ROLLBACK");
        return sendError(res, 404, "Karyawan tidak ditemukan.");
      }
      await client.query(
        "UPDATE pengguna SET status_akun=$1, diperbarui_pada=NOW() WHERE id_pengguna=$2",
        [status_karyawan, result.rows[0].id_pengguna],
      );
      await client.query("COMMIT");
      res.json({ success: true, status_karyawan });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }),
);

router.patch(
  "/employees/:id/days-off",
  asyncHandler(async (req, res) => {
    if (!isValidPositiveId(req.params.id)) {
      return sendError(res, 400, "ID karyawan tidak valid.");
    }
    const { hari_libur } = req.body || {};
    if (!Array.isArray(hari_libur)) {
      return sendError(res, 400, "Format hari libur harus berupa array.");
    }
    const validDays = [
      "Senin",
      "Selasa",
      "Rabu",
      "Kamis",
      "Jumat",
      "Sabtu",
      "Minggu",
    ];
    const cleanDays = hari_libur.filter((d) => validDays.includes(d));

    const result = await pool.query(
      `UPDATE karyawan 
       SET hari_libur = $1, diperbarui_pada = NOW() 
       WHERE id_karyawan = $2 
       RETURNING id_karyawan, nama_lengkap, hari_libur`,
      [cleanDays, req.params.id],
    );

    if (!result.rows[0]) {
      return sendError(res, 404, "Karyawan tidak ditemukan.");
    }

    // Sinkronisasi status jadwal_kerja untuk hari ini bila ada
    const todayDayName = new Intl.DateTimeFormat("id-ID", {
      weekday: "long",
      timeZone: "Asia/Jakarta",
    }).format(new Date());
    const isTodayLibur = cleanDays.includes(todayDayName);

    await pool.query(
      `UPDATE jadwal_kerja 
       SET status_jadwal = $1, diperbarui_pada = NOW() 
       WHERE id_karyawan = $2 AND tanggal_kerja = CURRENT_DATE`,
      [isTodayLibur ? "libur" : "kerja", req.params.id],
    );

    res.json({
      success: true,
      message: `Hari libur karyawan ${result.rows[0].nama_lengkap} berhasil diperbarui.`,
      data: result.rows[0],
    });
  }),
);

router.delete(
  "/employees/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!isValidPositiveId(id)) {
      return sendError(res, 400, "ID karyawan tidak valid.");
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 1. Ambil data karyawan & akun pengguna terkait
      const empResult = await client.query(
        "SELECT id_karyawan, id_pengguna, nama_lengkap, nomor_induk FROM karyawan WHERE id_karyawan = $1 FOR UPDATE",
        [id],
      );
      if (!empResult.rows[0]) {
        await client.query("ROLLBACK");
        return sendError(res, 404, "Karyawan tidak ditemukan.");
      }
      const emp = empResult.rows[0];

      // 2. Cegah penghapusan jika akun memiliki peran admin
      if (emp.id_pengguna) {
        const userResult = await client.query(
          "SELECT peran FROM pengguna WHERE id_pengguna = $1",
          [emp.id_pengguna],
        );
        if (userResult.rows[0]?.peran === "admin") {
          await client.query("ROLLBACK");
          return sendError(
            res,
            403,
            "Akun dengan hak akses administrator tidak dapat dihapus.",
          );
        }
      }

      // 3. Hapus seluruh data relasi terkait karyawan:
      // a. Riwayat keputusan pengajuan
      await client.query(
        `DELETE FROM riwayat_keputusan_pengajuan
         WHERE id_pengajuan IN (SELECT id_pengajuan FROM pengajuan WHERE id_karyawan = $1)`,
        [id],
      );

      // b. Data pengajuan izin/sakit
      await client.query("DELETE FROM pengajuan WHERE id_karyawan = $1", [id]);

      // c. Riwayat koreksi presensi
      await client.query(
        `DELETE FROM riwayat_koreksi
         WHERE id_absensi IN (
           SELECT a.id_absensi
           FROM absensi a
           JOIN jadwal_kerja j ON j.id_jadwal = a.id_jadwal
           WHERE j.id_karyawan = $1
         )`,
        [id],
      );

      // d. Rekaman absensi
      await client.query(
        `DELETE FROM absensi
         WHERE id_jadwal IN (SELECT id_jadwal FROM jadwal_kerja WHERE id_karyawan = $1)`,
        [id],
      );

      // e. Jadwal kerja karyawan
      await client.query("DELETE FROM jadwal_kerja WHERE id_karyawan = $1", [
        id,
      ]);

      // f. Penempatan cabang karyawan
      await client.query(
        "DELETE FROM penempatan_karyawan WHERE id_karyawan = $1",
        [id],
      );

      // g. Data entitas karyawan
      await client.query("DELETE FROM karyawan WHERE id_karyawan = $1", [id]);

      // h. Akun login pengguna
      if (emp.id_pengguna) {
        await client.query("DELETE FROM pengguna WHERE id_pengguna = $1", [
          emp.id_pengguna,
        ]);
      }

      await client.query("COMMIT");
      res.json({
        success: true,
        message: `Akun karyawan ${emp.nama_lengkap} (${emp.nomor_induk}) berhasil dihapus.`,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }),
);

// 3. Penempatan Karyawan
router.post(
  "/placements",
  asyncHandler(async (req, res) => {
    const {
      id_karyawan,
      id_cabang,
      tanggal_mulai,
      berlaku_mulai,
      tanggal_selesai,
      berlaku_sampai,
    } = req.body || {};
    const start =
      tanggal_mulai || berlaku_mulai || new Date().toISOString().slice(0, 10);
    const end = tanggal_selesai || berlaku_sampai || null;

    if (
      !isValidPositiveId(id_karyawan) ||
      !isValidPositiveId(id_cabang) ||
      !isValidDateString(start)
    ) {
      return sendError(
        res,
        400,
        "Karyawan, cabang, dan tanggal mulai penempatan harus valid.",
      );
    }
    if (end && (!isValidDateString(end) || end < start)) {
      return sendError(res, 400, "Tanggal selesai penempatan tidak valid.");
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Tutup penempatan aktif sebelumnya jika tanggal mulai baru lebih baru
      await client.query(
        "UPDATE penempatan_karyawan SET berlaku_sampai = ($1::date - INTERVAL '1 day')::date WHERE id_karyawan = $2 AND berlaku_sampai IS NULL AND berlaku_mulai < $1::date",
        [start, id_karyawan],
      );
      const result = await client.query(
        `INSERT INTO penempatan_karyawan (id_karyawan, id_cabang, berlaku_mulai, berlaku_sampai)
         VALUES ($1, $2, $3, $4)
         RETURNING id_penempatan, id_karyawan, id_cabang, berlaku_mulai AS tanggal_mulai, berlaku_sampai AS tanggal_selesai`,
        [id_karyawan, id_cabang, start, end],
      );
      await client.query("COMMIT");
      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }),
);

// 4. Data Cabang
router.get(
  "/branches",
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      "SELECT id_cabang, kode_cabang, nama_cabang, alamat, tautan_google_maps, lintang AS latitude, bujur AS longitude, radius_meter, kode_qr, status_cabang FROM cabang ORDER BY nama_cabang",
    );
    res.json({ success: true, data: result.rows });
  }),
);

router.post(
  "/branches",
  asyncHandler(async (req, res) => {
    const {
      kode_cabang,
      nama_cabang,
      alamat,
      tautan_google_maps,
      latitude,
      longitude,
      lintang,
      bujur,
      radius_meter = 100,
      kode_qr,
    } = req.body || {};
    const lat = latitude ?? lintang;
    const lng = longitude ?? bujur;
    if (
      typeof kode_cabang !== "string" ||
      !kode_cabang.trim() ||
      typeof nama_cabang !== "string" ||
      !nama_cabang.trim() ||
      !isValidCoordinate(lat, -90, 90) ||
      !isValidCoordinate(lng, -180, 180)
    ) {
      return sendError(
        res,
        400,
        "Kode, nama, latitude (-90..90), dan longitude (-180..180) wajib valid.",
      );
    }
    const radiusNum = Number(radius_meter);
    if (!Number.isFinite(radiusNum) || radiusNum < 1 || radiusNum > 10000) {
      return sendError(res, 400, "Radius cabang harus antara 1 s.d. 10.000 meter.");
    }
    const qr =
      kode_qr || kode_cabang.toLowerCase().replace(/[^a-z0-9_-]/g, "");
    const result = await pool.query(
      `INSERT INTO cabang (kode_cabang, nama_cabang, alamat, tautan_google_maps, lintang, bujur, radius_meter, kode_qr)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id_cabang, kode_cabang, nama_cabang, alamat, tautan_google_maps, lintang AS latitude, bujur AS longitude, radius_meter, kode_qr, status_cabang`,
      [
        kode_cabang.trim().toUpperCase(),
        nama_cabang.trim(),
        alamat || null,
        tautan_google_maps || null,
        Number(lat),
        Number(lng),
        Math.round(radiusNum),
        qr,
      ],
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  }),
);

router.patch(
  "/branches/:id",
  asyncHandler(async (req, res) => {
    if (!isValidPositiveId(req.params.id)) {
      return sendError(res, 400, "ID cabang tidak valid.");
    }
    const body = req.body || {};
    const lat = body.latitude ?? body.lintang;
    const lng = body.longitude ?? body.bujur;
    const updateData = {};

    if (body.nama_cabang !== undefined) {
      if (typeof body.nama_cabang !== "string" || !body.nama_cabang.trim()) {
        return sendError(res, 400, "Nama cabang tidak boleh kosong.");
      }
      updateData.nama_cabang = body.nama_cabang.trim();
    }
    if (body.alamat !== undefined) updateData.alamat = body.alamat;
    if (body.tautan_google_maps !== undefined)
      updateData.tautan_google_maps = body.tautan_google_maps;
    if (lat !== undefined) {
      if (!isValidCoordinate(lat, -90, 90)) {
        return sendError(res, 400, "Latitude tidak valid.");
      }
      updateData.lintang = Number(lat);
    }
    if (lng !== undefined) {
      if (!isValidCoordinate(lng, -180, 180)) {
        return sendError(res, 400, "Longitude tidak valid.");
      }
      updateData.bujur = Number(lng);
    }
    if (body.radius_meter !== undefined) {
      const r = Number(body.radius_meter);
      if (!Number.isFinite(r) || r < 1 || r > 10000) {
        return sendError(res, 400, "Radius cabang harus antara 1 s.d. 10.000 meter.");
      }
      updateData.radius_meter = Math.round(r);
    }
    if (body.status_cabang !== undefined) {
      if (!["aktif", "nonaktif"].includes(body.status_cabang)) {
        return sendError(res, 400, "Status cabang tidak valid.");
      }
      updateData.status_cabang = body.status_cabang;
    }

    const entries = Object.entries(updateData);
    if (!entries.length)
      return sendError(res, 400, "Tidak ada perubahan yang dikirim.");
    const set = entries.map(([k], i) => `${k}=$${i + 1}`).join(", ");
    const values = entries.map(([, v]) => v);
    const result = await pool.query(
      `UPDATE cabang
       SET ${set}, diperbarui_pada=NOW()
       WHERE id_cabang=$${values.length + 1}
       RETURNING id_cabang, kode_cabang, nama_cabang, alamat, tautan_google_maps, lintang AS latitude, bujur AS longitude, radius_meter, kode_qr, status_cabang`,
      [...values, req.params.id],
    );
    if (!result.rows[0]) return sendError(res, 404, "Cabang tidak ditemukan.");
    res.json({ success: true, data: result.rows[0] });
  }),
);

router.delete(
  "/branches/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!isValidPositiveId(id)) {
      return sendError(res, 400, "ID cabang tidak valid.");
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const brRes = await client.query(
        "SELECT id_cabang, nama_cabang, kode_cabang FROM cabang WHERE id_cabang = $1 FOR UPDATE",
        [id],
      );
      if (!brRes.rows[0]) {
        await client.query("ROLLBACK");
        return sendError(res, 404, "Cabang tidak ditemukan.");
      }
      const branch = brRes.rows[0];

      // Hapus data relasi berjenjang terkait cabang
      await client.query(
        `DELETE FROM riwayat_koreksi
         WHERE id_absensi IN (
           SELECT a.id_absensi FROM absensi a
           JOIN jadwal_kerja j ON j.id_jadwal = a.id_jadwal
           WHERE j.id_cabang = $1
         )`,
        [id],
      );
      await client.query(
        `DELETE FROM absensi
         WHERE id_jadwal IN (SELECT id_jadwal FROM jadwal_kerja WHERE id_cabang = $1)`,
        [id],
      );
      await client.query("DELETE FROM jadwal_kerja WHERE id_cabang = $1", [id]);
      await client.query(
        "DELETE FROM jadwal_umum_cabang WHERE id_cabang = $1",
        [id],
      );
      await client.query(
        "DELETE FROM penempatan_karyawan WHERE id_cabang = $1",
        [id],
      );
      await client.query("DELETE FROM cabang WHERE id_cabang = $1", [id]);

      await client.query("COMMIT");
      res.json({
        success: true,
        message: `Cabang ${branch.nama_cabang} (${branch.kode_cabang}) berhasil dihapus.`,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }),
);

// 5. Jadwal & Shift Kerja
router.get(
  "/schedules",
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      `SELECT ju.id_jadwal_umum, ju.id_cabang, c.nama_cabang,
              COALESCE(c.nama_cabang || ' Reguler', 'Reguler') AS nama_jadwal,
              ju.jam_masuk AS jam_mulai, ju.jam_pulang AS jam_selesai,
              ju.toleransi_menit,
              EXTRACT(DOW FROM CURRENT_DATE)::int AS hari
       FROM jadwal_umum_cabang ju
       JOIN cabang c ON c.id_cabang = ju.id_cabang
       ORDER BY c.nama_cabang`,
    );
    res.json({ success: true, data: result.rows });
  }),
);

router.post(
  "/schedules",
  asyncHandler(async (req, res) => {
    const {
      kode_jadwal,
      jam_mulai,
      jam_selesai,
      toleransi_menit = 10,
      id_cabang,
    } = req.body || {};
    if (!jam_mulai || !isValidTimeString(jam_mulai)) {
      return sendError(res, 400, "Jam mulai jadwal wajib valid (HH:MM).");
    }
    if (jam_selesai && !isValidTimeString(jam_selesai)) {
      return sendError(res, 400, "Jam selesai jadwal tidak valid (HH:MM).");
    }
    const tol = Number(toleransi_menit);
    if (!Number.isFinite(tol) || tol < 0 || tol > 240) {
      return sendError(res, 400, "Toleransi keterlambatan harus 0 s.d. 240 menit.");
    }

    let targetCabangId = id_cabang;
    if (targetCabangId !== undefined && targetCabangId !== null && targetCabangId !== "") {
      if (!isValidPositiveId(targetCabangId)) {
        return sendError(res, 400, "ID cabang tidak valid.");
      }
    } else {
      targetCabangId = null;
    }

    if (!targetCabangId && kode_jadwal) {
      const branchMatch = await pool.query(
        "SELECT id_cabang FROM cabang WHERE kode_cabang ILIKE $1 OR nama_cabang ILIKE $1 LIMIT 1",
        [`%${String(kode_jadwal).trim()}%`],
      );
      targetCabangId = branchMatch.rows[0]?.id_cabang;
    }
    if (!targetCabangId) {
      const firstBranch = await pool.query(
        "SELECT id_cabang FROM cabang ORDER BY id_cabang LIMIT 1",
      );
      targetCabangId = firstBranch.rows[0]?.id_cabang;
    }

    const result = await pool.query(
      `INSERT INTO jadwal_umum_cabang (id_cabang, jam_masuk, jam_pulang, toleransi_menit, berlaku_mulai)
       VALUES ($1, $2, $3, $4, CURRENT_DATE)
       RETURNING id_jadwal_umum, id_cabang, jam_masuk AS jam_mulai, jam_pulang AS jam_selesai, toleransi_menit, berlaku_mulai`,
      [targetCabangId, jam_mulai, jam_selesai || null, Math.round(tol)],
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  }),
);

router.patch(
  "/schedules/:id",
  asyncHandler(async (req, res) => {
    if (!isValidPositiveId(req.params.id)) {
      return sendError(res, 400, "ID jadwal tidak valid.");
    }
    const {
      jam_mulai,
      jam_masuk,
      jam_selesai,
      jam_pulang,
      toleransi_menit,
      id_cabang,
    } = req.body || {};
    const inTime = jam_masuk || jam_mulai;
    const outTime = jam_pulang || jam_selesai;

    const updateData = {};
    if (inTime !== undefined) {
      if (!isValidTimeString(inTime)) {
        return sendError(res, 400, "Jam masuk tidak valid.");
      }
      updateData.jam_masuk = inTime;
    }
    if (outTime !== undefined) {
      if (outTime && !isValidTimeString(outTime)) {
        return sendError(res, 400, "Jam pulang tidak valid.");
      }
      updateData.jam_pulang = outTime || null;
    }
    if (toleransi_menit !== undefined) {
      const tol = Number(toleransi_menit);
      if (!Number.isFinite(tol) || tol < 0 || tol > 240) {
        return sendError(res, 400, "Toleransi menit tidak valid.");
      }
      updateData.toleransi_menit = Math.round(tol);
    }
    if (id_cabang !== undefined) {
      if (!isValidPositiveId(id_cabang)) {
        return sendError(res, 400, "ID cabang tidak valid.");
      }
      updateData.id_cabang = Number(id_cabang);
    }

    const entries = Object.entries(updateData);
    if (!entries.length)
      return sendError(res, 400, "Tidak ada data perubahan jadwal.");
    const set = entries.map(([k], i) => `${k}=$${i + 1}`).join(", ");
    const values = entries.map(([, v]) => v);

    const result = await pool.query(
      `UPDATE jadwal_umum_cabang
       SET ${set}
       WHERE id_jadwal_umum = $${values.length + 1}
       RETURNING id_jadwal_umum, id_cabang, jam_masuk AS jam_mulai, jam_pulang AS jam_selesai, toleransi_menit, berlaku_mulai`,
      [...values, req.params.id],
    );
    if (!result.rows[0])
      return sendError(res, 404, "Jadwal shift tidak ditemukan.");
    res.json({ success: true, data: result.rows[0] });
  }),
);

router.delete(
  "/schedules/:id",
  asyncHandler(async (req, res) => {
    if (!isValidPositiveId(req.params.id)) {
      return sendError(res, 400, "ID jadwal tidak valid.");
    }
    const result = await pool.query(
      "DELETE FROM jadwal_umum_cabang WHERE id_jadwal_umum = $1 RETURNING id_jadwal_umum",
      [req.params.id],
    );
    if (!result.rows[0])
      return sendError(res, 404, "Jadwal shift tidak ditemukan.");
    res.json({ success: true, message: "Jadwal shift berhasil dihapus." });
  }),
);

// 6. Monitoring Presensi
router.get(
  "/attendance",
  asyncHandler(async (req, res) => {
    const { dari, sampai, id_cabang } = req.query;
    if (dari && !isValidDateString(dari)) {
      return sendError(res, 400, "Format tanggal 'dari' tidak valid.");
    }
    if (sampai && !isValidDateString(sampai)) {
      return sendError(res, 400, "Format tanggal 'sampai' tidak valid.");
    }
    if (id_cabang && !isValidPositiveId(id_cabang)) {
      return sendError(res, 400, "Filter ID cabang tidak valid.");
    }

    const result = await pool.query(
      `SELECT a.id_absensi,
              j.tanggal_kerja AS tanggal,
              k.nomor_induk AS nip,
              k.nama_lengkap,
              c.nama_cabang,
              a.waktu_masuk,
              a.waktu_pulang,
              a.status_absensi AS status_kehadiran,
              a.menit_terlambat,
              CASE 
                WHEN a.status_absensi ILIKE 'terlambat' THEN a.menit_terlambat * 1000
                WHEN a.status_absensi ILIKE 'izin' THEN 65000
                WHEN a.status_absensi ILIKE 'alfa' THEN 100000
                ELSE 0
              END AS potongan
       FROM absensi a
       JOIN jadwal_kerja j ON j.id_jadwal = a.id_jadwal
       JOIN karyawan k ON k.id_karyawan = j.id_karyawan
       JOIN cabang c ON c.id_cabang = j.id_cabang
       WHERE ($1::date IS NULL OR j.tanggal_kerja >= $1)
         AND ($2::date IS NULL OR j.tanggal_kerja <= $2)
         AND ($3::bigint IS NULL OR j.id_cabang = $3)
       ORDER BY j.tanggal_kerja DESC, a.waktu_masuk DESC`,
      [dari || null, sampai || null, id_cabang || null],
    );
    res.json({ success: true, data: result.rows });
  }),
);

router.post(
  "/attendance/bulk-delete",
  asyncHandler(async (req, res) => {
    const { ids, all } = req.body || {};
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      if (all === true) {
        await client.query("DELETE FROM riwayat_koreksi");
        const del = await client.query("DELETE FROM absensi");
        await client.query("COMMIT");
        return res.json({
          success: true,
          message: "Seluruh rekaman presensi berhasil dihapus.",
          count: del.rowCount,
        });
      }

      if (!Array.isArray(ids) || ids.length === 0) {
        await client.query("ROLLBACK");
        return sendError(res, 400, "Pilih data presensi yang ingin dihapus.");
      }

      const cleanIds = ids
        .filter((id) => isValidPositiveId(id))
        .map((id) => Number(id));
      if (cleanIds.length === 0) {
        await client.query("ROLLBACK");
        return sendError(res, 400, "ID data presensi tidak valid.");
      }

      await client.query(
        "DELETE FROM riwayat_koreksi WHERE id_absensi = ANY($1::bigint[])",
        [cleanIds],
      );
      const del = await client.query(
        "DELETE FROM absensi WHERE id_absensi = ANY($1::bigint[])",
        [cleanIds],
      );
      await client.query("COMMIT");
      res.json({
        success: true,
        message: `${del.rowCount} data presensi berhasil dihapus.`,
        count: del.rowCount,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }),
);

router.delete(
  "/attendance/:id",
  asyncHandler(async (req, res) => {
    if (!isValidPositiveId(req.params.id)) {
      return sendError(res, 400, "ID presensi tidak valid.");
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM riwayat_koreksi WHERE id_absensi = $1", [
        req.params.id,
      ]);
      const del = await client.query(
        "DELETE FROM absensi WHERE id_absensi = $1 RETURNING id_absensi",
        [req.params.id],
      );
      if (!del.rows[0]) {
        await client.query("ROLLBACK");
        return sendError(res, 404, "Data presensi tidak ditemukan.");
      }
      await client.query("COMMIT");
      res.json({ success: true, message: "Data presensi berhasil dihapus." });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }),
);

// 7. Pengajuan Izin & Sakit
router.get(
  "/submissions",
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      `SELECT p.id_pengajuan, k.nomor_induk AS nip, k.nama_lengkap,
              LOWER(p.jenis_pengajuan) AS jenis,
              p.tanggal_mulai, p.tanggal_selesai, p.alasan,
              p.nama_file_bukti,
              p.kunci_file_bukti AS foto_bukti,
              p.tipe_file_bukti,
              LOWER(p.status_pengajuan) AS status,
              p.diajukan_pada, p.catatan_admin
       FROM pengajuan p
       JOIN karyawan k ON k.id_karyawan = p.id_karyawan
       WHERE ($1::text IS NULL OR LOWER(p.status_pengajuan) = LOWER($1))
       ORDER BY p.diajukan_pada DESC`,
      [req.query.status || null],
    );
    res.json({ success: true, data: result.rows });
  }),
);

router.patch(
  "/submissions/:id/decision",
  asyncHandler(async (req, res) => {
    if (!isValidPositiveId(req.params.id)) {
      return sendError(res, 400, "ID pengajuan tidak valid.");
    }
    const { keputusan, catatan } = req.body || {};
    const statusNormalized =
      (keputusan || "").toLowerCase() === "disetujui"
        ? "Disetujui"
        : (keputusan || "").toLowerCase() === "ditolak"
          ? "Ditolak"
          : null;
    if (!statusNormalized)
      return sendError(res, 400, "Keputusan harus disetujui atau ditolak.");

    const safeCatatan =
      typeof catatan === "string" && catatan.trim()
        ? catatan.trim().slice(0, 1000)
        : null;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query(
        "SELECT id_pengajuan, id_karyawan, jenis_pengajuan, tanggal_mulai, tanggal_selesai, status_pengajuan FROM pengajuan WHERE id_pengajuan = $1 FOR UPDATE",
        [req.params.id],
      );
      if (!current.rows[0]) {
        await client.query("ROLLBACK");
        return sendError(res, 404, "Pengajuan tidak ditemukan.");
      }
      if (current.rows[0].status_pengajuan !== "Menunggu") {
        await client.query("ROLLBACK");
        return sendError(
          res,
          400,
          "Pengajuan sudah pernah diproses sebelumnya.",
        );
      }

      const update = await client.query(
        `UPDATE pengajuan
         SET status_pengajuan = $1, diputuskan_oleh = $2, diputuskan_pada = NOW(), catatan_admin = $3, diperbarui_pada = NOW()
         WHERE id_pengajuan = $4
         RETURNING id_pengajuan, id_karyawan, LOWER(jenis_pengajuan) AS jenis, tanggal_mulai, tanggal_selesai, alasan, LOWER(status_pengajuan) AS status, catatan_admin, diputuskan_pada`,
        [
          statusNormalized,
          req.pengguna.id_pengguna,
          safeCatatan,
          req.params.id,
        ],
      );

      await client.query(
        `INSERT INTO riwayat_keputusan_pengajuan (id_pengajuan, id_admin, status_sebelum, status_sesudah, catatan, diputuskan_pada)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [
          req.params.id,
          req.pengguna.id_pengguna,
          current.rows[0].status_pengajuan,
          statusNormalized,
          safeCatatan,
        ],
      );

      // =========================================================================
      // SINKRONISASI KE TABEL JADWAL_KERJA & ABSENSI (Agar Masuk ke Laporan Excel)
      // =========================================================================
      const targetStatus =
        statusNormalized === "Disetujui"
          ? (current.rows[0].jenis_pengajuan || "").toLowerCase() === "sakit"
            ? "Sakit"
            : "Izin"
          : "Alfa";

      // Cari cabang aktif karyawan
      const placementRes = await client.query(
        `SELECT id_cabang FROM penempatan_karyawan
         WHERE id_karyawan = $1 AND (berlaku_sampai IS NULL OR berlaku_sampai >= CURRENT_DATE)
         ORDER BY berlaku_mulai DESC LIMIT 1`,
        [current.rows[0].id_karyawan],
      );
      let targetCabangId = placementRes.rows[0]?.id_cabang;
      if (!targetCabangId) {
        const defaultBranch = await client.query(
          "SELECT id_cabang FROM cabang ORDER BY id_cabang LIMIT 1",
        );
        targetCabangId = defaultBranch.rows[0]?.id_cabang;
      }

      // Iterasi setiap hari dalam rentang tanggal pengajuan (dibatasi maks 60 hari untuk keamanan)
      const datesRes = await client.query(
        `SELECT to_char(d, 'YYYY-MM-DD') AS tanggal
         FROM generate_series($1::date, LEAST($2::date, ($1::date + INTERVAL '60 days')::date), '1 day'::interval) d`,
        [
          current.rows[0].tanggal_mulai,
          current.rows[0].tanggal_selesai || current.rows[0].tanggal_mulai,
        ],
      );

      for (const dRow of datesRes.rows) {
        const dateStr = dRow.tanggal;

        // 1. Pastikan jadwal_kerja tersedia untuk tanggal tersebut
        const jadwalRes = await client.query(
          `INSERT INTO jadwal_kerja (id_karyawan, id_cabang, tanggal_kerja, jam_masuk, jam_pulang, toleransi_menit, sumber_jadwal, status_jadwal)
           VALUES ($1, $2, $3, '10:00:00', '22:00:00', 10, 'umum', 'kerja')
           ON CONFLICT (id_karyawan, tanggal_kerja) DO UPDATE SET diperbarui_pada = NOW()
           RETURNING id_jadwal`,
          [current.rows[0].id_karyawan, targetCabangId, dateStr],
        );
        const idJadwal = jadwalRes.rows[0].id_jadwal;

        // 2. Simpan atau perbarui record absensi dengan status Izin, Sakit, atau Alfa
        const noteText =
          statusNormalized === "Disetujui"
            ? `Pengajuan ${current.rows[0].jenis_pengajuan} disetujui admin. ${safeCatatan || ""}`.trim()
            : `Pengajuan ${current.rows[0].jenis_pengajuan} ditolak admin (Alfa). ${safeCatatan || ""}`.trim();

        await client.query(
          `INSERT INTO absensi (id_jadwal, status_absensi, menit_terlambat, catatan, dibuat_pada, diperbarui_pada)
           VALUES ($1, $2, 0, $3, NOW(), NOW())
           ON CONFLICT (id_jadwal) DO UPDATE
           SET status_absensi = EXCLUDED.status_absensi,
               menit_terlambat = 0,
               waktu_masuk = NULL,
               waktu_pulang = NULL,
               catatan = EXCLUDED.catatan,
               diperbarui_pada = NOW()`,
          [idJadwal, targetStatus, noteText],
        );
      }

      await client.query("COMMIT");
      res.json({ success: true, data: update.rows[0] });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }),
);

router.post(
  "/submissions/bulk-delete",
  asyncHandler(async (req, res) => {
    const { ids, all } = req.body || {};
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      if (all === true) {
        await client.query("DELETE FROM riwayat_keputusan_pengajuan");
        const del = await client.query("DELETE FROM pengajuan");
        await client.query("COMMIT");
        return res.json({
          success: true,
          message: "Seluruh data pengajuan izin/sakit berhasil dihapus.",
          count: del.rowCount,
        });
      }

      if (!Array.isArray(ids) || ids.length === 0) {
        await client.query("ROLLBACK");
        return sendError(res, 400, "Pilih data pengajuan yang ingin dihapus.");
      }

      const cleanIds = ids
        .filter((id) => isValidPositiveId(id))
        .map((id) => Number(id));
      if (cleanIds.length === 0) {
        await client.query("ROLLBACK");
        return sendError(res, 400, "ID data pengajuan tidak valid.");
      }

      await client.query(
        "DELETE FROM riwayat_keputusan_pengajuan WHERE id_pengajuan = ANY($1::bigint[])",
        [cleanIds],
      );
      const del = await client.query(
        "DELETE FROM pengajuan WHERE id_pengajuan = ANY($1::bigint[])",
        [cleanIds],
      );
      await client.query("COMMIT");
      res.json({
        success: true,
        message: `${del.rowCount} data pengajuan berhasil dihapus.`,
        count: del.rowCount,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }),
);

router.delete(
  "/submissions/:id",
  asyncHandler(async (req, res) => {
    if (!isValidPositiveId(req.params.id)) {
      return sendError(res, 400, "ID pengajuan tidak valid.");
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "DELETE FROM riwayat_keputusan_pengajuan WHERE id_pengajuan = $1",
        [req.params.id],
      );
      const del = await client.query(
        "DELETE FROM pengajuan WHERE id_pengajuan = $1 RETURNING id_pengajuan",
        [req.params.id],
      );
      if (!del.rows[0]) {
        await client.query("ROLLBACK");
        return sendError(res, 404, "Data pengajuan tidak ditemukan.");
      }
      await client.query("COMMIT");
      res.json({ success: true, message: "Data pengajuan berhasil dihapus." });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }),
);

// 8. Koreksi Presensi
router.patch(
  "/attendance/:id/correction",
  asyncHandler(async (req, res) => {
    if (!isValidPositiveId(req.params.id)) {
      return sendError(res, 400, "ID absensi tidak valid.");
    }
    const {
      waktu_masuk,
      waktu_pulang,
      status_kehadiran,
      status_absensi,
      alasan,
    } = req.body || {};
    if (typeof alasan !== "string" || !alasan.trim() || alasan.trim().length > 1000) {
      return sendError(res, 400, "Alasan koreksi wajib diisi (maksimal 1000 karakter).");
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const before = await client.query(
        `SELECT a.*, j.jam_masuk AS jadwal_jam_masuk, j.toleransi_menit
         FROM absensi a
         JOIN jadwal_kerja j ON j.id_jadwal = a.id_jadwal
         WHERE a.id_absensi = $1 FOR UPDATE`,
        [req.params.id],
      );
      if (!before.rows[0]) {
        await client.query("ROLLBACK");
        return sendError(res, 404, "Data absensi tidak ditemukan.");
      }
      const b = before.rows[0];

      const rawStatus =
        status_absensi ||
        (status_kehadiran
          ? status_kehadiran.charAt(0).toUpperCase() +
            status_kehadiran.slice(1).toLowerCase()
          : b.status_absensi);
      if (!ALLOWED_ATTENDANCE_STATUS.includes(rawStatus)) {
        await client.query("ROLLBACK");
        return sendError(res, 400, "Status kehadiran koreksi tidak valid.");
      }

      const newMasuk = waktu_masuk ? new Date(waktu_masuk) : b.waktu_masuk;
      const newPulang = waktu_pulang ? new Date(waktu_pulang) : b.waktu_pulang;
      if (
        (waktu_masuk && Number.isNaN(newMasuk.getTime())) ||
        (waktu_pulang && Number.isNaN(newPulang.getTime()))
      ) {
        await client.query("ROLLBACK");
        return sendError(res, 400, "Format waktu koreksi tidak valid.");
      }

      const updated = await client.query(
        `UPDATE absensi
         SET waktu_masuk = $1, waktu_pulang = $2, status_absensi = $3, diperbarui_pada = NOW()
         WHERE id_absensi = $4
         RETURNING id_absensi, id_jadwal, waktu_masuk, waktu_pulang, status_absensi AS status_kehadiran, menit_terlambat`,
        [newMasuk, newPulang, rawStatus, req.params.id],
      );

      await client.query(
        `INSERT INTO riwayat_koreksi (
           id_absensi, id_admin, status_sebelum, status_sesudah,
           waktu_masuk_sebelum, waktu_masuk_sesudah, waktu_pulang_sebelum, waktu_pulang_sesudah,
           menit_terlambat_sebelum, menit_terlambat_sesudah, alasan, dikoreksi_pada
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())`,
        [
          req.params.id,
          req.pengguna.id_pengguna,
          b.status_absensi,
          rawStatus,
          b.waktu_masuk,
          newMasuk,
          b.waktu_pulang,
          newPulang,
          b.menit_terlambat,
          b.menit_terlambat,
          alasan.trim(),
        ],
      );

      await client.query("COMMIT");
      res.json({ success: true, data: updated.rows[0] });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }),
);

// 9. Laporan dan Rekap Excel (Format Kehadiran Cabang & Denda Keterlambatan)
router.get(
  "/reports/export",
  asyncHandler(async (req, res) => {
    const now = new Date();
    const year = now.getFullYear();
    const defDari = `${year}-01-01`;
    const defSampai = `${year}-12-31`;

    const dari = req.query.dari || defDari;
    const sampai = req.query.sampai || defSampai;
    if (
      !isValidDateString(dari) ||
      !isValidDateString(sampai) ||
      sampai < dari
    ) {
      return sendError(res, 400, "Rentang tanggal laporan tidak valid.");
    }

    const workbook = await buildExcelWorkbook(pool, dari, sampai);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="laporan-presensi-${dari}-${sampai}.xlsx"`,
    );
    await workbook.xlsx.write(res);
    res.end();
  }),
);

export default router;
