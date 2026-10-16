
export default function KaryawanDashboard() {
  const pengguna = JSON.parse(
    localStorage.getItem("pengguna") || "null",
  );

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("pengguna");
    window.location.href = "/";
  }

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <div>
          <p className="dashboard-eyebrow">MIMICI</p>
          <h1>Dashboard Karyawan</h1>
        </div>

        <button onClick={handleLogout}>Keluar</button>
      </header>

      <section className="dashboard-welcome">
        <h2>Halo, {pengguna?.nama_pengguna || "Karyawan"}!</h2>
        <p>Login berhasil. Selamat datang di sistem presensi Mimici.</p>
        <span className="dashboard-status">Karyawan</span>
      </section>

      <section className="dashboard-grid">
        <article className="dashboard-card">
          <h3>Presensi Hari Ini</h3>
          <p>Fitur absen masuk dan pulang.</p>
          <span>Segera tersedia</span>
        </article>

        <article className="dashboard-card">
          <h3>Jadwal Kerja</h3>
          <p>Lihat jadwal dan shift kerja.</p>
          <span>Segera tersedia</span>
        </article>

        <article className="dashboard-card">
          <h3>Riwayat Absensi</h3>
          <p>Lihat catatan kehadiran sebelumnya.</p>
          <span>Segera tersedia</span>
        </article>

        <article className="dashboard-card">
          <h3>Pengajuan Izin dan Sakit</h3>
          <p>Ajukan izin atau laporkan sakit.</p>
          <span>Segera tersedia</span>
        </article>
      </section>
    </main>
  );
}