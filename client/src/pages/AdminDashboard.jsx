import "./Dashboard.css";

export default function AdminDashboard() {
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
          <h1>Dashboard Admin</h1>
        </div>

        <button onClick={handleLogout}>Keluar</button>
      </header>

      <section className="dashboard-welcome">
        <h2>Selamat datang, {pengguna?.nama_pengguna || "Admin"}!</h2>
        <p>Login berhasil. Anda masuk sebagai administrator.</p>
        <span className="dashboard-status">Administrator</span>
      </section>

      <section className="dashboard-grid">
        <article className="dashboard-card">
          <h3>Data Karyawan</h3>
          <p>Kelola akun dan data karyawan Mimici.</p>
          <span>Segera tersedia</span>
        </article>

        <article className="dashboard-card">
          <h3>Data Cabang</h3>
          <p>Kelola enam cabang operasional Mimici.</p>
          <span>Segera tersedia</span>
        </article>

        <article className="dashboard-card">
          <h3>Jadwal Kerja</h3>
          <p>Atur jadwal dan shift karyawan.</p>
          <span>Segera tersedia</span>
        </article>

        <article className="dashboard-card">
          <h3>Data Absensi</h3>
          <p>Pantau kehadiran dan keterlambatan.</p>
          <span>Segera tersedia</span>
        </article>

        <article className="dashboard-card">
          <h3>Pengajuan</h3>
          <p>Tinjau pengajuan izin dan sakit.</p>
          <span>Segera tersedia</span>
        </article>

        <article className="dashboard-card">
          <h3>Laporan</h3>
          <p>Siapkan rekap absensi dan potongan.</p>
          <span>Segera tersedia</span>
        </article>
      </section>
    </main>
  );
}