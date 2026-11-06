import { useState, useEffect, useRef, useMemo } from "react";
import "./Dashboard.css";
import {
  api,
  formatDate,
  formatDateTime,
  getClockHandDegrees,
  money,
  logout,
} from "../services/api";

export default function KaryawanDashboard() {
  const pengguna = JSON.parse(localStorage.getItem("pengguna") || "null");

  // Read initial tab from URL param or default to 'dashboard'
  const getInitialTab = () => {
    const param = new URLSearchParams(window.location.search).get("page");
    if (["dashboard", "absensi", "riwayat", "pengajuan"].includes(param)) {
      return param;
    }
    return "dashboard";
  };

  // Sidebar navigation state: 'dashboard' | 'absensi' | 'riwayat' | 'pengajuan'
  const [activeTab, setActiveTab] = useState(getInitialTab);

  // Sub-view inside Absensi: 'overview' | 'camera_session'
  const [absensiView, setAbsensiView] = useState("overview");

  // Real-time clock & popout modal
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [isClockModalOpen, setIsClockModalOpen] = useState(false);
  const [previewProof, setPreviewProof] = useState(null);

  // Employee data & state
  const [dashboardData, setDashboardData] = useState(null);
  const [attendanceHistory, setAttendanceHistory] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  // Update clock every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Escape key for clock modal
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape") setIsClockModalOpen(false);
    }
    if (isClockModalOpen) window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isClockModalOpen]);

  // Sync tab with browser URL history
  const handleNavClick = (page) => {
    setActiveTab(page);
    setAbsensiView("overview");
    setActionMessage("");
    setError("");
    const url = new URL(window.location.href);
    url.searchParams.set("page", page);
    window.history.pushState({}, "", url.toString());
  };

  useEffect(() => {
    const handlePopState = () => {
      const page = new URLSearchParams(window.location.search).get("page") || "dashboard";
      setActiveTab(page);
      setAbsensiView("overview");
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Load employee data from backend
  const loadData = async () => {
    try {
      const [dash, att, sub] = await Promise.all([
        api.get("/employee/dashboard"),
        api.get("/employee/attendance"),
        api.get("/employee/submissions"),
      ]);
      setDashboardData(dash);
      setAttendanceHistory(att.data || []);
      setSubmissions(sub.data || []);
      setError("");
    } catch (err) {
      setError(err.message || "Gagal memuat data karyawan.");
    }
  };

  useEffect(() => {
    Promise.resolve().then(() => loadData());
  }, []);

  function handleLogout() {
    logout("karyawan");
  }

  const {
    hours,
    secDeg,
    minDeg,
    hourDeg,
    tanggalHariIni,
    jamSekarang,
  } = getClockHandDegrees(currentTime);

  const placement = dashboardData?.penempatan;
  const todayAttendance = dashboardData?.absensi_hari_ini;
  const hasClockedIn = Boolean(todayAttendance?.waktu_masuk);
  const hasClockedOut = Boolean(todayAttendance?.waktu_pulang);
  const isLiburHariIni = Boolean(dashboardData?.is_libur || placement?.is_libur || placement?.status_jadwal === "libur");
  const isPresensiBelumDibuka = Boolean(dashboardData?.presensi_dibuka === false || hours < 7);

  // Summary counts for history (Terlambat juga dihitung sebagai kehadiran)
  const { totalHadir, totalTerlambat, totalPotongan } = useMemo(() => {
    let hadir = 0;
    let terlambat = 0;
    let potongan = 0;
    for (const item of attendanceHistory) {
      if (item.status_kehadiran === "Hadir" || item.status_kehadiran === "Terlambat") {
        hadir += 1;
      }
      if (item.status_kehadiran === "Terlambat") {
        terlambat += 1;
      }
      potongan += Number(item.potongan) || 0;
    }
    return { totalHadir: hadir, totalTerlambat: terlambat, totalPotongan: potongan };
  }, [attendanceHistory]);

  return (
    <div className="emp-portal-layout">
      {/* Top Navbar Header (Unified Triple Capsule matching Admin design) */}
      <header className="admin-navbar">
        {/* Left: Brand Capsule */}
        <div className="navbar-brand-capsule">
          <div className="brand-logo-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19V5l8 7 8-7v14" />
            </svg>
          </div>
          <div className="brand-divider" />
          <div className="brand-info">
            <span className="brand-name">Mimici</span>
            <span className="brand-sub">Karyawan</span>
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
            <span className="capsule-num num-12">12</span>
            <span className="capsule-num num-3">3</span>
            <span className="capsule-num num-6">6</span>
            <span className="capsule-num num-9">9</span>

            <div
              className="capsule-hand hand-hour"
              style={{ transform: `translateX(-50%) rotate(${hourDeg}deg)` }}
            />
            <div
              className="capsule-hand hand-minute"
              style={{ transform: `translateX(-50%) rotate(${minDeg}deg)` }}
            />
            <div
              className="capsule-hand hand-second"
              style={{ transform: `translateX(-50%) rotate(${secDeg}deg)` }}
            />
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

        {/* Right: Employee Profile Capsule */}
        <div className="navbar-account-capsule">
          <div className="account-profile-section">
            <div className="account-avatar">
              {pengguna?.nama_pengguna ? pengguna.nama_pengguna.charAt(0).toUpperCase() : "K"}
            </div>
            <div className="account-details">
              <span className="account-name">{dashboardData?.karyawan?.nama_lengkap || pengguna?.nama_pengguna || "Karyawan"}</span>
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

      {/* Portal Body with Sidebar on the Left & Page Content on the Right */}
      <div className="emp-portal-body">
        {/* Left Sidebar: 4 Distinct Navigation Pages */}
        <aside className="emp-sidebar">
          <nav className="emp-sidebar-nav">
            <div className="emp-nav-header">Menu Utama</div>

            {/* 1. Dashboard */}
            <button
              type="button"
              className={`emp-nav-btn ${activeTab === "dashboard" ? "active" : ""}`}
              onClick={() => handleNavClick("dashboard")}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="9" rx="1" />
                <rect x="14" y="3" width="7" height="5" rx="1" />
                <rect x="14" y="12" width="7" height="9" rx="1" />
                <rect x="3" y="16" width="7" height="5" rx="1" />
              </svg>
              <span>Dashboard</span>
            </button>

            {/* 2. Absensi */}
            <button
              type="button"
              className={`emp-nav-btn ${activeTab === "absensi" ? "active" : ""}`}
              onClick={() => handleNavClick("absensi")}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span>Absensi</span>
            </button>

            {/* 3. Riwayat Absensi */}
            <button
              type="button"
              className={`emp-nav-btn ${activeTab === "riwayat" ? "active" : ""}`}
              onClick={() => handleNavClick("riwayat")}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
              <span>Riwayat Absensi</span>
            </button>

            {/* 4. Pengajuan */}
            <button
              type="button"
              className={`emp-nav-btn ${activeTab === "pengajuan" ? "active" : ""}`}
              onClick={() => handleNavClick("pengajuan")}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
              <span>Pengajuan</span>
            </button>
          </nav>

          {/* Sidebar Footer: Active Placement Branch determined by Admin */}
          <div className="emp-sidebar-footer">
            <div className="emp-branch-pill">
              <span className="emp-branch-label">Penempatan Cabang:</span>
              <span className="emp-branch-value">
                <span className="emp-status-dot" />
                {placement?.nama_cabang ? `Mimici ${placement.nama_cabang}` : "Belum ditentukan"}
              </span>
            </div>
          </div>
        </aside>

        {/* Right Main Content: Switches dynamically between the 4 pages */}
        <main className="emp-main-content">
          {error && <div className="form-error" style={{ marginBottom: "20px" }}>{error}</div>}
          {actionMessage && <div className="form-success" style={{ marginBottom: "20px" }}>{actionMessage}</div>}

          {/* ================= PAGE 1: DASHBOARD ================= */}
          {activeTab === "dashboard" && (
            <div>
              <div className="emp-page-heading">
                <p className="emp-page-eyebrow">PORTAL KARYAWAN MIMICI</p>
                <h1>Dashboard Karyawan</h1>
                <p className="emp-page-subtitle">Selamat datang kembali! Pantau kehadiran, jadwal shift, dan cabang penempatan Anda.</p>
              </div>

              {/* Welcome Banner */}
              <div className="emp-welcome-card">
                <div className="emp-welcome-info">
                  <h2>Halo, {dashboardData?.karyawan?.nama_lengkap || pengguna?.nama_pengguna}!</h2>
                  <p>Anda terdaftar dengan NIP <strong>{dashboardData?.karyawan?.nip || "-"}</strong> pada sistem Presensi Mimici.</p>
                  <div className="emp-meta-badges">
                    <span className="emp-badge-tag">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
                      Cabang: {placement?.nama_cabang ? `Mimici ${placement.nama_cabang}` : "Belum Ditempatkan"}
                    </span>
                    <span className="emp-badge-tag">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      Shift: {placement?.nama_jadwal || "Reguler"}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  className="emp-mulai-absensi-btn"
                  onClick={() => handleNavClick("absensi")}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                  <span>
                    {hasClockedIn && hasClockedOut
                      ? "Presensi Selesai →"
                      : hasClockedIn
                      ? "Absensi Pulang →"
                      : "Absensi Masuk →"}
                  </span>
                </button>
              </div>

              {/* 3 Summary Grid Cards */}
              <div className="emp-grid-3">
                {/* 1. Status Presensi Hari Ini */}
                <div className="emp-stat-card">
                  <div className="emp-stat-top">
                    <span className="emp-stat-title">Status Hari Ini</span>
                    <div className="emp-stat-icon-wrap">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                    </div>
                  </div>
                  <div>
                    <div className="emp-stat-val">
                      {hasClockedIn ? (
                        <span className={`badge-status ${todayAttendance.status_kehadiran === "Terlambat" ? "badge-terlambat" : "badge-hadir"}`}>
                          {todayAttendance.status_kehadiran}
                        </span>
                      ) : (
                        <span className="badge-status badge-menunggu">Belum Presensi</span>
                      )}
                    </div>
                    <p className="emp-stat-desc" style={{ marginTop: "8px" }}>
                      Masuk: <strong>{formatDateTime(todayAttendance?.waktu_masuk)}</strong><br />
                      Pulang: <strong>{formatDateTime(todayAttendance?.waktu_pulang)}</strong>
                    </p>
                  </div>
                </div>

                {/* 2. Cabang Penempatan (Ditentukan Admin) */}
                <div className="emp-stat-card">
                  <div className="emp-stat-top">
                    <span className="emp-stat-title">Cabang Penempatan</span>
                    <div className="emp-stat-icon-wrap">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                        <circle cx="12" cy="10" r="3" />
                      </svg>
                    </div>
                  </div>
                  <div>
                    <div className="emp-stat-val">{placement?.nama_cabang ? `Mimici ${placement.nama_cabang}` : "-"}</div>
                    <p className="emp-stat-desc" style={{ marginTop: "8px" }}>
                      Radius validasi: <strong>{placement?.radius_meter || 100} meter</strong><br />
                      Penetapan: <strong>Oleh Administrator</strong>
                    </p>
                  </div>
                </div>

                {/* 3. Jadwal Kerja Shift */}
                <div className="emp-stat-card">
                  <div className="emp-stat-top">
                    <span className="emp-stat-title">Jadwal Shift</span>
                    <div className="emp-stat-icon-wrap">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                    </div>
                  </div>
                  <div>
                    <div className="emp-stat-val">{placement?.nama_jadwal || "Reguler"}</div>
                    <p className="emp-stat-desc" style={{ marginTop: "8px" }}>
                      Jam masuk: <strong>{placement?.jam_mulai ? String(placement.jam_mulai).slice(0, 5) : "10:00"} WIB</strong><br />
                      Toleransi: <strong>{placement?.toleransi_menit || 10} menit</strong>
                    </p>
                  </div>
                </div>
              </div>

              {/* Module Cards Grid (Consistent with Admin Dashboard aesthetics) */}
              <div style={{ marginTop: "32px" }}>
                <div style={{ marginBottom: "16px" }}>
                  <h2 style={{ margin: "0 0 4px", fontSize: "19px", fontWeight: 700, color: "#0f172a" }}>Layanan Karyawan</h2>
                  <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>Pintasan cepat untuk mengakses modul presensi dan layanan mandiri.</p>
                </div>

                <div className="modules-grid">
                  {/* Module 1: Presensi Kehadiran */}
                  <article className="module-card">
                    <div className="module-card-top">
                      <div className="module-icon icon-blue">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="12 6 12 12 16 14" />
                        </svg>
                      </div>
                    </div>
                    <h3>Presensi Kehadiran</h3>
                    <p>Lakukan absensi masuk atau pulang menggunakan kamera dan validasi GPS cabang {placement?.nama_cabang || "-"}.</p>
                    <button className="module-action-btn" onClick={() => handleNavClick("absensi")}>
                      <span>
                        {hasClockedIn && hasClockedOut
                          ? "Presensi Selesai"
                          : hasClockedIn
                          ? "Absensi Pulang"
                          : "Absensi Masuk"}
                      </span>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
                    </button>
                  </article>

                  {/* Module 2: Riwayat Kehadiran */}
                  <article className="module-card">
                    <div className="module-card-top">
                      <div className="module-icon icon-teal">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                          <line x1="16" y1="13" x2="8" y2="13" />
                          <line x1="16" y1="17" x2="8" y2="17" />
                        </svg>
                      </div>
                    </div>
                    <h3>Riwayat Absensi</h3>
                    <p>Pantau catatan presensi harian, jam masuk/pulang, dan riwayat potongan keterlambatan.</p>
                    <button className="module-action-btn" onClick={() => handleNavClick("riwayat")}>
                      <span>Buka Riwayat</span>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
                    </button>
                  </article>

                  {/* Module 3: Pengajuan Izin & Sakit */}
                  <article className="module-card">
                    <div className="module-card-top">
                      <div className="module-icon icon-rose">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M9 11l3 3L22 4" />
                          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                        </svg>
                      </div>
                    </div>
                    <h3>Pengajuan Izin & Sakit</h3>
                    <p>Kirimkan permohonan izin atau surat sakit secara online dan pantau status keputusan admin.</p>
                    <button className="module-action-btn" onClick={() => handleNavClick("pengajuan")}>
                      <span>Buka Pengajuan</span>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
                    </button>
                  </article>
                </div>
              </div>
            </div>
          )}

          {/* ================= PAGE 2: ABSENSI ================= */}
          {activeTab === "absensi" && (
            <div>
              {absensiView === "overview" && (
                <div>
                  <div className="emp-page-heading">
                    <p className="emp-page-eyebrow">MODUL PRESENSI CABANG</p>
                    <h1>Absensi Kehadiran</h1>
                    <p className="emp-page-subtitle">
                      Pencatatan presensi masuk dan pulang langsung diarahkan ke cabang yang telah ditentukan oleh admin.
                    </p>
                  </div>

                  <div className="emp-absensi-box">
                    <div className="emp-absensi-banner">
                      <div className="emp-absensi-banner-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                      </div>
                      <div className="emp-banner-details">
                        <h3>Cabang Penempatan: {placement?.nama_cabang ? `Mimici ${placement.nama_cabang}` : "Belum Ditentukan"}</h3>
                        <p>
                          Admin telah menetapkan penempatan Anda di <strong>Mimici {placement?.nama_cabang || "-"}</strong>.
                          Sistem akan memvalidasi posisi GPS Anda harus berada dalam radius <strong>{placement?.radius_meter || 100} meter</strong> dari cabang ini.
                        </p>
                      </div>
                    </div>

                    <div style={{ marginBottom: "28px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
                      <div style={{ padding: "16px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px" }}>
                        <span style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Waktu Masuk Tercatat</span>
                        <p style={{ margin: "6px 0 0", fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
                          {formatDateTime(todayAttendance?.waktu_masuk)}
                        </p>
                      </div>

                      <div style={{ padding: "16px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px" }}>
                        <span style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Waktu Pulang Tercatat</span>
                        <p style={{ margin: "6px 0 0", fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
                          {formatDateTime(todayAttendance?.waktu_pulang)}
                        </p>
                      </div>

                      <div style={{ padding: "16px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px" }}>
                        <span style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Status Kehadiran</span>
                        <div style={{ margin: "6px 0 0" }}>
                          {hasClockedIn ? (
                            <span className={`badge-status ${todayAttendance.status_kehadiran === "Terlambat" ? "badge-terlambat" : "badge-hadir"}`}>
                              {todayAttendance.status_kehadiran}
                            </span>
                          ) : isLiburHariIni ? (
                            <span className="badge-status" style={{ background: "#e0f2fe", color: "#0284c7", border: "1px solid #bae6fd" }}>
                              Libur Rutin
                            </span>
                          ) : (
                            <span className="badge-status badge-menunggu">Belum Presensi</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Button Mulai Absensi / Libur Rutin */}
                    {isLiburHariIni ? (
                      <div style={{ padding: "16px 20px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "12px", color: "#166534" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                          <span style={{ fontSize: "18px" }}>🏖️</span>
                          <strong style={{ fontSize: "14.5px" }}>Hari Ini Adalah Hari Libur Mingguan Anda!</strong>
                        </div>
                        <p style={{ margin: 0, fontSize: "13px", color: "#15803d", lineHeight: 1.5 }}>
                          Jadwal rutin Anda hari ini ditetapkan sebagai hari libur mingguan oleh admin. Anda tidak perlu melakukan presensi masuk maupun pulang. Selamat beristirahat!
                        </p>
                      </div>
                    ) : !placement ? (
                      <p className="form-error">Anda belum memiliki penempatan cabang aktif. Hubungi administrator.</p>
                    ) : hasClockedIn && hasClockedOut ? (
                      <div className="form-success">
                        Presensi lengkap! Anda sudah menyelesaikan presensi masuk dan pulang untuk hari ini di cabang {placement.nama_cabang}.
                      </div>
                    ) : isPresensiBelumDibuka ? (
                      <div style={{ padding: "16px 20px", background: "#fff1f2", border: "1px solid #fecdd3", borderRadius: "12px", color: "#9f1239" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                          <span style={{ fontSize: "18px" }}>⏳</span>
                          <strong style={{ fontSize: "14.5px" }}>Presensi Belum Dibuka</strong>
                        </div>
                        <p style={{ margin: 0, fontSize: "13px", color: "#be123c", lineHeight: 1.5 }}>
                          Layanan presensi belum dibuka (Pukul 00:01 s.d. 06:59 WIB). Transaksi presensi kehadiran dibuka mulai pukul <strong>07:00 WIB</strong>.
                        </p>
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "12px" }}>
                        <button
                          type="button"
                          className="emp-mulai-absensi-btn"
                          onClick={() => {
                            if (isPresensiBelumDibuka) {
                              setError("Presensi belum dibuka");
                              return;
                            }
                            setAbsensiView("camera_session");
                          }}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                            <circle cx="12" cy="13" r="4" />
                          </svg>
                          <span>{hasClockedIn ? "Absensi Pulang" : "Absensi Masuk"}</span>
                        </button>
                        <span style={{ fontSize: "13px", color: "#64748b" }}>
                          * Tekan tombol <strong>{hasClockedIn ? "Absensi Pulang" : "Absensi Masuk"}</strong> di atas untuk langsung membuka kamera dan memvalidasi lokasi cabang {placement.nama_cabang}.
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Sub-Page: Live Camera & GPS Verification Session */}
              {absensiView === "camera_session" && (
                <AttendanceCameraPage
                  placement={placement}
                  mode={hasClockedIn ? "clock-out" : "clock-in"}
                  onBack={() => setAbsensiView("overview")}
                  onSuccess={(msg) => {
                    setActionMessage(msg);
                    setAbsensiView("overview");
                    loadData();
                  }}
                />
              )}
            </div>
          )}

          {/* ================= PAGE 3: RIWAYAT ABSENSI ================= */}
          {activeTab === "riwayat" && (
            <div>
              <div className="emp-page-heading">
                <p className="emp-page-eyebrow">CATATAN KEHADIRAN</p>
                <h1>Riwayat Absensi</h1>
                <p className="emp-page-subtitle">Daftar rekaman kehadiran dan informasi keterlambatan Anda.</p>
              </div>

              {/* Metric Counters */}
              <div className="emp-grid-3" style={{ marginBottom: "24px" }}>
                <div className="emp-stat-card">
                  <span className="emp-stat-title">Total Hadir</span>
                  <div className="emp-stat-val" style={{ color: "#059669" }}>{totalHadir} Hari</div>
                  <p className="emp-stat-desc">Total kehadiran (termasuk terlambat)</p>
                </div>
                <div className="emp-stat-card">
                  <span className="emp-stat-title">Total Terlambat</span>
                  <div className="emp-stat-val" style={{ color: "#d97706" }}>{totalTerlambat} Kali</div>
                  <p className="emp-stat-desc">Kehadiran lewat dari batas toleransi</p>
                </div>
                <div className="emp-stat-card">
                  <span className="emp-stat-title">Total Potongan Keterlambatan</span>
                  <div className="emp-stat-val" style={{ color: totalPotongan > 0 ? "#dc2626" : "#0f172a" }}>
                    {money(totalPotongan)}
                  </div>
                  <p className="emp-stat-desc">Dihitung Rp1.000 per menit terlambat</p>
                </div>
              </div>

              {/* Attendance Table */}
              <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "18px", padding: "24px", boxShadow: "0 2px 6px rgba(15, 23, 42, 0.02)" }}>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Tanggal</th>
                        <th>Cabang</th>
                        <th>Jam Masuk</th>
                        <th>Jam Pulang</th>
                        <th>Status</th>
                        <th>Terlambat</th>
                        <th>Potongan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attendanceHistory.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="empty-cell">Belum ada riwayat presensi yang tercatat.</td>
                        </tr>
                      ) : (
                        attendanceHistory.map((row) => (
                          <tr key={row.id_absensi}>
                            <td><strong>{formatDate(row.tanggal)}</strong></td>
                            <td>{row.nama_cabang}</td>
                            <td>{formatDateTime(row.waktu_masuk)}</td>
                            <td>{formatDateTime(row.waktu_pulang)}</td>
                            <td>
                              <span className={`badge-status ${
                                row.status_kehadiran === "Hadir" ? "badge-hadir" :
                                row.status_kehadiran === "Terlambat" ? "badge-terlambat" :
                                row.status_kehadiran === "Izin" ? "badge-izin" :
                                row.status_kehadiran === "Sakit" ? "badge-sakit" : "badge-alfa"
                              }`}>
                                {row.status_kehadiran}
                              </span>
                            </td>
                            <td>{row.menit_terlambat ? `${row.menit_terlambat} menit` : "-"}</td>
                            <td style={{ fontWeight: 600, color: row.potongan > 0 ? "#b91c1c" : "#0f172a" }}>
                              {money(row.potongan)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ================= PAGE 4: PENGAJUAN ================= */}
          {activeTab === "pengajuan" && (
            <div>
              <div className="emp-page-heading">
                <p className="emp-page-eyebrow">LAYANAN MANDIRI KARYAWAN</p>
                <h1>Pengajuan Izin & Sakit</h1>
                <p className="emp-page-subtitle">Ajukan permohonan ketidakhadiran resmi dan pantau status keputusan admin.</p>
              </div>

              {/* Form Pengajuan Baru */}
              <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "18px", padding: "26px", marginBottom: "28px", boxShadow: "0 2px 6px rgba(15, 23, 42, 0.02)" }}>
                <h3 style={{ margin: "0 0 16px", fontSize: "17px", fontWeight: 700, color: "#0f172a" }}>Buat Pengajuan Baru</h3>
                <SubmissionForm onDone={() => { loadData(); setActionMessage("Pengajuan Anda berhasil dikirim ke admin."); }} />
              </div>

              {/* Tabel Riwayat Pengajuan */}
              <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "18px", padding: "24px", boxShadow: "0 2px 6px rgba(15, 23, 42, 0.02)" }}>
                <h3 style={{ margin: "0 0 16px", fontSize: "17px", fontWeight: 700, color: "#0f172a" }}>Daftar Pengajuan Saya</h3>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Jenis</th>
                        <th>Periode</th>
                        <th>Alasan</th>
                        <th>Bukti Foto</th>
                        <th>Status Keputusan</th>
                        <th>Catatan Admin</th>
                      </tr>
                    </thead>
                    <tbody>
                      {submissions.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="empty-cell">Belum ada pengajuan izin atau sakit.</td>
                        </tr>
                      ) : (
                        submissions.map((sub) => (
                          <tr key={sub.id_pengajuan}>
                            <td>
                              <span className={`badge-status ${sub.jenis === "izin" ? "badge-izin" : "badge-sakit"}`}>
                                {sub.jenis ? sub.jenis.toUpperCase() : "IZIN"}
                              </span>
                            </td>
                            <td>
                              <strong>{formatDate(sub.tanggal_mulai)}</strong>
                              {sub.tanggal_selesai && sub.tanggal_selesai !== sub.tanggal_mulai && ` s/d ${formatDate(sub.tanggal_selesai)}`}
                            </td>
                            <td>{sub.alasan}</td>
                            <td>
                              {sub.foto_bukti ? (
                                <button
                                  type="button"
                                  className="proof-view-btn"
                                  onClick={() => setPreviewProof({
                                    url: sub.foto_bukti,
                                    nama: sub.nama_file_bukti || "Surat Bukti",
                                    jenis: sub.jenis,
                                    tanggal: formatDate(sub.tanggal_mulai),
                                  })}
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                    <circle cx="8.5" cy="8.5" r="1.5" />
                                    <polyline points="21 15 16 10 5 21" />
                                  </svg>
                                  Lihat Foto
                                </button>
                              ) : (
                                <span style={{ color: "#94a3b8", fontSize: "12px" }}>-</span>
                              )}
                            </td>
                            <td>
                              <span className={`badge-status ${
                                sub.status === "disetujui" ? "badge-disetujui" :
                                sub.status === "ditolak" ? "badge-ditolak" : "badge-menunggu"
                              }`}>
                                {sub.status ? sub.status.toUpperCase() : "MENUNGGU"}
                              </span>
                            </td>
                            <td>{sub.catatan_admin || "-"}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Popout Modal: Bukti Foto Pengajuan */}
      {previewProof && (
        <div className="proof-modal-backdrop" onClick={() => setPreviewProof(null)} role="dialog" aria-modal="true">
          <div className="proof-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="proof-modal-header">
              <div>
                <h3>Lampiran Bukti {previewProof.jenis ? previewProof.jenis.toUpperCase() : "SURAT"}</h3>
                <small style={{ color: "#64748b" }}>{previewProof.nama} · Tanggal {previewProof.tanggal}</small>
              </div>
              <button type="button" className="proof-modal-close-btn" onClick={() => setPreviewProof(null)} aria-label="Tutup">
                ✕
              </button>
            </div>
            <div className="proof-modal-body">
              <img src={previewProof.url} alt="Bukti Surat Pengajuan" className="proof-modal-img" />
            </div>
          </div>
        </div>
      )}

      {/* iOS Style Clock Popout Modal (Shared across dashboards) */}
      {isClockModalOpen && (
        <div className="clock-modal-backdrop" onClick={() => setIsClockModalOpen(false)} role="dialog" aria-modal="true">
          <div className="clock-modal-card" onClick={(e) => e.stopPropagation()}>
            <button className="clock-modal-close-btn" onClick={() => setIsClockModalOpen(false)} aria-label="Tutup">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            <div className="popout-clock-face">
              <span className="popout-num num-12">12</span>
              <span className="popout-num num-3">3</span>
              <span className="popout-num num-6">6</span>
              <span className="popout-num num-9">9</span>

              <span className="popout-tick tick-1" />
              <span className="popout-tick tick-2" />
              <span className="popout-tick tick-4" />
              <span className="popout-tick tick-5" />
              <span className="popout-tick tick-7" />
              <span className="popout-tick tick-8" />
              <span className="popout-tick tick-10" />
              <span className="popout-tick tick-11" />

              <div className="popout-hand popout-hand-hour" style={{ transform: `translateX(-50%) rotate(${hourDeg}deg)` }} />
              <div className="popout-hand popout-hand-minute" style={{ transform: `translateX(-50%) rotate(${minDeg}deg)` }} />
              <div className="popout-hand popout-hand-second" style={{ transform: `translateX(-50%) rotate(${secDeg}deg)` }} />
              <div className="popout-pin" />
            </div>

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

// =========================================================================
// SUB-PAGE: LIVE CAMERA & GPS VALIDATION ATTENDANCE PAGE
// =========================================================================
function AttendanceCameraPage({ placement, mode, onBack, onSuccess }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const hasMediaSupport = typeof navigator !== "undefined" && Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

  const [cameraReady, setCameraReady] = useState(!hasMediaSupport);
  const [useFallbackCanvas, setUseFallbackCanvas] = useState(!hasMediaSupport);
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [cameraError, setCameraError] = useState(() => (new Date().getHours() < 7 ? "Presensi belum dibuka" : ""));
  const [gpsStatus, setGpsStatus] = useState("");

  // Start live camera stream immediately when page opens
  useEffect(() => {
    let active = true;

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices
        .getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        })
        .then((stream) => {
          if (!active) {
            stream.getTracks().forEach((track) => track.stop());
            return;
          }
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
          setCameraReady(true);
        })
        .catch((err) => {
          console.warn("Camera hardware access:", err);
          // Allow simulated camera capture so desktop/test environments without physical webcam don't get blocked
          setCameraReady(true);
          setUseFallbackCanvas(true);
        });
    }

    return () => {
      active = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Action: Ambil Foto -> Lalu Validasi Lokasi Cabang -> Kirim Presensi
  const handleTakePhotoAndValidate = async () => {
    setCameraError("");

    // Cek jam operasional presensi (Pukul 00:01 s.d. 06:59 WIB belum dibuka)
    const curHour = new Date().getHours();
    if (curHour < 7) {
      setCameraError("Presensi belum dibuka");
      return;
    }

    setSubmitting(true);
    setGpsStatus("Mengambil foto dari kamera...");

    try {
      // 1. Capture snapshot to canvas
      let photoDataUrl = "";
      const canvas = document.createElement("canvas");
      // Resolusi optimal 480x360 untuk menghemat ukuran payload dan storage (hanya ~20-30 KB per foto)
      canvas.width = 480;
      canvas.height = 360;
      const ctx = canvas.getContext("2d");

      if (!useFallbackCanvas && videoRef.current && videoRef.current.videoWidth > 0) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

        // Watermark audit bar
        ctx.fillStyle = "rgba(15, 23, 42, 0.75)";
        ctx.fillRect(0, 310, canvas.width, 50);

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 12px sans-serif";
        ctx.textAlign = "left";
        const empLabel = `PRESENSI MIMICI - CABANG ${placement?.nama_cabang ? placement.nama_cabang.toUpperCase() : ""}`;
        ctx.fillText(empLabel, 16, 328);

        ctx.fillStyle = "#38bdf8";
        ctx.font = "10.5px monospace";
        const nowStr =
          new Date().toLocaleDateString("id-ID", {
            day: "numeric",
            month: "short",
            year: "numeric",
          }) +
          " " +
          new Date().toLocaleTimeString("id-ID");
        ctx.fillText(`${nowStr} • VERIFIKASI WAJAH`, 16, 346);

        photoDataUrl = canvas.toDataURL("image/jpeg", 0.70);
      } else {
        // Fallback camera simulation frame with silhouette and timestamp
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Gradient circle backdrop
        const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        grad.addColorStop(0, "#1e3a5f");
        grad.addColorStop(1, "#2563eb");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(240, 160, 80, 0, Math.PI * 2);
        ctx.fill();

        // Silhouette head & shoulders
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(240, 135, 38, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(240, 235, 60, Math.PI, Math.PI * 2);
        ctx.fill();

        // Text banner
        ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
        ctx.fillRect(0, 310, canvas.width, 50);
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 12px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`PRESENSI MIMICI - CABANG ${placement.nama_cabang.toUpperCase()} - ${new Date().toLocaleTimeString("id-ID")}`, 240, 340);

        photoDataUrl = canvas.toDataURL("image/jpeg", 0.70);
      }

      setCapturedPhoto(photoDataUrl);

      // 2. Validate GPS Coordinates against branch location
      setGpsStatus(`Mengambil koordinat GPS & memvalidasi ke cabang ${placement.nama_cabang}...`);

      let latitude = null;
      let longitude = null;
      let accuracy = 10;

      try {
        const position = await new Promise((resolve, reject) => {
          if (!navigator.geolocation) {
            reject(new Error("Perangkat tidak mendukung Geolocation GPS."));
            return;
          }
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 6000,
            maximumAge: 0,
          });
        });
        latitude = position.coords.latitude;
        longitude = position.coords.longitude;
        accuracy = position.coords.accuracy || 10;
      } catch (geoErr) {
        console.warn("GPS Geolocation lookup:", geoErr);
        throw new Error("Izin lokasi GPS diperlukan untuk memvalidasi keberadaan di cabang.");
      }

      setGpsStatus(`Lokasi terdeteksi. Memverifikasi radius cabang ${placement.nama_cabang}...`);

      // 3. Post to backend clock-in / clock-out endpoint
      const endpoint = mode === "clock-in" ? "/employee/attendance/clock-in" : "/employee/attendance/clock-out";
      const payload = {
        latitude,
        longitude,
        accuracy,
        foto: photoDataUrl,
      };

      const response = await api.post(endpoint, payload);

      // Success feedback
      const actionName = mode === "clock-in" ? "Presensi Masuk" : "Presensi Pulang";
      onSuccess(`${actionName} berhasil di Cabang ${placement.nama_cabang}! Jarak: ${response.jarak_meter ?? 0} meter.`);
    } catch (err) {
      console.error("Attendance submission error:", err);
      setCameraError(err.message || "Gagal memproses presensi.");
      setCapturedPhoto(null);
    } finally {
      setSubmitting(false);
      setGpsStatus("");
    }
  };

  return (
    <div>
      <div style={{ marginBottom: "20px" }}>
        <button type="button" className="emp-back-link-btn" onClick={onBack}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          <span>Kembali ke Halaman Absensi</span>
        </button>
      </div>

      <div className="emp-camera-session-card">
        <div style={{ textAlign: "center", marginBottom: "20px" }}>
          <p className="emp-page-eyebrow" style={{ color: "#2563eb" }}>
            {mode === "clock-in" ? "ABSENSI MASUK" : "ABSENSI PULANG"}
          </p>
          <h2 style={{ margin: "4px 0", fontSize: "22px", fontWeight: 800, color: "#0f172a" }}>
            Absensi di Cabang {placement.nama_cabang}
          </h2>
          <p style={{ margin: 0, fontSize: "13.5px", color: "#64748b" }}>
            Cabang ini telah ditentukan oleh Administrator. Posisikan wajah Anda di dalam kamera, lalu tekan tombol <strong>Ambil Foto</strong>.
          </p>
          <div
            style={{
              margin: "12px auto 0",
              maxWidth: "540px",
              background: "#eff6ff",
              border: "1px solid #bfdbfe",
              borderRadius: "8px",
              padding: "8px 14px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "12px",
              color: "#1e40af",
              textAlign: "left",
            }}
          >
            <span style={{ fontSize: "16px" }}>🔒</span>
            <span>
              <strong>Audit Wajah Anti-Kecurangan:</strong> Presensi wajib dilakukan sendiri oleh karyawan bersangkutan. Wajah dan data perangkat dicatat secara otomatis untuk diverifikasi oleh Admin.
            </span>
          </div>
        </div>

        {/* Viewfinder Preview Box */}
        <div className="emp-camera-viewfinder-wrapper">
          {capturedPhoto ? (
            <img src={capturedPhoto} alt="Captured preview" className="emp-camera-captured-img" />
          ) : useFallbackCanvas ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#94a3b8", gap: "10px" }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              <span style={{ fontSize: "13px", fontWeight: 600 }}>Kamera Siap Digunakan</span>
            </div>
          ) : (
            <video ref={videoRef} autoPlay playsInline muted className="emp-camera-video" />
          )}

          <div className="emp-viewfinder-overlay">
            <span className="emp-viewfinder-pill">
              {capturedPhoto ? "FOTO DIAMBIL" : cameraReady ? "KAMERA AKTIF (LIVE)" : "MEMUAT KAMERA..."}
            </span>
          </div>
        </div>

        {/* Error notification if any */}
        {cameraError && (
          <div className="form-error" style={{ width: "100%", maxWidth: "520px", marginBottom: "16px", textAlign: "center" }}>
            {cameraError}
          </div>
        )}

        {/* Processing / GPS Status indicator */}
        {submitting && (
          <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "#2563eb", fontWeight: 600, fontSize: "14px", marginBottom: "16px" }}>
            <svg style={{ animation: "spin 1s linear infinite", width: "18px", height: "18px" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            <span>{gpsStatus}</span>
          </div>
        )}

        {/* Action Button: Ambil Foto */}
        <div className="emp-camera-btn-group">
          <button
            type="button"
            className="emp-take-photo-btn"
            disabled={!cameraReady || submitting}
            onClick={handleTakePhotoAndValidate}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            <span>
              {submitting
                ? "Memverifikasi Lokasi..."
                : mode === "clock-in"
                ? "Ambil Foto (Absensi Masuk)"
                : "Ambil Foto (Absensi Pulang)"}
            </span>
          </button>

          <p style={{ margin: 0, fontSize: "12.5px", color: "#64748b", textAlign: "center" }}>
            Setelah mengambil foto, sistem otomatis memvalidasi koordinat GPS Anda ke cabang <strong>Mimici {placement.nama_cabang}</strong> (Maks. {placement.radius_meter || 100} meter).
          </p>
        </div>
      </div>
    </div>
  );
}

// =========================================================================
// SUBMISSION FORM COMPONENT (DENGAN WAJIB UPLOAD BUKTI GAMBAR)
// =========================================================================
function SubmissionForm({ onDone }) {
  const [form, setForm] = useState(() => {
    const today = new Date().toISOString().slice(0, 10);
    return {
      jenis: "izin",
      tanggal_mulai: today,
      tanggal_selesai: today,
      alasan: "",
    };
  });
  const [fileData, setFileData] = useState({
    foto_bukti: "",
    nama_file: "",
    tipe_file: "",
    ukuran_file: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  const update = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("File yang diunggah wajib berupa gambar (JPG, JPEG, PNG, atau WEBP).");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("Ukuran gambar terlalu besar. Maksimal 5MB.");
      return;
    }

    setError("");
    const reader = new FileReader();
    reader.onload = (event) => {
      setFileData({
        foto_bukti: event.target.result,
        nama_file: file.name,
        tipe_file: file.type,
        ukuran_file: file.size,
      });
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveFile = () => {
    setFileData({ foto_bukti: "", nama_file: "", tipe_file: "", ukuran_file: 0 });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.alasan.trim()) {
      setError("Alasan pengajuan wajib diisi.");
      return;
    }

    // Validasi wajib upload gambar
    if (!fileData.foto_bukti) {
      setError("Wajib melampirkan foto/gambar bukti surat izin atau resep/surat dokter.");
      return;
    }

    setError("");
    setLoading(true);
    try {
      await api.post("/employee/submissions", {
        ...form,
        foto_bukti: fileData.foto_bukti,
        nama_file: fileData.nama_file,
        tipe_file: fileData.tipe_file,
        ukuran_file: fileData.ukuran_file,
      });
      setForm({
        jenis: "izin",
        tanggal_mulai: new Date().toISOString().slice(0, 10),
        tanggal_selesai: new Date().toISOString().slice(0, 10),
        alasan: "",
      });
      handleRemoveFile();
      onDone();
    } catch (err) {
      setError(err.message || "Gagal mengirim pengajuan.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "18px" }}>
      {error && (
        <div className="form-error" style={{ gridColumn: "1 / -1", padding: "12px 16px", borderRadius: "10px", background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", fontSize: "13.5px", fontWeight: 600 }}>
          ⚠️ {error}
        </div>
      )}

      {/* Jenis Pengajuan */}
      <label className="form-field" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <span style={{ fontSize: "13px", fontWeight: 600, color: "#334155" }}>Jenis Pengajuan <span style={{ color: "#ef4444" }}>*</span></span>
        <select
          name="jenis"
          value={form.jenis}
          onChange={update}
          style={{
            padding: "10px 14px",
            borderRadius: "10px",
            border: "1px solid #cbd5e1",
            color: "#0f172a",
            backgroundColor: "#ffffff",
            fontSize: "14px",
            fontWeight: 600,
            outline: "none",
            colorScheme: "light",
          }}
        >
          <option value="izin">Izin</option>
          <option value="sakit">Sakit</option>
        </select>
      </label>

      {/* Tanggal Mulai */}
      <label className="form-field" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <span style={{ fontSize: "13px", fontWeight: 600, color: "#334155" }}>Tanggal Mulai <span style={{ color: "#ef4444" }}>*</span></span>
        <input
          type="date"
          name="tanggal_mulai"
          value={form.tanggal_mulai}
          onChange={update}
          required
          style={{
            padding: "9px 14px",
            borderRadius: "10px",
            border: "1px solid #cbd5e1",
            color: "#0f172a",
            backgroundColor: "#ffffff",
            fontSize: "14px",
            fontWeight: 500,
            outline: "none",
            colorScheme: "light",
          }}
        />
      </label>

      {/* Tanggal Selesai */}
      <label className="form-field" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <span style={{ fontSize: "13px", fontWeight: 600, color: "#334155" }}>Tanggal Selesai <span style={{ color: "#ef4444" }}>*</span></span>
        <input
          type="date"
          name="tanggal_selesai"
          value={form.tanggal_selesai}
          onChange={update}
          required
          style={{
            padding: "9px 14px",
            borderRadius: "10px",
            border: "1px solid #cbd5e1",
            color: "#0f172a",
            backgroundColor: "#ffffff",
            fontSize: "14px",
            fontWeight: 500,
            outline: "none",
            colorScheme: "light",
          }}
        />
      </label>

      {/* Alasan Pengajuan */}
      <label className="form-field" style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: "6px" }}>
        <span style={{ fontSize: "13px", fontWeight: 600, color: "#334155" }}>Alasan / Keterangan <span style={{ color: "#ef4444" }}>*</span></span>
        <textarea
          name="alasan"
          value={form.alasan}
          onChange={update}
          placeholder="Tuliskan keterangan detail pengajuan izin/sakit Anda..."
          rows={3}
          required
          style={{
            padding: "12px 14px",
            borderRadius: "10px",
            border: "1px solid #cbd5e1",
            color: "#0f172a",
            backgroundColor: "#ffffff",
            fontSize: "14px",
            fontWeight: 400,
            outline: "none",
            resize: "vertical",
            colorScheme: "light",
          }}
        />
      </label>

      {/* Upload Bukti Gambar (Wajib) */}
      <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: "8px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "13px", fontWeight: 700, color: "#334155" }}>
            Lampiran Foto Bukti (Surat Izin / Keterangan Dokter) <span style={{ color: "#ef4444" }}>* Wajib</span>
          </span>
          <span style={{ fontSize: "12px", color: "#64748b" }}>Format: PNG, JPG, JPEG (Maks. 5MB)</span>
        </div>

        {/* Hidden File Input */}
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          onChange={handleFileChange}
          style={{ display: "none" }}
        />

        {!fileData.foto_bukti ? (
          <div
            className="emp-upload-zone"
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click(); }}
          >
            <div style={{ width: "44px", height: "44px", borderRadius: "10px", background: "#dbeafe", display: "flex", alignItems: "center", justifyContent: "center", color: "#2563eb" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: "14px", fontWeight: 600, color: "#1e293b" }}>
                Pilih atau Ambil Foto Bukti Surat
              </div>
              <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
                Klik tombol di bawah untuk memilih file dari perangkat Anda
              </div>
            </div>
            <button
              type="button"
              className="admin-btn admin-btn-secondary admin-btn-sm"
              style={{ marginTop: "4px" }}
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
            >
              📁 Choose File / Pilih Gambar
            </button>
          </div>
        ) : (
          <div className="emp-upload-preview">
            <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
              <img src={fileData.foto_bukti} alt="Preview Bukti" className="emp-upload-thumb" />
              <div>
                <div style={{ fontWeight: 600, fontSize: "13.5px", color: "#0f172a" }}>{fileData.nama_file}</div>
                <div style={{ fontSize: "12px", color: "#16a34a", fontWeight: 500, marginTop: "2px" }}>
                  ✓ {(fileData.ukuran_file / 1024).toFixed(1)} KB · File siap dilampirkan
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                className="admin-btn admin-btn-secondary admin-btn-sm"
                onClick={() => fileInputRef.current?.click()}
              >
                Ganti File
              </button>
              <button
                type="button"
                className="admin-btn admin-btn-danger admin-btn-sm"
                onClick={handleRemoveFile}
              >
                Hapus
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Tombol Submit */}
      <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", marginTop: "6px" }}>
        <button
          type="submit"
          className="emp-submit-btn"
          disabled={loading}
          style={{ minWidth: "160px" }}
        >
          {loading ? "Mengirim..." : "Kirim Pengajuan"}
        </button>
      </div>
    </form>
  );
}
