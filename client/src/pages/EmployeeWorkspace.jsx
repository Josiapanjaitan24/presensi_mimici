import { useEffect, useRef, useState } from "react";
import { api, formatDate, formatDateTime, logout, money } from "../services/api";
import "./Dashboard.css";

function Card({ title, children }) {
  return (
    <article className="employee-card">
      <h2>{title}</h2>
      {children}
    </article>
  );
}

function Field({ label, children }) {
  return (
    <label className="form-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Notice({ error, message }) {
  return (
    (error || message) && (
      <p className={error ? "form-error" : "form-success"}>
        {error || message}
      </p>
    )
  );
}

export default function EmployeeWorkspace() {
  const [dashboard, setDashboard] = useState(null);
  const [attendance, setAttendance] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [error, setError] = useState("");
  const pengguna = JSON.parse(localStorage.getItem("pengguna") || "null");

  const load = async () => {
    try {
      const [home, history, requests] = await Promise.all([
        api.get("/employee/dashboard"),
        api.get("/employee/attendance"),
        api.get("/employee/submissions"),
      ]);
      setDashboard(home);
      setAttendance(history.data);
      setSubmissions(requests.data);
      setError("");
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    Promise.resolve().then(() => load());
  }, []);

  return (
    <main className="system-shell employee-shell">
      <header className="system-header">
        <div>
          <p className="dashboard-eyebrow">MIMICI · KARYAWAN</p>
          <h1>Dashboard Karyawan</h1>
          <p className="muted">
            Halo,{" "}
            {dashboard?.karyawan?.nama_lengkap ||
              pengguna?.nama_pengguna ||
              "Karyawan"}
            .
          </p>
        </div>
        <button className="secondary-button" onClick={logout}>
          Keluar
        </button>
      </header>
      <Notice error={error} />
      <section className="employee-grid">
        <AttendanceCard dashboard={dashboard} onDone={load} />
        <Card title="Jadwal Kerja">
          {dashboard?.penempatan ? (
            <>
              <p className="large-value">{dashboard.penempatan.nama_cabang}</p>
              <p>
                {dashboard.penempatan.nama_jadwal || "Jadwal belum ditentukan"}
              </p>
              <p className="muted">
                Mulai{" "}
                {dashboard.penempatan.jam_mulai
                  ? String(dashboard.penempatan.jam_mulai).slice(0, 5)
                  : "-"}{" "}
                · Toleransi {dashboard.penempatan.toleransi_menit ?? 10} menit
              </p>
            </>
          ) : (
            <p className="muted">Belum ada penempatan aktif.</p>
          )}
        </Card>
        <Card title="Pengajuan Izin & Sakit">
          <SubmissionForm onDone={load} />
          <div className="mini-list">
            {submissions.slice(0, 4).map((item) => (
              <div key={item.id_pengajuan}>
                <span>
                  {item.jenis} · {formatDate(item.tanggal_mulai)}
                </span>
                <b className={`status-${item.status}`}>{item.status}</b>
              </div>
            ))}
            {!submissions.length && (
              <p className="muted">Belum ada pengajuan.</p>
            )}
          </div>
        </Card>
      </section>
      <Card title="Riwayat Absensi">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Cabang</th>
                <th>Masuk</th>
                <th>Pulang</th>
                <th>Status</th>
                <th>Terlambat</th>
                <th>Potongan</th>
              </tr>
            </thead>
            <tbody>
              {attendance.length ? (
                attendance.map((item) => (
                  <tr key={item.id_absensi}>
                    <td>{formatDate(item.tanggal)}</td>
                    <td>{item.nama_cabang}</td>
                    <td>{formatDateTime(item.waktu_masuk)}</td>
                    <td>{formatDateTime(item.waktu_pulang)}</td>
                    <td>{item.status_kehadiran}</td>
                    <td>{item.menit_terlambat} menit</td>
                    <td>{money(item.potongan)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="7" className="empty-cell">
                    Belum ada riwayat absensi.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </main>
  );
}

function AttendanceCard({ dashboard, onDone }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("clock-in");

  return (
    <Card title="Presensi Hari Ini">
      <div className="attendance-status">
        <span className="large-value">
          {dashboard?.absensi_hari_ini?.status_kehadiran || "Belum presensi"}
        </span>
        <p>Masuk: {formatDateTime(dashboard?.absensi_hari_ini?.waktu_masuk)}</p>
        <p>
          Pulang: {formatDateTime(dashboard?.absensi_hari_ini?.waktu_pulang)}
        </p>
      </div>
      {dashboard?.penempatan && (
        <button
          className="primary-button"
          onClick={() => {
            setMode(
              dashboard.absensi_hari_ini?.waktu_masuk &&
                !dashboard.absensi_hari_ini?.waktu_pulang
                ? "clock-out"
                : "clock-in",
            );
            setOpen(true);
          }}
        >
          {dashboard.absensi_hari_ini?.waktu_masuk &&
          !dashboard.absensi_hari_ini?.waktu_pulang
            ? "Presensi Pulang"
            : "Mulai Presensi"}
        </button>
      )}
      {open && (
        <CaptureModal
          mode={mode}
          scheduleId={dashboard?.penempatan?.id_jadwal}
          onClose={() => setOpen(false)}
          onDone={() => {
            setOpen(false);
            onDone();
          }}
        />
      )}
    </Card>
  );
}

function CaptureModal({ mode, scheduleId, onClose, onDone }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    navigator.mediaDevices
      ?.getUserMedia({ video: true })
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setReady(true);
      })
      .catch(() =>
        setError(
          "Kamera tidak dapat diakses. Izinkan akses kamera lalu coba lagi.",
        ),
      );
    return () =>
      streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const submit = async () => {
    setLoading(true);
    setError("");
    try {
      const position = await new Promise((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(
          resolve,
          () => reject(new Error("Lokasi GPS tidak dapat diperoleh.")),
          { enableHighAccuracy: true, timeout: 10000 },
        ),
      );
      const canvas = document.createElement("canvas");
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      canvas.getContext("2d").drawImage(videoRef.current, 0, 0);
      const body = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        foto: canvas.toDataURL("image/jpeg", 0.8),
      };
      if (mode === "clock-in") body.id_jadwal = scheduleId;
      await api.post(`/employee/attendance/${mode}`, body);
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="module-backdrop" onClick={onClose}>
      <section
        className="module-modal capture-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="module-modal-header">
          <h2>{mode === "clock-in" ? "Presensi Masuk" : "Presensi Pulang"}</h2>
          <button onClick={onClose}>×</button>
        </div>
        <video ref={videoRef} autoPlay playsInline className="camera-preview" />
        {!ready && !error && <p className="muted">Meminta akses kamera…</p>}
        <Notice error={error} />
        <button
          className="primary-button"
          disabled={!ready || loading}
          onClick={submit}
        >
          {loading ? "Menyimpan…" : "Ambil foto & simpan"}
        </button>
      </section>
    </div>
  );
}

function SubmissionForm({ onDone }) {
  const [form, setForm] = useState({
    jenis: "izin",
    tanggal_mulai: "",
    tanggal_selesai: "",
    alasan: "",
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const update = (event) =>
    setForm({ ...form, [event.target.name]: event.target.value });

  const submit = async (event) => {
    event.preventDefault();
    try {
      await api.post("/employee/submissions", {
        ...form,
        tanggal_selesai: form.tanggal_selesai || form.tanggal_mulai,
      });
      setMessage("Pengajuan dikirim.");
      setForm({ ...form, tanggal_mulai: "", tanggal_selesai: "", alasan: "" });
      onDone();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <form className="module-form compact-form" onSubmit={submit}>
        <Field label="Jenis">
          <select name="jenis" value={form.jenis} onChange={update}>
            <option value="izin">Izin</option>
            <option value="sakit">Sakit</option>
          </select>
        </Field>
        <Field label="Tanggal mulai">
          <input
            type="date"
            name="tanggal_mulai"
            value={form.tanggal_mulai}
            onChange={update}
            required
          />
        </Field>
        <Field label="Tanggal selesai">
          <input
            type="date"
            name="tanggal_selesai"
            value={form.tanggal_selesai}
            onChange={update}
          />
        </Field>
        <Field label="Alasan">
          <textarea
            name="alasan"
            value={form.alasan}
            onChange={update}
            required
          />
        </Field>
        <button className="primary-button">Kirim Pengajuan</button>
      </form>
      <Notice error={error} message={message} />
    </>
  );
}
