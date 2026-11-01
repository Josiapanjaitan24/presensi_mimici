import bcrypt from "bcrypt";
import { pool } from "../config/database.js";

async function seedScenario() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    console.log("Seeding user scenario for Excel layout...");

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

    console.log("Branches:", { botaniId, pakuanId, azimarId, warungNangkaId, atsId, ciapusId });

    // 2. Ensure Employees exist across all 6 branches
    const dummyEmployees = [
      { nip: "MMC-001", nama: "Ahmad Pratama", user: "ahmad.pratama", email: "ahmad@mimici.com", cabang: pakuanId },
      { nip: "MMC-002", nama: "Siti Rahmawati", user: "siti.rahmawati", email: "siti@mimici.com", cabang: botaniId },
      { nip: "MMC-003", nama: "Budi Santoso", user: "budi.santoso", email: "budi@mimici.com", cabang: azimarId },
      { nip: "MMC-004", nama: "Rizky Ramadhan", user: "rizky.ramadhan", email: "rizky@mimici.com", cabang: warungNangkaId },
      { nip: "MMC-005", nama: "Dewi Lestari", user: "dewi.lestari", email: "dewi@mimici.com", cabang: atsId },
      { nip: "MMC-006", nama: "Putri Maharani", user: "putri.maharani", email: "putri@mimici.com", cabang: ciapusId },
    ];

    const passHash = await bcrypt.hash("karyawan123", 10);
    const empMap = {}; // nip -> id_karyawan

    // Check Testing employee
    const testingEmp = await client.query("SELECT id_karyawan, nomor_induk FROM karyawan WHERE nomor_induk = 'MMC-TESTING' OR nama_lengkap ILIKE '%testing%' LIMIT 1");
    if (testingEmp.rows[0]) {
      empMap["MMC-TESTING"] = testingEmp.rows[0].id_karyawan;
    }

    for (const emp of dummyEmployees) {
      let uRes = await client.query("SELECT id_pengguna FROM pengguna WHERE nama_pengguna = $1", [emp.user]);
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
          `INSERT INTO karyawan (id_pengguna, nomor_induk, nama_lengkap, nomor_telepon, tanggal_bergabung, status_karyawan)
           VALUES ($1, $2, $3, '08123456789', '2026-01-01', 'aktif') RETURNING id_karyawan`,
          [uId, emp.nip, emp.nama],
        );
        kId = kIns.rows[0].id_karyawan;
      } else {
        kId = kRes.rows[0].id_karyawan;
      }

      // Pastikan ada penempatan cabang aktif
      await client.query(
        `INSERT INTO penempatan_karyawan (id_karyawan, id_cabang, berlaku_mulai)
         VALUES ($1, $2, '2026-01-01')
         ON CONFLICT DO NOTHING`,
        [kId, emp.cabang],
      );

      empMap[emp.nip] = kId;
    }

    console.log("Employees mapped:", empMap);

    // 3. Clear existing attendance & schedules in Oct 2026 to have a clean, coherent dataset
    await client.query("DELETE FROM riwayat_koreksi WHERE id_absensi IN (SELECT id_absensi FROM absensi a JOIN jadwal_kerja j ON j.id_jadwal = a.id_jadwal WHERE j.tanggal_kerja BETWEEN '2026-10-01' AND '2026-10-31')");
    await client.query("DELETE FROM absensi WHERE id_jadwal IN (SELECT id_jadwal FROM jadwal_kerja WHERE tanggal_kerja BETWEEN '2026-10-01' AND '2026-10-31')");
    await client.query("DELETE FROM jadwal_kerja WHERE tanggal_kerja BETWEEN '2026-10-01' AND '2026-10-31'");

    // 4. Dataset representing the user's exact scenario:
    // Dates:
    // - 2026-10-19 (Senin):
    //   - Botani: Siti Rahmawati (Hadir 10:00 - 22:00)
    //   - Pakuan: Ahmad Pratama (Terlambat 3 menit! 10:13 - toleransi 10m = late 3m) & testing (Hadir)
    //   - Azimar: Budi Santoso (Hadir)
    //   - Warung Nangka: Rizky Ramadhan (Hadir)
    //   - ATS: Dewi Lestari (Hadir)
    //   - Ciapus: Putri Maharani (Hadir)
    //
    // - 2026-10-20 (Selasa):
    //   - Pakuan: Ahmad Pratama (Terlambat 1 menit! 10:11)
    //   - Botani: Siti Rahmawati (Terlambat 15 menit)
    //   - Azimar: Budi Santoso (Terlambat 30 menit)
    //   - Warung Nangka: Rizky Ramadhan (Hadir)
    //   - ATS: Dewi Lestari (Hadir)
    //   - Ciapus: Putri Maharani (Hadir)
    //
    // - 2026-10-21 (Rabu):
    //   - Pakuan: Ahmad Pratama (Terlambat 88 menit -> Total sebulan Ahmad: 3 + 1 + 88 = 92 MENIT! Denda = Rp 92.000!)
    //   - Botani: Siti Rahmawati (Hadir)
    //   - Azimar: Budi Santoso (Izin, disetujui)
    //   - Warung Nangka: Rizky Ramadhan (Hadir)
    //   - ATS: Dewi Lestari (Hadir)
    //   - Ciapus: Putri Maharani (Hadir)
    //
    // - 2026-10-22 (Kamis):
    //   - Pakuan: Ahmad Pratama (Hadir tepat waktu)
    //   - Botani: Siti Rahmawati (Izin, disetujui)
    //   - Azimar: Budi Santoso (Hadir)
    //   - Warung Nangka: Rizky Ramadhan (Hadir)
    //   - ATS: Dewi Lestari (Hadir)
    //   - Ciapus: Putri Maharani (Hadir)
    //
    // - 2026-10-23 (Jumat):
    //   - Pakuan: Ahmad Pratama (Hadir), testing (Sakit, disetujui)
    //   - Botani: Siti Rahmawati (Hadir)
    //   - Azimar: Budi Santoso (Hadir)
    //   - Warung Nangka: Rizky Ramadhan (Hadir)
    //   - ATS: Dewi Lestari (Hadir)
    //   - Ciapus: Putri Maharani (Hadir)

    const scheduleAttendanceList = [
      // === SENIN, 19 OKTOBER 2026 ===
      { nip: "MMC-001", cabang: pakuanId, tgl: "2026-10-19", in: "2026-10-19T10:13:00+07:00", out: "2026-10-19T22:00:00+07:00", status: "Terlambat", late: 3, note: "Terlambat 3 menit (macet lampu merah)" },
      { nip: "MMC-TESTING", cabang: pakuanId, tgl: "2026-10-19", in: "2026-10-19T09:55:00+07:00", out: "2026-10-19T22:00:00+07:00", status: "Hadir", late: 0, note: "Presensi normal" },
      { nip: "MMC-002", cabang: botaniId, tgl: "2026-10-19", in: "2026-10-19T09:58:00+07:00", out: "2026-10-19T22:02:00+07:00", status: "Hadir", late: 0, note: "Presensi tepat waktu" },
      { nip: "MMC-003", cabang: azimarId, tgl: "2026-10-19", in: "2026-10-19T09:50:00+07:00", out: "2026-10-19T22:00:00+07:00", status: "Hadir", late: 0, note: "Presensi tepat waktu" },
      { nip: "MMC-004", cabang: warungNangkaId, tgl: "2026-10-19", in: "2026-10-19T09:57:00+07:00", out: "2026-10-19T22:05:00+07:00", status: "Hadir", late: 0, note: "Presensi tepat waktu" },
      { nip: "MMC-005", cabang: atsId, tgl: "2026-10-19", in: "2026-10-19T09:54:00+07:00", out: "2026-10-19T22:00:00+07:00", status: "Hadir", late: 0, note: "Presensi tepat waktu" },
      { nip: "MMC-006", cabang: ciapusId, tgl: "2026-10-19", in: "2026-10-19T09:59:00+07:00", out: "2026-10-19T22:01:00+07:00", status: "Hadir", late: 0, note: "Presensi tepat waktu" },

      // === SELASA, 20 OKTOBER 2026 ===
      { nip: "MMC-001", cabang: pakuanId, tgl: "2026-10-20", in: "2026-10-20T10:11:00+07:00", out: "2026-10-20T22:00:00+07:00", status: "Terlambat", late: 1, note: "Terlambat 1 menit (antre lift/parkir)" },
      { nip: "MMC-002", cabang: botaniId, tgl: "2026-10-20", in: "2026-10-20T10:25:00+07:00", out: "2026-10-20T22:00:00+07:00", status: "Terlambat", late: 15, note: "Terlambat 15 menit (hujan deras)" },
      { nip: "MMC-003", cabang: azimarId, tgl: "2026-10-20", in: "2026-10-20T10:40:00+07:00", out: "2026-10-20T22:00:00+07:00", status: "Terlambat", late: 30, note: "Terlambat 30 menit (ban motor kempes)" },
      { nip: "MMC-004", cabang: warungNangkaId, tgl: "2026-10-20", in: "2026-10-20T09:58:00+07:00", out: "2026-10-20T22:00:00+07:00", status: "Hadir", late: 0, note: "Presensi tepat waktu" },
      { nip: "MMC-005", cabang: atsId, tgl: "2026-10-20", in: "2026-10-20T09:52:00+07:00", out: "2026-10-20T22:00:00+07:00", status: "Hadir", late: 0, note: "Presensi tepat waktu" },
      { nip: "MMC-006", cabang: ciapusId, tgl: "2026-10-20", in: "2026-10-20T09:56:00+07:00", out: "2026-10-20T22:00:00+07:00", status: "Hadir", late: 0, note: "Presensi tepat waktu" },

      // === RABU, 21 OKTOBER 2026 ===
      { nip: "MMC-001", cabang: pakuanId, tgl: "2026-10-21", in: "2026-10-21T11:38:00+07:00", out: "2026-10-21T22:00:00+07:00", status: "Terlambat", late: 88, note: "Terlambat 88 menit (urusan keluarga darurat)" },
      { nip: "MMC-002", cabang: botaniId, tgl: "2026-10-21", in: "2026-10-21T09:59:00+07:00", out: "2026-10-21T22:00:00+07:00", status: "Hadir", late: 0, note: "Presensi tepat waktu" },
      { nip: "MMC-003", cabang: azimarId, tgl: "2026-10-21", in: null, out: null, status: "Izin", late: 0, note: "Izin mengurus dokumen kependudukan (Disetujui)" },
      { nip: "MMC-004", cabang: warungNangkaId, tgl: "2026-10-21", in: "2026-10-21T09:55:00+07:00", out: "2026-10-21T22:00:00+07:00", status: "Hadir", late: 0, note: "Presensi tepat waktu" },
      { nip: "MMC-005", cabang: atsId, tgl: "2026-10-21", in: "2026-10-21T09:50:00+07:00", out: "2026-10-21T22:00:00+07:00", status: "Hadir", late: 0, note: "Presensi tepat waktu" },
      { nip: "MMC-006", cabang: ciapusId, tgl: "2026-10-21", in: "2026-10-21T09:58:00+07:00", out: "2026-10-21T22:00:00+07:00", status: "Hadir", late: 0, note: "Presensi tepat waktu" },

      // === KAMIS, 22 OKTOBER 2026 ===
      { nip: "MMC-001", cabang: pakuanId, tgl: "2026-10-22", in: "2026-10-22T09:55:00+07:00", out: "2026-10-22T22:00:00+07:00", status: "Hadir", late: 0, note: "Presensi tepat waktu" },
      { nip: "MMC-002", cabang: botaniId, tgl: "2026-10-22", in: null, out: null, status: "Izin", late: 0, note: "Izin acara pernikahan saudara (Disetujui)" },
      { nip: "MMC-003", cabang: azimarId, tgl: "2026-10-22", in: "2026-10-22T09:58:00+07:00", out: "2026-10-22T22:00:00+07:00", status: "Hadir", late: 0, note: "Presensi tepat waktu" },
      { nip: "MMC-004", cabang: warungNangkaId, tgl: "2026-10-22", in: "2026-10-22T09:57:00+07:00", out: "2026-10-22T22:00:00+07:00", status: "Hadir", late: 0, note: "Presensi tepat waktu" },
      { nip: "MMC-005", cabang: atsId, tgl: "2026-10-22", in: "2026-10-22T09:53:00+07:00", out: "2026-10-22T22:00:00+07:00", status: "Hadir", late: 0, note: "Presensi tepat waktu" },
      { nip: "MMC-006", cabang: ciapusId, tgl: "2026-10-22", in: "2026-10-22T09:54:00+07:00", out: "2026-10-22T22:00:00+07:00", status: "Hadir", late: 0, note: "Presensi tepat waktu" },

      // === JUMAT, 23 OKTOBER 2026 ===
      { nip: "MMC-001", cabang: pakuanId, tgl: "2026-10-23", in: "2026-10-23T09:57:00+07:00", out: "2026-10-23T22:00:00+07:00", status: "Hadir", late: 0, note: "Presensi tepat waktu" },
      { nip: "MMC-TESTING", cabang: pakuanId, tgl: "2026-10-23", in: null, out: null, status: "Sakit", late: 0, note: "Sakit flu & demam (Surat dokter RS)" },
      { nip: "MMC-002", cabang: botaniId, tgl: "2026-10-23", in: "2026-10-23T09:58:00+07:00", out: "2026-10-23T22:00:00+07:00", status: "Hadir", late: 0, note: "Presensi tepat waktu" },
      { nip: "MMC-003", cabang: azimarId, tgl: "2026-10-23", in: "2026-10-23T09:59:00+07:00", out: "2026-10-23T22:00:00+07:00", status: "Hadir", late: 0, note: "Presensi tepat waktu" },
      { nip: "MMC-004", cabang: warungNangkaId, tgl: "2026-10-23", in: "2026-10-23T09:56:00+07:00", out: "2026-10-23T22:00:00+07:00", status: "Hadir", late: 0, note: "Presensi tepat waktu" },
      { nip: "MMC-005", cabang: atsId, tgl: "2026-10-23", in: "2026-10-23T09:51:00+07:00", out: "2026-10-23T22:00:00+07:00", status: "Hadir", late: 0, note: "Presensi tepat waktu" },
      { nip: "MMC-006", cabang: ciapusId, tgl: "2026-10-23", in: "2026-10-23T09:55:00+07:00", out: "2026-10-23T22:00:00+07:00", status: "Hadir", late: 0, note: "Presensi tepat waktu" },
    ];

    for (const item of scheduleAttendanceList) {
      const empId = empMap[item.nip];
      if (!empId) continue;

      const jRes = await client.query(
        `INSERT INTO jadwal_kerja (id_karyawan, id_cabang, tanggal_kerja, jam_masuk, jam_pulang, toleransi_menit, sumber_jadwal, status_jadwal)
         VALUES ($1, $2, $3, '10:00:00', '22:00:00', 10, 'umum', 'kerja')
         RETURNING id_jadwal`,
        [empId, item.cabang, item.tgl],
      );
      const jId = jRes.rows[0].id_jadwal;

      await client.query(
        `INSERT INTO absensi (id_jadwal, waktu_masuk, waktu_pulang, status_absensi, menit_terlambat, catatan)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [jId, item.in, item.out, item.status, item.late, item.note],
      );
    }

    await client.query("COMMIT");
    console.log("Successfully seeded scenario! Ahmad Pratama total late: 3 + 1 + 88 = 92 minutes!");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Seeding scenario failed:", err);
  } finally {
    client.release();
    await pool.end();
  }
}

seedScenario();
