CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS pengguna (
  id_pengguna BIGSERIAL PRIMARY KEY,
  nama_pengguna VARCHAR(80) NOT NULL UNIQUE,
  email VARCHAR(160) NOT NULL UNIQUE,
  kata_sandi_hash TEXT NOT NULL,
  peran VARCHAR(20) NOT NULL CHECK (peran IN ('admin', 'karyawan')),
  status_akun VARCHAR(20) NOT NULL DEFAULT 'aktif' CHECK (status_akun IN ('aktif', 'nonaktif')),
  dibuat_pada TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  diperbarui_pada TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS karyawan (
  id_karyawan BIGSERIAL PRIMARY KEY,
  id_pengguna BIGINT NOT NULL UNIQUE REFERENCES pengguna(id_pengguna) ON DELETE CASCADE,
  nip VARCHAR(50) NOT NULL UNIQUE,
  nama_lengkap VARCHAR(160) NOT NULL,
  nomor_telepon VARCHAR(30),
  tanggal_bergabung DATE,
  status_karyawan VARCHAR(20) NOT NULL DEFAULT 'aktif' CHECK (status_karyawan IN ('aktif', 'nonaktif')),
  dibuat_pada TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  diperbarui_pada TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cabang (
  id_cabang BIGSERIAL PRIMARY KEY,
  kode_cabang VARCHAR(30) NOT NULL UNIQUE,
  nama_cabang VARCHAR(100) NOT NULL UNIQUE,
  alamat TEXT,
  tautan_google_maps TEXT,
  latitude NUMERIC(10,7) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude NUMERIC(10,7) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  radius_meter INTEGER NOT NULL DEFAULT 100 CHECK (radius_meter > 0),
  kode_qr VARCHAR(120),
  status_cabang VARCHAR(20) NOT NULL DEFAULT 'aktif' CHECK (status_cabang IN ('aktif', 'nonaktif')),
  dibuat_pada TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  diperbarui_pada TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS penempatan_karyawan (
  id_penempatan BIGSERIAL PRIMARY KEY,
  id_karyawan BIGINT NOT NULL REFERENCES karyawan(id_karyawan) ON DELETE CASCADE,
  id_cabang BIGINT NOT NULL REFERENCES cabang(id_cabang) ON DELETE RESTRICT,
  id_jadwal BIGINT,
  tanggal_mulai DATE NOT NULL DEFAULT CURRENT_DATE,
  tanggal_selesai DATE,
  dibuat_pada TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (tanggal_selesai IS NULL OR tanggal_selesai >= tanggal_mulai)
);

CREATE TABLE IF NOT EXISTS jadwal_kerja (
  id_jadwal BIGSERIAL PRIMARY KEY,
  kode_jadwal VARCHAR(50) NOT NULL UNIQUE,
  nama_jadwal VARCHAR(100) NOT NULL,
  jam_mulai TIME NOT NULL,
  jam_selesai TIME,
  toleransi_menit INTEGER NOT NULL DEFAULT 10 CHECK (toleransi_menit >= 0),
  aktif BOOLEAN NOT NULL DEFAULT TRUE,
  dibuat_pada TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  diperbarui_pada TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_penempatan_jadwal'
  ) THEN
    ALTER TABLE penempatan_karyawan
      ADD CONSTRAINT fk_penempatan_jadwal
      FOREIGN KEY (id_jadwal) REFERENCES jadwal_kerja(id_jadwal) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS jadwal_umum_cabang (
  id_jadwal_umum BIGSERIAL PRIMARY KEY,
  id_cabang BIGINT NOT NULL REFERENCES cabang(id_cabang) ON DELETE CASCADE,
  hari SMALLINT NOT NULL CHECK (hari BETWEEN 0 AND 6),
  id_jadwal BIGINT REFERENCES jadwal_kerja(id_jadwal) ON DELETE SET NULL,
  jam_mulai TIME NOT NULL,
  jam_selesai TIME,
  toleransi_menit INTEGER NOT NULL DEFAULT 10 CHECK (toleransi_menit >= 0),
  hari_libur BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (id_cabang, hari, id_jadwal)
);

CREATE TABLE IF NOT EXISTS absensi (
  id_absensi BIGSERIAL PRIMARY KEY,
  id_karyawan BIGINT NOT NULL REFERENCES karyawan(id_karyawan) ON DELETE CASCADE,
  id_cabang BIGINT NOT NULL REFERENCES cabang(id_cabang) ON DELETE RESTRICT,
  id_jadwal BIGINT REFERENCES jadwal_kerja(id_jadwal) ON DELETE SET NULL,
  tanggal DATE NOT NULL,
  waktu_masuk TIMESTAMPTZ,
  waktu_pulang TIMESTAMPTZ,
  status_kehadiran VARCHAR(30) NOT NULL DEFAULT 'hadir',
  menit_terlambat INTEGER NOT NULL DEFAULT 0 CHECK (menit_terlambat >= 0),
  potongan NUMERIC(14,2) NOT NULL DEFAULT 0,
  latitude_masuk NUMERIC(10,7), longitude_masuk NUMERIC(10,7),
  latitude_pulang NUMERIC(10,7), longitude_pulang NUMERIC(10,7),
  foto_masuk TEXT, foto_pulang TEXT,
  dibuat_pada TIMESTAMPTZ NOT NULL DEFAULT NOW(), diperbarui_pada TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id_karyawan, tanggal)
);

CREATE TABLE IF NOT EXISTS pengajuan (
  id_pengajuan BIGSERIAL PRIMARY KEY,
  id_karyawan BIGINT NOT NULL REFERENCES karyawan(id_karyawan) ON DELETE CASCADE,
  jenis VARCHAR(20) NOT NULL CHECK (jenis IN ('izin', 'sakit')),
  tanggal_mulai DATE NOT NULL, tanggal_selesai DATE NOT NULL,
  alasan TEXT NOT NULL, dokumen_url TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'menunggu' CHECK (status IN ('menunggu', 'disetujui', 'ditolak')),
  dibuat_pada TIMESTAMPTZ NOT NULL DEFAULT NOW(), diperbarui_pada TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (tanggal_selesai >= tanggal_mulai)
);

CREATE TABLE IF NOT EXISTS riwayat_keputusan_pengajuan (
  id_riwayat BIGSERIAL PRIMARY KEY, id_pengajuan BIGINT NOT NULL REFERENCES pengajuan(id_pengajuan) ON DELETE CASCADE,
  id_pengguna BIGINT NOT NULL REFERENCES pengguna(id_pengguna), keputusan VARCHAR(20) NOT NULL,
  catatan TEXT, dibuat_pada TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS riwayat_koreksi (
  id_riwayat BIGSERIAL PRIMARY KEY, id_absensi BIGINT NOT NULL REFERENCES absensi(id_absensi) ON DELETE CASCADE,
  id_pengguna BIGINT NOT NULL REFERENCES pengguna(id_pengguna), data_sebelum JSONB NOT NULL,
  data_sesudah JSONB NOT NULL, alasan TEXT NOT NULL, dibuat_pada TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS aturan_potongan (
  id_aturan BIGSERIAL PRIMARY KEY, kondisi VARCHAR(30) NOT NULL UNIQUE,
  nominal NUMERIC(14,2) NOT NULL CHECK (nominal >= 0), satuan VARCHAR(20) NOT NULL,
  aktif BOOLEAN NOT NULL DEFAULT TRUE, dibuat_pada TIMESTAMPTZ NOT NULL DEFAULT NOW(), diperbarui_pada TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_absensi_tanggal ON absensi(tanggal);
CREATE INDEX IF NOT EXISTS idx_absensi_karyawan ON absensi(id_karyawan, tanggal);
CREATE INDEX IF NOT EXISTS idx_penempatan_aktif ON penempatan_karyawan(id_karyawan, tanggal_mulai, tanggal_selesai);
CREATE INDEX IF NOT EXISTS idx_pengajuan_status ON pengajuan(status);

INSERT INTO aturan_potongan (kondisi, nominal, satuan) VALUES
  ('izin', 65000, 'hari'), ('sakit', 0, 'hari'), ('alfa', 100000, 'hari'), ('terlambat', 1000, 'menit')
ON CONFLICT (kondisi) DO NOTHING;

INSERT INTO jadwal_kerja (kode_jadwal, nama_jadwal, jam_mulai, jam_selesai, toleransi_menit) VALUES
  ('REGULER', 'Reguler', '10:00', '22:00', 10), ('PAKUAN_PAGI', 'Pakuan Shift Pagi', '09:00', '14:00', 10), ('PAKUAN_SIANG', 'Pakuan Shift Siang', '14:00', '22:00', 10)
ON CONFLICT (kode_jadwal) DO NOTHING;

INSERT INTO cabang (kode_cabang, nama_cabang, latitude, longitude, radius_meter) VALUES
  ('PAKUAN', 'Pakuan', -6.5950000, 106.8000000, 100),
  ('BOTANI', 'Botani', -6.6020000, 106.8060000, 100),
  ('AZIMAR', 'Azimar', -6.5900000, 106.7900000, 100),
  ('ATS', 'ATS', -6.5800000, 106.8100000, 100),
  ('WARUNG_NANGKA', 'Warung Nangka', -6.5700000, 106.8200000, 100),
  ('CIAPUS', 'Ciapus', -6.6500000, 106.7500000, 100)
ON CONFLICT (kode_cabang) DO NOTHING;

INSERT INTO jadwal_umum_cabang (id_cabang, hari, id_jadwal, jam_mulai, jam_selesai, toleransi_menit)
SELECT c.id_cabang, hari.n, j.id_jadwal, j.jam_mulai, j.jam_selesai, j.toleransi_menit
FROM cabang c CROSS JOIN generate_series(1, 6) AS hari(n)
JOIN jadwal_kerja j ON j.kode_jadwal = CASE WHEN c.kode_cabang = 'PAKUAN' THEN 'PAKUAN_PAGI' ELSE 'REGULER' END
ON CONFLICT (id_cabang, hari, id_jadwal) DO NOTHING;

INSERT INTO jadwal_umum_cabang (id_cabang, hari, id_jadwal, jam_mulai, jam_selesai, toleransi_menit)
SELECT c.id_cabang, hari.n, j.id_jadwal, j.jam_mulai, j.jam_selesai, j.toleransi_menit
FROM cabang c CROSS JOIN generate_series(1, 6) AS hari(n)
JOIN jadwal_kerja j ON c.kode_cabang = 'PAKUAN' AND j.kode_jadwal = 'PAKUAN_SIANG'
ON CONFLICT (id_cabang, hari, id_jadwal) DO NOTHING;
