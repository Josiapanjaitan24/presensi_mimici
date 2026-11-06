# Rencana & Implementasi Pengembangan Keamanan Presensi Mimici
## Pencegahan Kecurangan Presensi (Titip Absen & Berbagi Akun)

---

### 1. Latar Belakang Masalah (Threat Analysis)

Pada sistem presensi sebelumnya, terdapat potensi celah keamanan operasional yang kritis:
1. **Berbagi Kredensial (Account Sharing / Titip Absen)**:
   - Karyawan A yang terlambat atau tidak hadir dapat memberikan *username* dan *password*-nya kepada Karyawan B yang sudah berada di cabang/outlet.
   - Karyawan B kemudian *login* menggunakan akun Karyawan A dan melakukan absensi atas nama Karyawan A.
2. **Ketiadaan Validasi Visual untuk Administrator**:
   - Sistem lama menyimpan data foto ke dalam kolom teks `catatan` dalam bentuk string JSON. Saat karyawan melakukan absensi pulang, data tersebut rawan rusak akibat penggabungan string (`catatan || ' ' || ...`).
   - Pada Dashboard Admin, foto selfie absensi **tidak ditampilkan sama sekali** di tabel monitoring presensi, sehingga Admin tidak memiliki mekanisme untuk memverifikasi apakah orang yang melakukan absensi adalah karyawan yang bersangkutan atau rekannya.
3. **Ketiadaan Audit Trail Perangkat**:
   - Sistem tidak mencatat identitas perangkat atau browser yang digunakan saat absensi dilakukan.

---

### 2. Strategi Arsitektur Pertahanan Berlapis (Defense-in-Depth)

Untuk mengatasi permasalahan di atas secara menyeluruh tanpa mengganggu alur operasional karyawan, sistem ditingkatkan melalui 4 pilar keamanan utama:

```
+-----------------------------------------------------------------------------------+
|                        1. INTEGRITAS KAMERA (FRONTEND)                           |
|  - Kamera wajib aktif (real-time stream).                                        |
|  - Digital Watermarking langsung ke kanvas foto (Cabang, Tanggal, Jam WIB).      |
|  - Kompresi adaptif 480x360 px @ 0.70 JPEG (menghemat 75% ukuran payload).       |
|  - Notifikasi kepatuhan anti-fraud kepada karyawan.                               |
+-----------------------------------------+-----------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                        2. PENGAMANAN & AUDIT DATA (BACKEND)                       |
|  - Kolom database terdedikasi: foto_masuk, foto_pulang, device_info.              |
|  - Deteksi Duplikasi Perangkat (Automated Fraud Detection):                       |
|    Mendeteksi jika 1 perangkat digunakan oleh >1 karyawan di tanggal yang sama.   |
+-----------------------------------------+-----------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                     3. VERIFIKASI VISUAL ADMIN (DASHBOARD)                       |
|  - Tombol Aksi Kamera di sebelah kanan card/baris presensi karyawan.              |
|  - Kolom status 'Bukti Foto' di tabel Monitoring Presensi.                       |
|  - Badge Peringatan Otomatis: "⚠️ Perangkat Ganda" jika terindikasi titip absen.  |
|  - Modal Verifikasi Foto Beresolusi Tinggi (Foto Masuk vs Pulang + Info Device).   |
+-----------------------------------------------------------------------------------+
```

---

### 3. Rincian Perubahan Database

Tabel `absensi` diperbarui dengan menambahkan tiga kolom baru untuk menjamin integritas data foto dan metadata audit perangkat:

```sql
-- Dijalankan melalui script migrasi terisolasi
ALTER TABLE absensi 
ADD COLUMN IF NOT EXISTS foto_masuk TEXT,
ADD COLUMN IF NOT EXISTS foto_pulang TEXT,
ADD COLUMN IF NOT EXISTS device_info TEXT;
```

#### Deskripsi Kolom:
- **`foto_masuk` (TEXT)**: Menyimpan representasi Base64 Data URL foto wajah karyawan saat melakukan absensi masuk.
- **`foto_pulang` (TEXT)**: Menyimpan representasi Base64 Data URL foto wajah karyawan saat melakukan absensi pulang.
- **`device_info` (TEXT)**: Menyimpan informasi User-Agent perangkat/browser yang digunakan saat transaksi absensi dikirim.

*Migrasi dijalankan menggunakan script:* `server/src/scripts/migrateAttendancePhotos.mjs`.

---

### 4. Rincian Perubahan Backend API

#### A. Endpoint Karyawan (`server/src/routes/employeeRoutes.js`)
1. **Clock-In (`POST /api/employee/attendance/clock-in`)**:
   - Mengambil header `User-Agent` dari request (`req.headers['user-agent']`).
   - Menyimpan foto ke kolom `foto_masuk` dan user-agent ke kolom `device_info`.
   - Menghilangkan penyimpanan foto di kolom `catatan`, sehingga kolom catatan tetap bersih untuk catatan kerja/alasan dispensasi.
