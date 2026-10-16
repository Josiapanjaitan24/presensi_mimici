
import "dotenv/config";
import bcrypt from "bcrypt";
import { pool } from "../config/database.js";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const rl = createInterface({ input, output });

try {
  const namaPengguna = (
    await rl.question("Username admin: ")
  ).trim();

  const email = (
    await rl.question("Email admin: ")
  ).trim().toLowerCase();

  const kataSandi = await rl.question("Kata sandi admin: ");

  if (!namaPengguna || !email || !kataSandi) {
    throw new Error("Username, email, dan kata sandi wajib diisi.");
  }

  if (kataSandi.length < 12) {
    throw new Error("Gunakan kata sandi minimal 12 karakter.");
  }

  const hash = await bcrypt.hash(kataSandi, 12);

  const hasil = await pool.query(
    `INSERT INTO pengguna
       (nama_pengguna, email, kata_sandi_hash, peran, status_akun)
     VALUES ($1, $2, $3, 'admin', 'aktif')
     RETURNING id_pengguna, nama_pengguna, email, peran, status_akun`,
    [namaPengguna, email, hash],
  );

  console.log("\nAkun admin berhasil dibuat:");
  console.table(hasil.rows);
} catch (error) {
  if (error.code === "23505") {
    console.error("Username atau email sudah digunakan.");
  } else {
    console.error("Gagal membuat akun admin:", error.message);
  }

  process.exitCode = 1;
} finally {
  rl.close();
  await pool.end();
}