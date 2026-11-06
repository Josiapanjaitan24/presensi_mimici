import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const { pool } = await import('../config/database.js');

async function migrate() {
  console.log("=== MEMULAI MIGRASI PENYIMPANAN FOTO PRESENSI ===");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Tambah kolom foto_masuk, foto_pulang, dan device_info pada tabel absensi
    await client.query(`
      ALTER TABLE absensi
      ADD COLUMN IF NOT EXISTS foto_masuk TEXT,
      ADD COLUMN IF NOT EXISTS foto_pulang TEXT,
      ADD COLUMN IF NOT EXISTS device_info TEXT;
    `);
    console.log("[OK] Kolom foto_masuk, foto_pulang, dan device_info berhasil dipastikan ada pada tabel absensi.");

    // 2. Migrasikan data lama dari kolom catatan jika sebelumnya tersimpan JSON foto
    const legacyRecords = await client.query(`
      SELECT id_absensi, catatan
      FROM absensi
      WHERE catatan LIKE '%foto_masuk%' OR catatan LIKE '%foto_pulang%'
    `);

    let migratedCount = 0;
    for (const row of legacyRecords.rows) {
      let fotoMasuk = null;
      let fotoPulang = null;
      try {
        // Coba ekstrak pola base64 foto_masuk dan foto_pulang jika ada
        const matchMasuk = row.catatan.match(/"foto_masuk"\s*:\s*"(data:image\/[^"]+)"/);
        if (matchMasuk) fotoMasuk = matchMasuk[1];

        const matchPulang = row.catatan.match(/"foto_pulang"\s*:\s*"(data:image\/[^"]+)"/);
        if (matchPulang) fotoPulang = matchPulang[1];

        if (fotoMasuk || fotoPulang) {
          await client.query(`
            UPDATE absensi
            SET foto_masuk = COALESCE(foto_masuk, $1),
                foto_pulang = COALESCE(foto_pulang, $2)
            WHERE id_absensi = $3
          `, [fotoMasuk, fotoPulang, row.id_absensi]);
          migratedCount++;
        }
      } catch (err) {
        console.warn(`Gagal memigrasikan catatan absensi ID ${row.id_absensi}:`, err.message);
      }
    }
    console.log(`[OK] Selesai migrasi data riwayat foto lama: ${migratedCount} rekaman diperbarui.`);

    await client.query("COMMIT");
    console.log("=== MIGRASI DATABASE BERHASIL SELESAI ===");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Migrasi gagal:", err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();