2. **Clock-Out (`POST /api/employee/attendance/clock-out`)**:
   - Memperbarui kolom `foto_pulang` dan memperbarui `device_info` dengan perangkat saat pulang.
3. **Query Dashboard & Riwayat (`GET /api/employee/dashboard`, `GET /api/employee/attendance`)**:
   - Menyertakan kolom `foto_masuk` dan `foto_pulang` dalam hasil query JSON untuk verifikasi status absensi karyawan.

#### B. Endpoint Administrator (`server/src/routes/adminRoutes.js`)
1. **Monitoring Presensi (`GET /api/admin/attendance`)**:
   - Query SQL diperkaya dengan *Correlated Subquery* untuk mendeteksi kecurangan secara otomatis:
   ```sql
   EXISTS (
     SELECT 1 FROM absensi a2
     WHERE a2.tanggal_absensi = a.tanggal_absensi
       AND a2.device_info = a.device_info
       AND a2.id_karyawan <> a.id_karyawan
       AND a.device_info IS NOT NULL
   ) AS indikasi_titip_absen
   ```
   - **Logika Algoritma**: Jika perangkat (User-Agent) yang sama persis digunakan oleh **dua atau lebih akun karyawan berbeda pada tanggal kerja yang sama**, record tersebut otomatis diberi flag `indikasi_titip_absen = true`.

---

### 5. Rincian Perubahan Frontend

#### A. Dashboard Karyawan (`client/src/pages/KaryawanDashboard.jsx`)
1. **Digital Watermarking pada Kanvas Kamera**:
   - Sebelum foto dikirim ke backend, sistem menggambar pita watermark semi-transparan di bagian bawah foto.
   - Watermark mencantumkan teks audit:
     - `PRESENSI MIMICI - [NAMA CABANG]`
     - `VERIFIKASI WAJAH • [TANGGAL] [JAM:MENIT:DETIK] WIB`
   - **Manfaat**: Mencegah karyawan mengarahkan kamera ke layar monitor/foto cetak lama, karena waktu dan detik absensi tertera permanen pada hasil jepretan kamera.
2. **Kompresi Citra Efisien**:
   - Resolusi kanvas kamera disesuaikan ke dimensi optimal **480x360 piksel** dengan rasio kompresi JPEG 0.70. Ukuran file turun dari ~85 KB menjadi hanya **~20-25 KB**, sangat ringan untuk jaringan seluler.
3. **Banner Edukasi Anti-Kecurangan**:
   - Menampilkan pesan panduan visual di atas tampilan kamera: *"Pastikan wajah terlihat jelas dan berada di outlet. Sistem merekam foto dan sidik perangkat untuk mencegah titip absen."*

#### B. Dashboard Admin (`client/src/pages/AdminDashboard.jsx` & `client/src/pages/Dashboard.css`)
1. **Tombol Aksi di Sebelah Kanan Baris / Card Presensi**:
   - Pada kolom **Aksi** di sisi paling kanan tabel monitoring presensi (serta mini-tabel pada Dashboard Overview), kini tersedia **Tombol Aksi Kamera (Lihat Foto)** berwarna biru dengan ikon kamera.
   - Memungkinkan Administrator menginspeksi foto bukti kehadiran hanya dengan 1 kali klik langsung dari kolom aksi di sebelah kanan.
2. **Kolom "Bukti Foto" & Indikator Status**:
   - Menampilkan tombol **"Lihat Foto (Masuk & Pulang)"** serta badge peringatan merah **`⚠️ Perangkat Ganda`** jika terdeteksi indikasi titip absen.
3. **Modal Verifikasi Foto Presensi Beresolusi Tinggi**:
   - Menampilkan komparasi foto Masuk vs Pulang dalam kartu berdampingan.
   - Dilengkapi status kehadiran, cabang, jam masuk, jam pulang, dan catatan.
   - Menampilkan informasi perangkat/browser yang digunakan (*User-Agent*).
   - Jika terdapat indikasi perangkat ganda, modal menampilkan kartu peringatan tegas:
     > **⚠️ Terdeteksi Indikasi Titip Absen / Berbagi Perangkat:** Perangkat ini juga digunakan untuk melakukan absensi karyawan lain pada tanggal yang sama. Mohon verifikasi kesesuaian wajah karyawan pada foto di atas.

---

### 6. Analisis Sizing Sistem: Apakah Terlalu Berat?

Pertanyaan mendasar: *"Apakah penambahan foto selfie ini akan membuat sistem terlalu berat?"*

Mari kita bedah secara teknis ke dalam dua aspek: **Kapasitas Database (Storage)** dan **Performa Jaringan / Kecepatan Web (Performance)**.

