
import { useState } from "react";
import { login } from "../services/authService";
import "./Login.css";

export default function Login() {
  const [identitas, setIdentitas] = useState("");
  const [kataSandi, setKataSandi] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
      <section className="login-card">
        <div className="login-brand">
          <div className="login-logo">M</div>
          <p className="login-eyebrow">MIMICI</p>
          <h1>Presensi Karyawan</h1>
          <p className="login-description">
            Masuk untuk mengakses sistem presensi Mimici.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="login-field">
            <label htmlFor="identitas">Username atau email</label>
            <input
              id="identitas"
              type="text"
              autoComplete="username"
              placeholder="Masukkan username atau email"
              value={identitas}
              onChange={(event) => setIdentitas(event.target.value)}
              required
            />
          </div>

          <div className="login-field">
            <label htmlFor="kataSandi">Kata sandi</label>
            <input
              id="kataSandi"
              type="password"
              autoComplete="current-password"
              placeholder="Masukkan kata sandi"
              value={kataSandi}
              onChange={(event) => setKataSandi(event.target.value)}
              required
            />
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

        <p className="login-footer">
          Presensi Mimici &copy; {new Date().getFullYear()}
        </p>
      </section>
    </main>
  );
}