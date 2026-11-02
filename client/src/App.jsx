import { useEffect, useState } from "react";
import Login from "./pages/Login";
import AdminDashboard from "./pages/AdminDashboard";
import KaryawanDashboard from "./pages/KaryawanDashboard";
import { getProfil } from "./services/authService";
import { getStoredToken, saveSessionToken, logout } from "./services/api";

export default function App() {
  const isAdminPath = window.location.pathname === "/admin";
  const isEmployeePath =
    window.location.pathname === "/" ||
    window.location.pathname === "/karyawan";
  const expectedRole = isAdminPath ? "admin" : "karyawan";

  const [session, setSession] = useState(() => {
    const token = getStoredToken(expectedRole);
    return {
      status: token ? "checking" : "anonymous",
      pengguna: null,
      error: "",
    };
  });

  useEffect(() => {
    let active = true;
    const token = getStoredToken(expectedRole);

    if (!token) {
      return undefined;
    }

    getProfil(token)
      .then((data) => {
        if (!active) return;
        if (isAdminPath && data.pengguna.peran !== "admin") {
          setSession({ status: "anonymous", pengguna: null, error: "" });
          return;
        }
        if (isEmployeePath && data.pengguna.peran !== "karyawan") {
          setSession({ status: "anonymous", pengguna: null, error: "" });
          return;
        }

        saveSessionToken(data.pengguna.peran, token, data.pengguna);
        setSession({
          status: "authenticated",
          pengguna: data.pengguna,
          error: "",
        });
      })
      .catch((error) => {
        if (!active) return;
        const hasNetworkError =
          !error.message || error.message.includes("Failed to fetch");
        if (!hasNetworkError) {
          logout(expectedRole);
        }
        setSession({
          status: hasNetworkError ? "error" : "anonymous",
          pengguna: null,
          error: hasNetworkError
            ? "Server tidak dapat dihubungi. Coba muat ulang halaman."
            : "Sesi login Anda telah berakhir (60 menit). Silakan login kembali.",
        });
      });

    return () => {
      active = false;
    };
  }, [expectedRole, isAdminPath, isEmployeePath]);

  useEffect(() => {
    const expire = (e) => {
      const msg =
        e?.detail?.message ||
        "Sesi login Anda telah berakhir (60 menit). Silakan login kembali.";
      setSession({ status: "anonymous", pengguna: null, error: msg });
    };
    window.addEventListener("session-expired", expire);
    return () => window.removeEventListener("session-expired", expire);
  }, []);

  if (session.status === "checking")
    return <main className="session-loading">Memverifikasi sesi...</main>;
  if (session.status === "error")
    return (
      <main className="session-loading">
        <p>{session.error}</p>
        <button onClick={() => window.location.reload()}>Coba lagi</button>
      </main>
    );

  if (
    session.status === "authenticated" &&
    isAdminPath &&
    session.pengguna?.peran === "admin"
  ) {
    return <AdminDashboard />;
  }

  if (
    session.status === "authenticated" &&
    isEmployeePath &&
    session.pengguna?.peran === "karyawan"
  ) {
    return <KaryawanDashboard />;
  }

  return <Login role={expectedRole} sessionError={session.error} />;
}