#### A. Perhitungan Kapasitas Penyimpanan (Storage Sizing)
Foto diambil menggunakan HTML5 Canvas dengan resolusi optimal **480x360 piksel** (JPEG Quality 0.70):
* **Ukuran 1 Foto Base64:** ~25 KB.
* **Per Karyawan per Hari:** 2 foto (Masuk & Pulang) = $\approx 50\text{ KB/hari}$.
* **Simulasi 15 Karyawan (Semua Cabang Mimici):**
  * **Per Hari:** $15 \times 50\text{ KB} = 750\text{ KB/hari}$.
  * **Per Bulan (26 Hari Kerja):** $750\text{ KB} \times 26 = \mathbf{\approx 19{,}5\text{ MB/bulan}}$.
  * **Per Tahun:** $19{,}5\text{ MB} \times 12 = \mathbf{\approx 234\text{ MB/tahun}}$.

> **Kesimpulan Storage:** **Sangat Ringan.** 
> Database modern (PostgreSQL) dapat menangani puluhan hingga ratusan Gigabyte. Tambahan ~230 MB per tahun sama sekali tidak membebani kapasitas server database.

#### B. Analisis Performa & Kecepatan Website (Web Performance)
Terdapat satu risiko performa yang wajib diwaspadai jika data tidak dioptimasi:
* Jika tabel presensi memuat 500 riwayat dan seluruh foto Base64 dikirim sekaligus dalam satu respons API, ukuran JSON bisa mencapai $500 \times 50\text{ KB} = 25\text{ MB}$.
* Mengirim 25 MB teks JSON sekaligus dapat menyebabkan browser admin terasa sedikit lambat saat membuka halaman.

#### C. Solusi Optimasi yang Telah Diterapkan:
1. **Client-Side Compression:** Mengurangi ukuran foto dari 640x480 (85 KB) menjadi 480x360 (25 KB), memangkas beban hingga 70-75% tanpa mengurangi keterbacaan wajah.
2. **Filter Periode Tanggal Default:** Dashboard admin secara default menampilkan filter tanggal berjalan, sehingga data yang ditarik per request hanya berkisar puluhan rekaman (hanya ~1-2 MB total transfer).

---

### 7. Panduan Verifikasi Operasional bagi Administrator

Bagi Manajemen dan Tim Administrator Mimici, prosedur verifikasi kecurangan kini sangat mudah:
1. Masuk ke **Admin Dashboard** -> Buka tab **Monitoring Presensi**.
2. Perhatikan baris presensi yang memiliki tanda **`⚠️ Perangkat Ganda`**.
3. Klik **Tombol Aksi Kamera** di sebelah kanan baris/card tersebut (atau tombol *"Lihat Foto"* di kolom Bukti Foto).
4. Periksa foto wajah yang tampil:
   - Apakah wajah pada foto benar-benar wajah karyawan bersangkutan?
   - Apakah foto masuk dan foto pulang menunjukkan orang yang sama?
   - Jika foto menampilkan wajah rekan kerjanya, benda mati, atau foto yang dipegang di depan kamera, administrator memiliki bukti otentik untuk memberikan sanksi tegas atas pelanggaran titip absen.

---

### 8. Rekomendasi Roadmap Pengembangan Lanjutan (Opsional)

Untuk memperkuat sistem presensi di masa depan, berikut adalah rekomendasi fitur lanjutan yang dapat dipertimbangkan:

| No | Rekomendasi Fitur | Mekanisme Kerja | Nilai Tambah |
|---|---|---|---|
| 1 | **Cloud Object Storage (S3 / Cloudinary)** | Menyimpan file foto di bucket cloud terpisah dan hanya menyimpan URL link pendek di PostgreSQL. | Ideal jika karyawan berkembang menjadi ratusan staf. |
| 2 | **AI Face Recognition & Liveness Detection** | Mengintegrasikan model Face Detection (misal: `face-api.js` / MediaPipe) untuk memastikan subjek di depan kamera berkedip / tersenyum (bukan foto diam). | Mencegah penipuan menggunakan foto cetak atau foto HP. |
| 3 | **Geofencing GPS Radius** | Memeriksa koordinat lintang-bujur (*latitude-longitude*) karyawan via `navigator.geolocation` terhadap radius outlet (misal maks 50 meter). | Memastikan karyawan secara fisik berada di area cabang saat klik absen. |
| 4 | **Single Active Session Token** | Saat akun login di perangkat baru, sesi login di perangkat lama otomatis di-invalidaasi (*force logout*). | Mempersulit karyawan berganti-ganti akun di handphone yang sama. |
| 5 | **Wi-Fi BSSID / Network Validation** | Mengizinkan absensi hanya bila request dikirimkan melalui IP Public atau jaringan Wi-Fi resmi cabang Mimici. | Menjamin absensi hanya bisa dilakukan di dalam outlet. |

---

*Dokumen ini merupakan dokumentasi teknis dan operasional resmi sistem keamanan Presensi Mimici.*
