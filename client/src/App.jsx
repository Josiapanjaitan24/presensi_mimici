
import Login from "./pages/Login";
import AdminDashboard from "./pages/AdminDashboard";
import KaryawanDashboard from "./pages/KaryawanDashboard";

export default function App() {
  const token = localStorage.getItem("token");
  const pengguna = JSON.parse(
    localStorage.getItem("pengguna") || "null",
  );

  if (token && pengguna?.peran === "admin") {
    return <AdminDashboard />;
  }

  if (token && pengguna?.peran === "karyawan") {
    return <KaryawanDashboard />;
  }

  return <Login />;
}