import "dotenv/config";
import bcrypt from "bcrypt";
import { pool } from "../config/database.js";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const rl = createInterface({ input, output });

async function main() {
  console.log("==========================================");
  console.log("    PENGGANTIAN AKUN ADMINISTRATOR        ");
  console.log("==========================================\n");

  try {
    const adminRes = await pool.query(
      "SELECT id_pengguna, nama_pengguna, email FROM pengguna WHERE peran = 'admin' ORDER BY id_pengguna LIMIT 1"
    );

    if (!adminRes.rows[0]) {
      console.log("Belum ada akun admin di database. Membuat akun admin baru...");
    } else {
      console.log("Akun admin saat ini:");
      console.log(`- ID       : ${adminRes.rows[0].id_pengguna}`);
      console.log(`- Username : ${adminRes.rows[0].nama_pengguna}`);
      console.log(`- Email    : ${adminRes.rows[0].email}\n`);
    }

    const usernameBaru = (await rl.question("Masukkan Username Admin Baru : ")).trim();
    const emailBaru = (await rl.question("Masukkan Email Admin Baru    : ")).trim().toLowerCase();
    const passwordBaru = await rl.question("Masukkan Password Admin Baru : ");

    if (!usernameBaru || !emailBaru || !passwordBaru) {
      throw new Error("Semua data (username, email, password) wajib diisi!");
    }

    if (passwordBaru.length < 6) {
      throw new Error("Password minimal 6 karakter.");
    }

    // Hash password dengan bcrypt salt 12
    const hash = await bcrypt.hash(passwordBaru, 12);

    if (adminRes.rows[0]) {
      const adminId = adminRes.rows[0].id_pengguna;

      // Update admin tunggal yang ada
      const updateRes = await pool.query(
        `UPDATE pengguna
         SET nama_pengguna = $1, email = $2, kata_sandi_hash = $3, status_akun = 'aktif', diperbarui_pada = NOW()
         WHERE id_pengguna = $4
         RETURNING id_pengguna, nama_pengguna, email, peran, status_akun`,
        [usernameBaru, emailBaru, hash, adminId]
      );

      // Hapus akun admin lain jika ada, agar admin dipastikan selalu HANYA 1
      await pool.query(
        "DELETE FROM pengguna WHERE peran = 'admin' AND id_pengguna != $1",
        [adminId]
      );

      console.log("\n Berhasil! Akun admin telah diperbarui:");
      console.table(updateRes.rows);
    } else {
      const insertRes = await pool.query(
        `INSERT INTO pengguna (nama_pengguna, email, kata_sandi_hash, peran, status_akun)
         VALUES ($1, $2, $3, 'admin', 'aktif')
         RETURNING id_pengguna, nama_pengguna, email, peran, status_akun`,
        [usernameBaru, emailBaru, hash]
      );

      console.log("\n Berhasil! Akun admin baru berhasil dibuat:");
      console.table(insertRes.rows);
    }

    console.log("\nAkun admin aktif sekarang (HANYA 1 AKUN):");
    const finalAdmins = await pool.query(
      "SELECT id_pengguna, nama_pengguna, email, peran, status_akun FROM pengguna WHERE peran = 'admin'"
    );
    console.table(finalAdmins.rows);
  } catch (err) {
    if (err.code === "23505") {
      console.error("\n Gagal: Username atau email tersebut sudah digunakan oleh akun karyawan lain.");
    } else {
      console.error("\n Gagal:", err.message);
    }
  } finally {
    rl.close();
    await pool.end();
  }
}

main();
