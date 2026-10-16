
import { useState, useEffect } from "react";
import { login } from "../services/authService";
import "./Login.css";

export default function Login() {
  const [identitas, setIdentitas] = useState("");
  const [kataSandi, setKataSandi] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [ingatSaya, setIngatSaya] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update jam analog setiap detik
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const seconds = currentTime.getSeconds();
  const minutes = currentTime.getMinutes();
  const hours = currentTime.getHours();

  const secDeg = seconds * 6;
  const minDeg = minutes * 6 + seconds * 0.1;
  const hourDeg = (hours % 12) * 30 + minutes * 0.5;

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const data = await login(identitas, kataSandi);

      if (!data.token || !data.pengguna) {
        throw new Error("Respons login dari server tidak lengkap.");
      }

      localStorage.setItem("token", data.token);
      localStorage.setItem(
        "pengguna",
        JSON.stringify(data.pengguna),
      );

      if (ingatSaya) {
        localStorage.setItem("ingat_identitas", identitas);
      } else {
        localStorage.removeItem("ingat_identitas");
      }

      if (data.pengguna.peran === "admin") {
        window.location.href = "/admin";
      } else if (data.pengguna.peran === "karyawan") {
        window.location.href = "/karyawan";
      } else {
        throw new Error("Peran pengguna tidak dikenali.");
      }
    } catch (err) {
      setError(err.message || "Tidak dapat terhubung ke server.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      {/* Decorative background blobs */}
      <div className="login-blob login-blob-tl" aria-hidden="true" />
      <div className="login-blob login-blob-br" aria-hidden="true" />

      <div className="login-container">
        {/* Top Header Mini Analog Clock (Tanpa teks presensi) */}
        <div
          className="login-clock-badge"
          title={`Waktu Saat Ini: ${currentTime.toLocaleTimeString("id-ID")}`}
        >
          <div className="analog-clock" aria-label="Jam Analog">
            {/* Angka penanda jam (12, 3, 6, 9) */}
            <span className="clock-num num-12">12</span>
            <span className="clock-num num-3">3</span>
            <span className="clock-num num-6">6</span>
            <span className="clock-num num-9">9</span>

            {/* Jarum jam */}
            <div
              className="clock-hand hand-hour"
              style={{ transform: `translateX(-50%) rotate(${hourDeg}deg)` }}
            />
            {/* Jarum menit */}
            <div
              className="clock-hand hand-minute"
              style={{ transform: `translateX(-50%) rotate(${minDeg}deg)` }}
            />
            {/* Jarum detik */}
            <div
              className="clock-hand hand-second"
              style={{ transform: `translateX(-50%) rotate(${secDeg}deg)` }}
            />
            {/* Titik tengah poros */}
            <div className="clock-pin" />
          </div>
        </div>

        {/* Card */}
        <section className="login-card">
          <div className="login-brand">
            <p className="login-eyebrow">PORTAL KARYAWAN</p>
            <h1>Selamat Datang</h1>
            <p className="login-description">
              Silakan masuk untuk melakukan presensi.
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="login-field">
              <label htmlFor="identitas">Email atau NIP</label>
              <div className="login-input-wrapper">
                <svg
                  className="login-input-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                <input
                  id="identitas"
                  type="text"
                  autoComplete="username"
                  placeholder="Masukkan email atau NIP"
                  value={identitas}
                  onChange={(event) => setIdentitas(event.target.value)}
                  required
                />
              </div>
            </div>

            <div className="login-field">
              <label htmlFor="kataSandi">Kata sandi</label>
              <div className="login-input-wrapper">
                <svg
                  className="login-input-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <input
                  id="kataSandi"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Masukkan kata sandi"
                  value={kataSandi}
                  onChange={(event) => setKataSandi(event.target.value)}
                  required
                />
                <button
                  type="button"
                  className="login-toggle-password"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Sembunyikan kata sandi" : "Lihat kata sandi"}
                >
                  {showPassword ? (
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div className="login-options">
              <label className="login-checkbox-label">
                <input
                  type="checkbox"
                  checked={ingatSaya}
                  onChange={(e) => setIngatSaya(e.target.checked)}
                />
                <span>Ingat saya</span>
              </label>
              <a
                href="#forgot-password"
                className="login-forgot-link"
                onClick={(e) => {
                  e.preventDefault();
                  alert("Silakan hubungi administrator atau HRD untuk mereset kata sandi Anda.");
                }}
              >
                Lupa kata sandi?
              </a>
            </div>

            {error && (
              <p className="login-error" role="alert">
                {error}
              </p>
            )}

            <button
              className="login-button"
              type="submit"
              disabled={loading}
            >
              {loading ? "Memproses..." : "Masuk"}
            </button>
          </form>
        </section>

        {/* Page Footer */}
        <p className="login-page-footer">
          Presensi Mimici &middot; {new Date().getFullYear()}
        </p>
      </div>
    </main>
  );
}