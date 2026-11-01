
import pg from "pg";
import "dotenv/config";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  options: "-c timezone=Asia/Jakarta",
});

pool.on("error", (error) => {
  console.error(
    "Terjadi kesalahan pada koneksi PostgreSQL:",
    error.message,
  );
});