CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE penempatan_karyawan
  ADD COLUMN IF NOT EXISTS id_jadwal BIGINT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_penempatan_jadwal'
  ) THEN
    ALTER TABLE penempatan_karyawan
      ADD CONSTRAINT fk_penempatan_jadwal
      FOREIGN KEY (id_jadwal) REFERENCES jadwal_kerja(id_jadwal) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ex_penempatan_karyawan_periode'
  ) THEN
    ALTER TABLE penempatan_karyawan
      ADD CONSTRAINT ex_penempatan_karyawan_periode
      EXCLUDE USING gist (
        id_karyawan WITH =,
        daterange(
          tanggal_mulai,
          CASE
            WHEN tanggal_selesai IS NULL THEN NULL
            ELSE tanggal_selesai + 1
          END,
          '[)'
        ) WITH &&
      );
  END IF;
END $$;
