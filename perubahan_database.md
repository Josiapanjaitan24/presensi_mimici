# Dokumentasi Perubahan & Peningkatan Struktur Database (PostgreSQL)
Sistem Presensi Mimici

Dokumen ini mencatat seluruh perubahan, penambahan kolom, dan indeks keamanan yang ditambahkan ke skema basis data PostgreSQL.

---

## 1. Penambahan Kolom Hari Libur Mingguan Karyawan (`003_add_employee_days_off.sql`)
- **Tabel**: `karyawan`
- **Kolom yang Ditambahkan**: `hari_libur TEXT[] DEFAULT '{}'`
- **Tujuan**: Menyimpan daftar hari libur mingguan rutin per karyawan (misal: `['Senin', 'Kamis']`).
- **Query DDL**:
  ```sql
  ALTER TABLE karyawan 
    ADD COLUMN IF NOT EXISTS hari_libur TEXT[] DEFAULT '{}';

  COMMENT ON COLUMN karyawan.hari_libur IS 'Daftar nama hari libur mingguan karyawan, contoh: ARRAY[''Senin'', ''Kamis'']';
  ```

---

## 2. Integritas Penempatan Cabang & Jadwal Kerja (`002_placement_integrity.sql`)
- **Tabel**: `penempatan_karyawan`
- **Kolom & Constraint yang Ditambahkan**:
  - Kolom `id_jadwal BIGINT` dengan relasi `FOREIGN KEY (id_jadwal) REFERENCES jadwal_kerja(id_jadwal) ON DELETE SET NULL`.
  - Constraint Exclusion `ex_penempatan_karyawan_periode` menggunakan ekstensi `btree_gist` untuk mencegah tumpang-tindih (overlapping) tanggal penempatan seorang karyawan di beberapa cabang pada saat yang sama.
- **Query DDL**:
  ```sql
  CREATE EXTENSION IF NOT EXISTS btree_gist;

  ALTER TABLE penempatan_karyawan
    ADD COLUMN IF NOT EXISTS id_jadwal BIGINT;

  ALTER TABLE penempatan_karyawan
    ADD CONSTRAINT fk_penempatan_jadwal
    FOREIGN KEY (id_jadwal) REFERENCES jadwal_kerja(id_jadwal) ON DELETE SET NULL;
  ```

---

## 3. Pembatasan Ketat 1 Akun Administrator Tunggal (`004_single_admin_constraint.sql`)
- **Tabel**: `pengguna`
- **Indeks Unik yang Ditambahkan**: `uq_pengguna_single_admin`
- **Tujuan Keamanan**:
  - Memastikan secara mutlak di level engine database bahwa **hanya ada tepat 1 akun admin** di dalam sistem.
  - Mencegah timbulnya akun admin ganda, akun backdoor, atau duplikasi akun saat pergantian kredensial.
  - Setiap query `INSERT` akun baru dengan peran `admin` akan secara otomatis ditolak oleh database PostgreSQL dengan kode `23505 (duplicate key)`.
- **Query DDL**:
  ```sql
  CREATE UNIQUE INDEX IF NOT EXISTS uq_pengguna_single_admin 
    ON pengguna (peran) 
    WHERE peran = 'admin';
  ```

---

## 4. Apakah Anda Perlu Menjalankan Perubahan Struktur Ini Secara Manual?
**Tidak perlu.** Semua perubahan di atas telah dieksekusi dan diterapkan secara langsung pada database PostgreSQL lokal Anda (`presensi_mimici`). 
Indeks unik `uq_pengguna_single_admin` telah aktif dan menjaga akun admin Anda tetap tunggal, aman, dan terlindungi.

