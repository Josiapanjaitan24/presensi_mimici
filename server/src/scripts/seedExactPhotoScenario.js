import "dotenv/config";
import bcrypt from "bcrypt";
import { pool } from "../config/database.js";

async function seedPhotoScenario() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    console.log("Seeding authentic Mimici employee & attendance dataset from reference photo...");

    // 1. Get branches
    const bRes = await client.query("SELECT id_cabang, kode_cabang, nama_cabang FROM cabang ORDER BY id_cabang");
    const branchMap = {};
    bRes.rows.forEach(b => {
      branchMap[b.nama_cabang.toLowerCase()] = b.id_cabang;
    });

    const botaniId = branchMap["botani"];
    const pakuanId = branchMap["pakuan"];
    const azimarId = branchMap["azimar"];
    const warungNangkaId = branchMap["warung nangka"];
    const atsId = branchMap["ats"];
    const ciapusId = branchMap["ciapus"];

    console.log("Branch IDs:", { botaniId, pakuanId, azimarId, warungNangkaId, atsId, ciapusId });

    // 2. Define the exact employees from the photo
    // Photo list: Ahmad, Wira, Kikis, Angga, Surya, Haris, Aprida, Fani, Vina, Desta, Nazwa, Allysha, Safitri, Rizal
    const photoEmployees = [
      { nip: "MMC-001", nama: "Ahmad", user: "ahmad", email: "ahmad@mimici.com", cabang: botaniId, hari_libur: ["Senin"] },
      { nip: "MMC-002", nama: "Wira", user: "wira", email: "wira@mimici.com", cabang: botaniId, hari_libur: ["Rabu"] },
      { nip: "MMC-003", nama: "Kikis", user: "kikis", email: "kikis@mimici.com", cabang: botaniId, hari_libur: ["Selasa"] },
      { nip: "MMC-004", nama: "Angga", user: "angga", email: "angga@mimici.com", cabang: botaniId, hari_libur: ["Jumat"] },
      { nip: "MMC-005", nama: "Surya", user: "surya", email: "surya@mimici.com", cabang: botaniId, hari_libur: ["Kamis"] },
      { nip: "MMC-006", nama: "Haris", user: "haris", email: "haris@mimici.com", cabang: pakuanId, hari_libur: ["Minggu"] },
      { nip: "MMC-007", nama: "Aprida", user: "aprida", email: "aprida@mimici.com", cabang: pakuanId, hari_libur: ["Minggu"] },
      { nip: "MMC-008", nama: "Fani", user: "fani", email: "fani@mimici.com", cabang: pakuanId, hari_libur: ["Sabtu"] },
      { nip: "MMC-009", nama: "Vina", user: "vina", email: "vina@mimici.com", cabang: azimarId, hari_libur: ["Jumat"] },
      { nip: "MMC-010", nama: "Desta", user: "desta", email: "desta@mimici.com", cabang: warungNangkaId, hari_libur: ["Minggu"] },
      { nip: "MMC-011", nama: "Nazwa", user: "nazwa", email: "nazwa@mimici.com", cabang: warungNangkaId, hari_libur: ["Minggu"] },
      { nip: "MMC-012", nama: "Allysha", user: "allysha", email: "allysha@mimici.com", cabang: ciapusId, hari_libur: ["Sabtu"] },
      { nip: "MMC-013", nama: "Safitri", user: "safitri", email: "safitri@mimici.com", cabang: ciapusId, hari_libur: ["Minggu"] },
      { nip: "MMC-014", nama: "Rizal", user: "rizal", email: "rizal@mimici.com", cabang: ciapusId, hari_libur: ["Minggu"] },
    ];

    const passHash = await bcrypt.hash("mimici123", 10);
    const empIdMap = {};

    for (const emp of photoEmployees) {
      let uRes = await client.query("SELECT id_pengguna FROM pengguna WHERE nama_pengguna = $1 OR email = $2", [emp.user, emp.email]);
      let uId;
      if (!uRes.rows[0]) {
        const uIns = await client.query(
          `INSERT INTO pengguna (nama_pengguna, email, kata_sandi_hash, peran, status_akun)
           VALUES ($1, $2, $3, 'karyawan', 'aktif') RETURNING id_pengguna`,
          [emp.user, emp.email, passHash],
        );
        uId = uIns.rows[0].id_pengguna;
      } else {
        uId = uRes.rows[0].id_pengguna;
      }

      let kRes = await client.query("SELECT id_karyawan FROM karyawan WHERE nomor_induk = $1", [emp.nip]);
      let kId;
      if (!kRes.rows[0]) {
        const kIns = await client.query(
          `INSERT INTO karyawan (id_pengguna, nomor_induk, nama_lengkap, nomor_telepon, tanggal_bergabung, status_karyawan, hari_libur)
           VALUES ($1, $2, $3, '08123456789', '2026-01-01', 'aktif', $4) RETURNING id_karyawan`,
          [uId, emp.nip, emp.nama, emp.hari_libur],
        );
        kId = kIns.rows[0].id_karyawan;
      } else {
        kId = kRes.rows[0].id_karyawan;
        await client.query(
          `UPDATE karyawan SET nama_lengkap = $1, hari_libur = $2, status_karyawan = 'aktif' WHERE id_karyawan = $3`,
          [emp.nama, emp.hari_libur, kId]
        );
      }

      // Pastikan ada penempatan cabang aktif
      await client.query(
        `INSERT INTO penempatan_karyawan (id_karyawan, id_cabang, berlaku_mulai)
         VALUES ($1, $2, '2026-01-01')
         ON CONFLICT DO NOTHING`,
        [kId, emp.cabang],
      );

      empIdMap[emp.nama] = kId;
    }

    // Additional cross-branch placements from the photo:
    // Pakuan also has Surya, Angga, Fani
    await client.query(`INSERT INTO penempatan_karyawan (id_karyawan, id_cabang, berlaku_mulai) VALUES ($1, $2, '2026-01-01') ON CONFLICT DO NOTHING`, [empIdMap["Surya"], pakuanId]);
    await client.query(`INSERT INTO penempatan_karyawan (id_karyawan, id_cabang, berlaku_mulai) VALUES ($1, $2, '2026-01-01') ON CONFLICT DO NOTHING`, [empIdMap["Angga"], pakuanId]);
    await client.query(`INSERT INTO penempatan_karyawan (id_karyawan, id_cabang, berlaku_mulai) VALUES ($1, $2, '2026-01-01') ON CONFLICT DO NOTHING`, [empIdMap["Angga"], azimarId]);
    // ATS has Haris & Surya
    await client.query(`INSERT INTO penempatan_karyawan (id_karyawan, id_cabang, berlaku_mulai) VALUES ($1, $2, '2026-01-01') ON CONFLICT DO NOTHING`, [empIdMap["Haris"], atsId]);
    await client.query(`INSERT INTO penempatan_karyawan (id_karyawan, id_cabang, berlaku_mulai) VALUES ($1, $2, '2026-01-01') ON CONFLICT DO NOTHING`, [empIdMap["Surya"], atsId]);

    console.log("Employees synced:", Object.keys(empIdMap));

    // 3. Clear existing attendance & schedules in Oct 2026
    await client.query("DELETE FROM riwayat_koreksi WHERE id_absensi IN (SELECT id_absensi FROM absensi a JOIN jadwal_kerja j ON j.id_jadwal = a.id_jadwal WHERE j.tanggal_kerja BETWEEN '2026-10-01' AND '2026-10-31')");
    await client.query("DELETE FROM absensi WHERE id_jadwal IN (SELECT id_jadwal FROM jadwal_kerja WHERE tanggal_kerja BETWEEN '2026-10-01' AND '2026-10-31')");
    await client.query("DELETE FROM jadwal_kerja WHERE tanggal_kerja BETWEEN '2026-10-01' AND '2026-10-31'");

    // 4. Generate all 31 days of October 2026 (Oct 1 to Oct 31)
    // Days mapping: Oct 1, 2026 was Thursday (Kamis)
    const daysID = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
    
    // Exact late totals target from photo:
    // Wira: 92 mins
    // Kikis: 36 mins
    // Surya: 33 mins
    // Vina: 2 mins
    // Desta: 485 mins
    // Nazwa: 165 mins
    // Safitri: 11 mins
    // Ahmad, Angga, Haris, Aprida, Fani, Allysha, Rizal: 0 mins
    
    // Distribute late minutes across realistic days:
    // Wira: Day 1 (1m), Day 5 (5m), Day 12 (19m), Day 13 (13m), Day 15 (10m), Day 16 (3m), Day 17 (11m), Day 24 (18m), Day 25 (6m), Day 26 (6m) = 92m
    const wiraLates = { 1: 1, 5: 5, 12: 19, 13: 13, 15: 10, 16: 3, 17: 11, 24: 18, 25: 6, 26: 6 }; // sum = 92
    // Kikis: Day 16 (10m), Day 24 (1m), Day 25 (15m), Day 26 (10m) = 36m
    const kikisLates = { 16: 10, 24: 1, 25: 15, 26: 10 }; // sum = 36
    // Surya: Day 17 (9m), Day 27 (24m) = 33m
    const suryaLates = { 17: 9, 27: 24 }; // sum = 33
    // Vina: Day 25 (2m) = 2m
    const vinaLates = { 25: 2 };
    // Desta: Day 6 (310m = 05:10), Day 20 (175m) = 485m
    const destaLates = { 6: 310, 20: 175 }; // sum = 485
    // Nazwa: Day 6 (165m = 02:45) = 165m
    const nazwaLates = { 6: 165 };
    // Safitri: Day 7 (11m) = 11m
    const safitriLates = { 7: 11 };

    // Branch slot assignments:
    // Botani: Ahmad, Wira, Kikis, Angga, Surya
    // Pakuan: Surya, Haris, Aprida, Angga, Fani
    // Azimar: Vina, Angga
    // Warna: Desta, Nazwa
    // ATS: Haris, Surya
    // Ciapus: Allysha, Safitri, Rizal
    const branchAssignments = [
      { branchId: botaniId, empName: "Ahmad", defaultTime: "09:53", tolerance: "10.10" },
      { branchId: botaniId, empName: "Wira", defaultTime: "10:03", tolerance: "10.10" },
      { branchId: botaniId, empName: "Kikis", defaultTime: "09:59", tolerance: "10.10" },
      { branchId: botaniId, empName: "Angga", defaultTime: "09:51", tolerance: "10.10" },
      { branchId: botaniId, empName: "Surya", defaultTime: "09:54", tolerance: "10.10" },

      { branchId: pakuanId, empName: "Surya", defaultTime: "10:07", tolerance: "14.10" },
      { branchId: pakuanId, empName: "Haris", defaultTime: "14:00", tolerance: "14.10" },
      { branchId: pakuanId, empName: "Aprida", defaultTime: "08:40", tolerance: "14.10" },
      { branchId: pakuanId, empName: "Angga", defaultTime: "13:42", tolerance: "14.10" },
      { branchId: pakuanId, empName: "Fani", defaultTime: "08:21", tolerance: "09.10" },

      { branchId: azimarId, empName: "Vina", defaultTime: "10:05", tolerance: "10.10" },
      { branchId: azimarId, empName: "Angga", defaultTime: "09:57", tolerance: "10.10" },

      { branchId: warungNangkaId, empName: "Desta", defaultTime: "09:55", tolerance: "10.10" },
      { branchId: warungNangkaId, empName: "Nazwa", defaultTime: "09:50", tolerance: "10.10" },

      { branchId: atsId, empName: "Haris", defaultTime: "08:41", tolerance: "09.10" },
      { branchId: atsId, empName: "Surya", defaultTime: "08:39", tolerance: "09.10" },

      { branchId: ciapusId, empName: "Allysha", defaultTime: "09:53", tolerance: "10.10" },
      { branchId: ciapusId, empName: "Safitri", defaultTime: "09:59", tolerance: "10.10" },
      { branchId: ciapusId, empName: "Rizal", defaultTime: "10:00", tolerance: "10.10" },
    ];

    console.log("Generating attendance records for Oct 1 to Oct 31, 2026...");
    let recordCount = 0;

    for (let day = 1; day <= 31; day++) {
      const dateStr = `2026-10-${String(day).padStart(2, "0")}`;
      const dObj = new Date(dateStr + "T00:00:00");
      const dayName = daysID[dObj.getDay()];

      for (const emp of photoEmployees) {
        const empId = empIdMap[emp.nama];
        if (!empId) continue;

        const isDayOff = emp.hari_libur.includes(dayName);

        // Determine branch for today (allowing realistic rolling for Angga, Surya, Haris)
        let activeBranchId = emp.cabang;
        let defaultTime = "09:55";

        if (emp.nama === "Angga") {
          if (day >= 10 && day <= 17) { activeBranchId = pakuanId; defaultTime = "13:42"; }
          else if (day >= 18 && day <= 25) { activeBranchId = azimarId; defaultTime = "09:57"; }
          else { activeBranchId = botaniId; defaultTime = "09:51"; }
        } else if (emp.nama === "Surya") {
          if (day >= 1 && day <= 10) { activeBranchId = botaniId; defaultTime = "09:54"; }
          else if (day >= 11 && day <= 20) { activeBranchId = pakuanId; defaultTime = "10:07"; }
          else { activeBranchId = atsId; defaultTime = "08:39"; }
        } else if (emp.nama === "Haris") {
          if (day >= 1 && day <= 15) { activeBranchId = pakuanId; defaultTime = "14:00"; }
          else { activeBranchId = atsId; defaultTime = "08:41"; }
        } else if (emp.nama === "Ahmad") {
          defaultTime = "09:52";
        } else if (emp.nama === "Wira") {
          defaultTime = "10:03";
        } else if (emp.nama === "Kikis") {
          defaultTime = "09:59";
        } else if (emp.nama === "Aprida") {
          defaultTime = "08:40";
        } else if (emp.nama === "Fani") {
          defaultTime = "08:21";
        } else if (emp.nama === "Vina") {
          defaultTime = "10:05";
        } else if (emp.nama === "Desta") {
          defaultTime = "09:55";
        } else if (emp.nama === "Nazwa") {
          defaultTime = "09:50";
        } else if (emp.nama === "Allysha") {
          defaultTime = "09:53";
        } else if (emp.nama === "Safitri") {
          defaultTime = "09:59";
        } else if (emp.nama === "Rizal") {
          defaultTime = "10:00";
        }

        let status = "Hadir";
        let lateMins = 0;
        let timeInStr = defaultTime;
        let timeOutStr = "17:02";

        if (defaultTime.startsWith("14:") || defaultTime.startsWith("13:") || emp.nama === "Surya" || emp.nama === "Haris") {
          timeOutStr = "22:00";
        } else if (emp.nama === "Ahmad") {
          timeOutStr = "17:02";
        } else if (emp.nama === "Wira") {
          timeOutStr = "18:05";
        } else if (emp.nama === "Kikis") {
          timeOutStr = "17:00";
        }

        if (emp.nama === "Kikis" && (day === 10 || day === 11)) {
          status = "Sakit";
          timeInStr = null;
          timeOutStr = null;
        } else if (emp.nama === "Fani" && day === 21) {
          status = "Izin";
          timeInStr = null;
          timeOutStr = null;
        } else if (emp.nama === "Safitri" && (day === 22 || day === 23)) {
          status = "Sakit";
          timeInStr = null;
          timeOutStr = null;
        } else if (emp.nama === "Rizal" && day === 18) {
          status = "Alfa";
          timeInStr = null;
          timeOutStr = null;
        } else if (isDayOff) {
          status = "Libur";
          timeInStr = null;
          timeOutStr = null;
        } else {
          // Check lateness:
          if (emp.nama === "Wira" && wiraLates[day]) {
            lateMins = wiraLates[day];
            status = "Terlambat";
            const totalM = 10 * 60 + 10 + lateMins;
            const h = Math.floor(totalM / 60);
            const m = totalM % 60;
            timeInStr = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
          } else if (emp.nama === "Kikis" && kikisLates[day]) {
            lateMins = kikisLates[day];
            status = "Terlambat";
            timeInStr = `10:${String(10 + lateMins).padStart(2, "0")}`;
          } else if (emp.nama === "Surya" && suryaLates[day]) {
            lateMins = suryaLates[day];
            status = "Terlambat";
            timeInStr = `14:${String(10 + lateMins).padStart(2, "0")}`;
          } else if (emp.nama === "Vina" && vinaLates[day]) {
            lateMins = vinaLates[day];
            status = "Terlambat";
            timeInStr = "10:12";
          } else if (emp.nama === "Desta" && destaLates[day]) {
            lateMins = destaLates[day];
            status = "Terlambat";
            timeInStr = "15:20";
          } else if (emp.nama === "Nazwa" && nazwaLates[day]) {
            lateMins = nazwaLates[day];
            status = "Terlambat";
            timeInStr = "12:55";
          } else if (emp.nama === "Safitri" && safitriLates[day]) {
            lateMins = safitriLates[day];
            status = "Terlambat";
            timeInStr = "10:21";
          }
        }

        // Create jadwal_kerja
        const jIns = await client.query(
          `INSERT INTO jadwal_kerja (id_karyawan, id_cabang, tanggal_kerja, jam_masuk, jam_pulang, toleransi_menit, sumber_jadwal, status_jadwal)
           VALUES ($1, $2, $3, '10:00:00', '22:00:00', 10, 'umum', $4) RETURNING id_jadwal`,
          [empId, activeBranchId, dateStr, isDayOff ? 'libur' : 'kerja'],
        );
        const jId = jIns.rows[0].id_jadwal;

        // Create absensi record
        const waktuMasuk = timeInStr ? `${dateStr}T${timeInStr}:00+07:00` : null;
        const waktuPulang = timeOutStr ? `${dateStr}T${timeOutStr}:00+07:00` : null;

        await client.query(
          `INSERT INTO absensi (id_jadwal, waktu_masuk, waktu_pulang, status_absensi, menit_terlambat, catatan)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            jId,
            waktuMasuk,
            waktuPulang,
            status,
            lateMins,
            lateMins > 0 ? `Terlambat ${lateMins} menit` : status === "Libur" ? "Hari Libur Rutin" : status === "Sakit" ? "Sakit (Surat Dokter)" : status === "Izin" ? "Izin (Disetujui)" : status === "Alfa" ? "Alfa (Tanpa Keterangan)" : "Hadir Tepat Waktu",
          ],
        );

        recordCount++;
      }
    }

    await client.query("COMMIT");
    console.log(`Successfully seeded ${recordCount} attendance records matching reference photo!`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Seeding failed:", err);
  } finally {
    client.release();
  }
}

seedPhotoScenario().then(() => pool.end());
