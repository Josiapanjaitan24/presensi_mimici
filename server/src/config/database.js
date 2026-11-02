import pg from "pg";
import "dotenv/config";

const { Pool } = pg;

const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      options: "-c timezone=Asia/Jakarta",
    }
  : {
      host: process.env.DB_HOST || "localhost",
      port: Number(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME || "presensi_mimici",
      user: process.env.DB_USER || "postgres",
      password: process.env.DB_PASSWORD || "",
      options: "-c timezone=Asia/Jakarta",
    };

export const pool = new Pool(poolConfig);

pool.on("error", (error) => {
  console.error(
    "Terjadi kesalahan pada koneksi PostgreSQL:",
    error.message,
  );
});
