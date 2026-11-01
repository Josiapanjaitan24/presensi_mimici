import bcrypt from "bcrypt";
import { pool } from "../config/database.js";

async function seed() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    console.log("Memulai penyiapan 10 data testing absensi & pengajuan...");

    // 1. Pastikan cabang ada
    const branchRes = await client.query("SELECT id_cabang, kode_cabang, nama_cabang FROM cabang ORDER BY id_cabang");
    const pakuanId = branchRes.rows.find(b => b.kode_cabang === "PAKUAN")?.id_cabang || branchRes.rows[0].id_cabang;
    const botaniId = branchRes.rows.find(b => b.kode_cabang === "BOTANI")?.id_cabang || branchRes.rows[1]?.id_cabang || pakuanId;
    const azimarId = branchRes.rows.find(b => b.kode_cabang === "AZIMAR")?.id_cabang || branchRes.rows[2]?.id_cabang || pakuanId;

    // 2. Dapatkan atau buat pengguna admin untuk pencatatan keputusan
    const adminRes = await client.query("SELECT id_pengguna FROM pengguna WHERE peran = 'admin' LIMIT 1");
    const adminId = adminRes.rows[0]?.id_pengguna;

    // 3. Buat karyawan testing jika belum ada
    const dummyEmployees = [
      { nip: "MMC-001", nama: "Ahmad Pratama", user: "ahmad.pratama", email: "ahmad@mimici.com", cabang: pakuanId },
      { nip: "MMC-002", nama: "Siti Rahmawati", user: "siti.rahmawati", email: "siti@mimici.com", cabang: botaniId },
      { nip: "MMC-003", nama: "Budi Santoso", user: "budi.santoso", email: "budi@mimici.com", cabang: azimarId },
    ];

    const passHash = await bcrypt.hash("karyawan123", 10);
    const empMap = {}; // nip -> id_karyawan

    // Cek employee Testing yang sudah ada
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

    // Pastikan Testing punya penempatan
    if (empMap["MMC-TESTING"]) {
      await client.query(
        `INSERT INTO penempatan_karyawan (id_karyawan, id_cabang, berlaku_mulai)
         VALUES ($1, $2, '2026-01-01')
         ON CONFLICT DO NOTHING`,
        [empMap["MMC-TESTING"], pakuanId],
      );
    }

    console.log("Karyawan siap:", empMap);

    // 4. Data 10 Rekaman Absensi & Pengajuan
    // Sample dummy bukti base64 gambar
    const dummyImageBase64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAALklEQVR42u3BAQ0AAADCoPdPbQ43oAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABuBh4QAAG8P7JMAAAAAElFTkSuQmCC";

    const records = [
      // 1. Hadir Tepat Waktu
      {
        karyawanNip: "MMC-001",
        cabangId: pakuanId,
        tanggal: "2026-10-18",
        status: "Hadir",
        waktuMasuk: "2026-10-18T09:55:00+07:00",
        waktuPulang: "2026-10-18T22:05:00+07:00",
        menitTerlambat: 0,
        catatan: "Presensi normal via GPS & Kamera selfie (Tepat Waktu)",
      },
      // 2. Terlambat 15 Menit
      {
        karyawanNip: "MMC-002",
        cabangId: botaniId,
        tanggal: "2026-10-19",
        status: "Terlambat",
        waktuMasuk: "2026-10-19T10:15:00+07:00",
        waktuPulang: "2026-10-19T22:00:00+07:00",
        menitTerlambat: 15,
        catatan: "Terlambat 15 menit karena kendala macet di jalan",
      },
      // 3. Terlambat 30 Menit
      {
        karyawanNip: "MMC-003",
        cabangId: azimarId,
        tanggal: "2026-10-20",
        status: "Terlambat",
        waktuMasuk: "2026-10-20T10:30:00+07:00",
        waktuPulang: "2026-10-20T22:00:00+07:00",
        menitTerlambat: 30,
        catatan: "Terlambat 30 menit (Ban motor kempes)",
      },
      // 4. Hadir Tepat Waktu
      {
        karyawanNip: "MMC-001",
        cabangId: pakuanId,
        tanggal: "2026-10-21",
        status: "Hadir",
        waktuMasuk: "2026-10-21T09:58:00+07:00",
        waktuPulang: "2026-10-21T22:02:00+07:00",
        menitTerlambat: 0,
        catatan: "Presensi tepat waktu",
      },
      // 5. Izin Disetujui
      {
        karyawanNip: "MMC-002",
        cabangId: botaniId,
        tanggal: "2026-10-22",
        status: "Izin",
        waktuMasuk: null,
        waktuPulang: null,
        menitTerlambat: 0,
        pengajuan: {
          jenis: "Izin",
          alasan: "Izin menghadiri acara pernikahan saudara kandung di luar kota.",
          namaFile: "surat_undangan_keluarga.jpg",
          keputusan: "Disetujui",
          catatanAdmin: "Disetujui. Potongan izin Rp 65.000 berlaku.",
        },
      },
      // 6. Izin Disetujui
      {
        karyawanNip: "MMC-003",
        cabangId: azimarId,
        tanggal: "2026-10-23",
        status: "Izin",
        waktuMasuk: null,
        waktuPulang: null,
        menitTerlambat: 0,
        pengajuan: {
          jenis: "Izin",
          alasan: "Izin mengurus perpanjangan SIM dan administrasi perbankan.",
          namaFile: "bukti_antrean_bank.png",
          keputusan: "Disetujui",
          catatanAdmin: "Disetujui admin.",
        },
      },
      // 7. Sakit Disetujui
      {
        karyawanNip: empMap["MMC-TESTING"] ? "MMC-TESTING" : "MMC-001",
        cabangId: pakuanId,
        tanggal: "2026-10-24",
        status: "Sakit",
        waktuMasuk: null,
        waktuPulang: null,
        menitTerlambat: 0,
        pengajuan: {
          jenis: "Sakit",
          alasan: "Demam tinggi 39 derajat dan flu berat, istirahat sesuai surat dokter.",
          namaFile: "surat_dokter_klinik_sehat.png",
          keputusan: "Disetujui",
          catatanAdmin: "Disetujui. Cepat sembuh.",
        },
      },
      // 8. Sakit Disetujui
      {
        karyawanNip: "MMC-001",
        cabangId: pakuanId,
        tanggal: "2026-10-25",
        status: "Sakit",
        waktuMasuk: null,
        waktuPulang: null,
        menitTerlambat: 0,
        pengajuan: {
          jenis: "Sakit",
          alasan: "Radang tenggorokan akut dan batuk berdarah, disarankan istirahat dokter.",
          namaFile: "surat_keterangan_sakit_rsud.jpg",
          keputusan: "Disetujui",
          catatanAdmin: "Disetujui resmi surat dokter RS.",
        },
      },
      // 9. Izin Ditolak => Status ALFA
      {
        karyawanNip: "MMC-002",
        cabangId: botaniId,
        tanggal: "2026-10-26",
        status: "Alfa",
        waktuMasuk: null,
        waktuPulang: null,
        menitTerlambat: 0,
        pengajuan: {
          jenis: "Izin",
          alasan: "Izin tidak masuk kerja karena bangun kesiangan dan ada urusan mendadak.",
          namaFile: "foto_alasan_pribadi.png",
          keputusan: "Ditolak",
          catatanAdmin: "Ditolak karena tidak sesuai SOP pengajuan minimal H-1. Dicatat Alfa.",
        },
      },
      // 10. Sakit Ditolak => Status ALFA
      {
        karyawanNip: empMap["MMC-TESTING"] ? "MMC-TESTING" : "MMC-003",
        cabangId: pakuanId,
        tanggal: "2026-10-27",
        status: "Alfa",
        waktuMasuk: null,
        waktuPulang: null,
        menitTerlambat: 0,
        pengajuan: {
          jenis: "Sakit",
          alasan: "Merasa pusing sedikit tanpa melampirkan resep resmi dokter.",
          namaFile: "foto_obat_warung.png",
          keputusan: "Ditolak",
          catatanAdmin: "Ditolak karena tidak melampirkan surat dokter resmi. Dicatat Alfa.",
        },
      },
    ];

    for (let i = 0; i < records.length; i++) {
      const item = records[i];
      const empId = empMap[item.karyawanNip];

      // 1. Buat jadwal kerja
      const jRes = await client.query(
        `INSERT INTO jadwal_kerja (id_karyawan, id_cabang, tanggal_kerja, jam_masuk, jam_pulang, toleransi_menit, sumber_jadwal, status_jadwal)
         VALUES ($1, $2, $3, '10:00:00', '22:00:00', 10, 'umum', 'kerja')
         ON CONFLICT (id_karyawan, tanggal_kerja) DO UPDATE SET id_cabang = EXCLUDED.id_cabang, diperbarui_pada = NOW()
         RETURNING id_jadwal`,
        [empId, item.cabangId, item.tanggal],
      );
      const idJadwal = jRes.rows[0].id_jadwal;

      // 2. Jika ada pengajuan, buat record pengajuan
      let noteText = item.catatan;
      if (item.pengajuan) {
        const pRes = await client.query(
          `INSERT INTO pengajuan (id_karyawan, jenis_pengajuan, tanggal_mulai, tanggal_selesai, alasan, kunci_file_bukti, nama_file_bukti, tipe_file_bukti, ukuran_file_bukti, status_pengajuan, diputuskan_oleh, diputuskan_pada, catatan_admin)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'image/png', 54200, $8, $9, NOW(), $10)
           RETURNING id_pengajuan`,
          [
            empId,
            item.pengajuan.jenis,
            item.tanggal,
            item.tanggal,
            item.pengajuan.alasan,
            dummyImageBase64,
            item.pengajuan.namaFile,
            item.pengajuan.keputusan,
            adminId || null,
            item.pengajuan.catatanAdmin,
          ],
        );

        if (adminId) {
          await client.query(
            `INSERT INTO riwayat_keputusan_pengajuan (id_pengajuan, id_admin, status_sebelum, status_sesudah, catatan, diputuskan_pada)
             VALUES ($1, $2, 'Menunggu', $3, $4, NOW())`,
            [pRes.rows[0].id_pengajuan, adminId, item.pengajuan.keputusan, item.pengajuan.catatanAdmin],
          );
        }

        noteText = item.pengajuan.keputusan === "Disetujui"
          ? `Pengajuan ${item.pengajuan.jenis} disetujui admin. ${item.pengajuan.catatanAdmin}`
          : `Pengajuan ${item.pengajuan.jenis} ditolak admin (Alfa). ${item.pengajuan.catatanAdmin}`;
      }

      // 3. Buat absensi record
      await client.query(
        `INSERT INTO absensi (id_jadwal, waktu_masuk, waktu_pulang, status_absensi, menit_terlambat, catatan, dibuat_pada, diperbarui_pada)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
         ON CONFLICT (id_jadwal) DO UPDATE
         SET waktu_masuk = EXCLUDED.waktu_masuk,
             waktu_pulang = EXCLUDED.waktu_pulang,
             status_absensi = EXCLUDED.status_absensi,
             menit_terlambat = EXCLUDED.menit_terlambat,
             catatan = EXCLUDED.catatan,
             diperbarui_pada = NOW()`,
        [idJadwal, item.waktuMasuk, item.waktuPulang, item.status, item.menitTerlambat, noteText],
      );

      console.log(`[${i + 1}/10] Record ${item.tanggal} (${item.status}) tersimpan.`);
    }

    await client.query("COMMIT");
    console.log("SELESAI: 10 data testing absensi & pengajuan berhasil ditambahkan ke database!");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Gagal seeding data:", err);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
