import { useState, useEffect } from "react";
import "./Dashboard.css";

export default function AdminDashboard() {
  const pengguna = JSON.parse(
    localStorage.getItem("pengguna") || "null",
  );

  const [currentTime, setCurrentTime] = useState(new Date());
  const [isClockModalOpen, setIsClockModalOpen] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape") setIsClockModalOpen(false);
    }
    if (isClockModalOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isClockModalOpen]);

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("pengguna");
    window.location.href = "/";
  }

  // Tanggal format Indonesia
  const tanggalHariIni = currentTime.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const jamSekarang = currentTime.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const seconds = currentTime.getSeconds();
  const minutes = currentTime.getMinutes();
  const hours = currentTime.getHours();

  const secDeg = seconds * 6;
  const minDeg = minutes * 6 + seconds * 0.1;
  const hourDeg = (hours % 12) * 30 + minutes * 0.5;

  // Modul pengelolaan sesuai sistem Presensi Mimici
  const modules = [
    {
      title: "Data Karyawan",
      desc: "Kelola data induk, NIP, akun pengguna, dan penempatan cabang.",
      color: "blue",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      ),
    },
    {
      title: "Data Cabang",
      desc: "Atur informasi dan radius GPS cabang operasional Mimici.",
      color: "emerald",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      ),
    },
    {
      title: "Jadwal & Shift Kerja",
      desc: "Atur rotasi kerja, shift pagi/malam, dan kalender operasional.",
      color: "indigo",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      ),
    },
    {
      title: "Monitoring Presensi",
      desc: "Pantau log absensi harian, foto presensi, dan status kehadiran real-time.",
      color: "amber",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      ),
    },
    {
      title: "Pengajuan Izin & Sakit",
      desc: "Tinjau, setujui, atau tolak permohonan izin karyawan berserta bukti surat.",
      color: "rose",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      ),
    },
    {
      title: "Laporan & Rekap",
      desc: "Unduh rekap kehadiran bulanan, keterlambatan, dan data potongan gaji.",
      color: "teal",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      ),
    },
  ];


  return (
    <div className="admin-layout">
      {/* Top Navigation Bar */}
      <header className="admin-navbar">
        {/* Left: Brand Capsule */}
        <div className="navbar-brand-capsule">
          <div className="brand-logo-icon">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 19V5l8 7 8-7v14" />
            </svg>
          </div>
          <div className="brand-divider" />
          <div className="brand-info">
            <span className="brand-name">Mimici</span>
            <span className="brand-sub">Presensi</span>
          </div>
        </div>

        {/* Center: Precision Clock & Date Capsule (Clickable for iOS-style popout) */}
        <button
          type="button"
          className="navbar-clock-capsule"
          onClick={() => setIsClockModalOpen(true)}
          title="Klik untuk membuka jam detail"
          aria-haspopup="dialog"
          aria-expanded={isClockModalOpen}
        >
          <div className="capsule-analog-clock" aria-label="Jam Analog">
            {/* Angka penanda jam (12, 3, 6, 9) */}
            <span className="capsule-num num-12">12</span>
            <span className="capsule-num num-3">3</span>
            <span className="capsule-num num-6">6</span>
            <span className="capsule-num num-9">9</span>

            {/* Jarum jam */}
            <div
              className="capsule-hand hand-hour"
              style={{ transform: `translateX(-50%) rotate(${hourDeg}deg)` }}
            />
            {/* Jarum menit */}
            <div
              className="capsule-hand hand-minute"
              style={{ transform: `translateX(-50%) rotate(${minDeg}deg)` }}
            />
            {/* Jarum detik */}
            <div
              className="capsule-hand hand-second"
              style={{ transform: `translateX(-50%) rotate(${secDeg}deg)` }}
            />
            {/* Poros tengah */}
            <div className="capsule-pin" />
          </div>

          <div className="capsule-divider" />

          <div className="capsule-info">
            <div className="capsule-time-row">
              <span className="capsule-time">{jamSekarang}</span>
              <span className="capsule-timezone">WIB</span>
            </div>
            <span className="capsule-date">{tanggalHariIni}</span>
          </div>
        </button>

        {/* Unified Admin Account Capsule */}
        <div className="navbar-account-capsule">
          <div className="account-profile-section">
            <div className="account-avatar">
              {pengguna?.nama_pengguna ? pengguna.nama_pengguna.charAt(0).toUpperCase() : "A"}
            </div>
            <div className="account-details">
              <span className="account-name">{pengguna?.nama_pengguna || "Admin Mimici"}</span>
            </div>
          </div>

          <div className="account-divider" />

          <button
            className="account-logout-btn"
            onClick={handleLogout}
            title="Keluar dari sesi ini"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span>Keluar</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="admin-main">
        {/* Management Modules */}
        <section className="modules-section">
          <div className="modules-grid">
            {modules.map((mod, idx) => (
              <article key={idx} className="module-card">
                <div className="module-card-top">
                  <div className={`module-icon icon-${mod.color}`}>{mod.icon}</div>
                </div>
                <h3>{mod.title}</h3>
                <p>{mod.desc}</p>
                <button
                  className="module-action-btn"
                  onClick={() => alert(`Modul ${mod.title} sedang disiapkan.`)}
                >
                  <span>Buka Modul</span>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </button>
              </article>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="admin-footer">
        <p>Presensi Mimici &copy; {new Date().getFullYear()} &middot; Sistem Manajemen Kehadiran Multi-Cabang</p>
      </footer>

      {/* iOS Style Clock Popout Modal */}
      {isClockModalOpen && (
        <div
          className="clock-modal-backdrop"
          onClick={() => setIsClockModalOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="clock-modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              className="clock-modal-close-btn"
              onClick={() => setIsClockModalOpen(false)}
              aria-label="Tutup"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            {/* Apple / Swiss Style Large Analog Clock */}
            <div className="popout-clock-face">
              {/* Dial markings */}
              <span className="popout-num num-12">12</span>
              <span className="popout-num num-3">3</span>
              <span className="popout-num num-6">6</span>
              <span className="popout-num num-9">9</span>

              {/* Ticks for other hours */}
              <span className="popout-tick tick-1" />
              <span className="popout-tick tick-2" />
              <span className="popout-tick tick-4" />
              <span className="popout-tick tick-5" />
              <span className="popout-tick tick-7" />
              <span className="popout-tick tick-8" />
              <span className="popout-tick tick-10" />
              <span className="popout-tick tick-11" />

              {/* Hands */}
              <div
                className="popout-hand popout-hand-hour"
                style={{ transform: `translateX(-50%) rotate(${hourDeg}deg)` }}
              />
              <div
                className="popout-hand popout-hand-minute"
                style={{ transform: `translateX(-50%) rotate(${minDeg}deg)` }}
              />
              <div
                className="popout-hand popout-hand-second"
                style={{ transform: `translateX(-50%) rotate(${secDeg}deg)` }}
              />
              <div className="popout-pin" />
            </div>

            {/* Digital Time & Full Date */}
            <div className="popout-time-display">
              <span className="popout-digital-time">{jamSekarang}</span>
              <span className="popout-tz-badge">WIB</span>
            </div>
            <p className="popout-full-date">{tanggalHariIni}</p>
          </div>
        </div>
      )}
    </div>
  );
}
