import "dotenv/config";
import { pool } from "../config/database.js";

async function clearAttendanceData() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    console.log("1. Menghapus data riwayat koreksi...");
    await client.query("DELETE FROM riwayat_koreksi");

    console.log("2. Menghapus data absensi (hadir, terlambat, izin, sakit, alfa)...");
    await client.query("DELETE FROM absensi");

    console.log("3. Menghapus data jadwal kerja...");
    await client.query("DELETE FROM jadwal_kerja");

    console.log("4. Menghapus data riwayat keputusan pengajuan...");
    await client.query("DELETE FROM riwayat_keputusan_pengajuan");

    console.log("5. Menghapus data pengajuan izin dan sakit...");
    await client.query("DELETE FROM pengajuan");

    console.log("6. Mereset sequence auto-increment...");
    const seqs = [
      "absensi_id_absensi_seq",
      "jadwal_kerja_id_jadwal_seq",
      "pengajuan_id_pengajuan_seq",
      "riwayat_keputusan_pengajuan_id_riwayat_seq",
      "riwayat_koreksi_id_koreksi_seq",
    ];

    for (const seq of seqs) {
      try {
        await client.query(`ALTER SEQUENCE IF EXISTS ${seq} RESTART WITH 1`);
      } catch {
        // ignore if sequence name differs
      }
    }

    await client.query("COMMIT");
    console.log("\nSemua data absensi, izin, sakit, dan alfa berhasil dihapus dengan aman.");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Gagal membersihkan data absensi:", error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

clearAttendanceData().catch(console.error);

