import "dotenv/config";
import { pool } from "../config/database.js";

async function run() {
  const check = await pool.query("SELECT * FROM cabang WHERE kode_cabang = $1 OR nama_cabang ILIKE $2", ["CAWANG", "%cawang%"]);
  if (!check.rows[0]) {
    const res = await pool.query(
      `INSERT INTO cabang (kode_cabang, nama_cabang, alamat, lintang, bujur, radius_meter, kode_qr, status_cabang)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'aktif') RETURNING *`,
      [
        "CAWANG",
        "Apartemen Menara Cawang",
        "Apartemen Menara Cawang, Jakarta",
        -6.257485,
        106.863544,
        250,
        "cawang",
      ]
    );
    console.log("Branch added successfully:", res.rows[0]);

    await pool.query(
      `INSERT INTO jadwal_umum_cabang (id_cabang, jam_masuk, jam_pulang, toleransi_menit, berlaku_mulai)
       VALUES ($1, '08:00:00', '22:00:00', 30, CURRENT_DATE)`,
      [res.rows[0].id_cabang]
    );
    console.log("Schedule added for branch.");
  } else {
    console.log("Branch already exists:", check.rows[0]);
  }
  await pool.end();
}

run().catch(console.error);

