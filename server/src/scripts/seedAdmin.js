import "dotenv/config";
import bcrypt from "bcrypt";
import { pool } from "../config/database.js";

async function main() {
  const hash = await bcrypt.hash("admin123", 12);

  await pool.query(
    `UPDATE pengguna SET kata_sandi_hash = $1 WHERE nama_pengguna = 'mimici-bogor'`,
    [hash],
  );

  await pool.query(
    `INSERT INTO pengguna (nama_pengguna, email, kata_sandi_hash, peran, status_akun)
     VALUES ('admin', 'admin@mimici.com', $1, 'admin', 'aktif')
     ON CONFLICT (nama_pengguna) DO UPDATE SET kata_sandi_hash = EXCLUDED.kata_sandi_hash`,
    [hash],
  );

  const empHash = await bcrypt.hash("karyawan123", 12);
  await pool.query(
    `UPDATE pengguna SET kata_sandi_hash = $1 WHERE peran = 'karyawan'`,
    [empHash],
  );

  console.log("Admin and employee passwords updated successfully.");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
