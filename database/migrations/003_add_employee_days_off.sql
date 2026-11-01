-- 003_add_employee_days_off.sql
-- Menambahkan kolom hari_libur pada tabel karyawan untuk mendukung pengaturan hari libur mingguan per karyawan.

ALTER TABLE karyawan 
  ADD COLUMN IF NOT EXISTS hari_libur TEXT[] DEFAULT '{}';

-- Komentar kolom
COMMENT ON COLUMN karyawan.hari_libur IS 'Daftar nama hari libur mingguan karyawan, contoh: ARRAY[''Senin'', ''Kamis'']';
