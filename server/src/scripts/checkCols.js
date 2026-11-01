import { pool } from "../config/database.js";

async function check() {
  const cons = await pool.query(`
    SELECT conname, pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname IN ('absensi', 'jadwal_kerja') AND contype = 'c'
  `);
  console.log('CHECK DEFINITIONS:', cons.rows);
  await pool.end();
}
check();
