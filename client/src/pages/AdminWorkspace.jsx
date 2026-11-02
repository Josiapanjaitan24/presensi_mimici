import { useEffect, useState } from "react";
import { api, formatDate, formatDateTime, logout, money } from "../services/api";
import "./Dashboard.css";

const modules = [
  [
    "employees",
    "Data Karyawan",
    "Kelola akun, NIP, status, dan penempatan cabang.",
  ],
  [
    "branches",
    "Data Cabang",
    "Kelola koordinat, alamat, radius GPS, dan status.",
  ],
  [
    "schedules",
    "Jadwal & Shift Kerja",
    "Atur jam reguler, shift Pakuan, dan toleransi.",
  ],
  [
    "attendance",
    "Monitoring Presensi",
    "Pantau waktu, lokasi, foto, dan keterlambatan.",
  ],
  [
    "submissions",
    "Pengajuan Izin & Sakit",
    "Periksa pengajuan dan simpan keputusan admin.",
  ],
  [
    "reports",
    "Laporan & Rekap",
    "Unduh laporan presensi seluruh cabang dalam Excel.",
  ],
];

function Modal({ title, onClose, children }) {
  return (
    <div className="module-backdrop" onClick={onClose}>
      <section
        className="module-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="module-modal-header">
          <h2>{title}</h2>
          <button type="button" onClick={onClose}>
            ×
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function Table({ headers, rows, empty = "Belum ada data." }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows
          ) : (
            <tr>
              <td colSpan={headers.length} className="empty-cell">
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
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

export default function AdminWorkspace() {
  const pengguna = JSON.parse(localStorage.getItem("pengguna") || "null");
  const [active, setActive] = useState(null);
  const [data, setData] = useState({});
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = async () => {
    setLoading(true);
    try {
      const [s, employees, branches, schedules, attendance, submissions] =
        await Promise.all([
          api.get("/admin/summary"),
          api.get("/admin/employees"),
          api.get("/admin/branches"),
          api.get("/admin/schedules"),
          api.get("/admin/attendance"),
          api.get("/admin/submissions"),
        ]);
      setSummary(s.data);
      setData({
        employees: employees.data,
        branches: branches.data,
        schedules: schedules.data,
        attendance: attendance.data,
        submissions: submissions.data,
      });
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    Promise.resolve().then(() => refresh());
  }, []);

  return (
    <main className="system-shell">
      <header className="system-header">
        <div>
          <p className="dashboard-eyebrow">MIMICI · ADMIN</p>
          <h1>Dashboard Admin</h1>
          <p className="muted">
            Selamat datang, {pengguna?.nama_pengguna || "Admin"}.
          </p>
        </div>
        <button className="secondary-button" onClick={logout}>
          Keluar
        </button>
      </header>
      <Notice error={error} />
      <section className="summary-grid">
        {[
          ["Karyawan", summary?.karyawan?.aktif || 0, "aktif"],
          ["Cabang", summary?.cabang?.aktif || 0, "aktif"],
          [
            "Presensi hari ini",
            summary?.presensi_hari_ini?.total || 0,
            `${summary?.presensi_hari_ini?.terlambat || 0} terlambat`,
          ],
          ["Pengajuan", summary?.pengajuan?.menunggu || 0, "menunggu"],
        ].map(([label, value, note]) => (
          <article className="summary-card" key={label}>
            <span>{label}</span>
            <strong>{loading ? "…" : value}</strong>
            <small>{note}</small>
          </article>
        ))}
      </section>
      <section className="admin-module-grid">
        {modules.map(([key, title, description], index) => (
          <article className="admin-module-card" key={key}>
            <div className="module-number">
              {String(index + 1).padStart(2, "0")}
            </div>
            <h2>{title}</h2>
            <p>{description}</p>
            <button className="primary-button" onClick={() => setActive(key)}>
              Buka Modul →
            </button>
          </article>
        ))}
      </section>
      {active === "employees" && (
        <EmployeeModule
          data={data}
          onClose={() => setActive(null)}
          onRefresh={refresh}
        />
      )}
      {active === "branches" && (
        <BranchModule
          data={data}
          onClose={() => setActive(null)}
          onRefresh={refresh}
        />
      )}
      {active === "schedules" && (
        <ScheduleModule
          data={data}
          onClose={() => setActive(null)}
          onRefresh={refresh}
        />
      )}
      {active === "attendance" && (
        <AttendanceModule data={data} onClose={() => setActive(null)} />
      )}
      {active === "submissions" && (
        <SubmissionModule
          data={data}
          onClose={() => setActive(null)}
          onRefresh={refresh}
        />
      )}
      {active === "reports" && <ReportModule onClose={() => setActive(null)} />}
    </main>
  );
}

function EmployeeModule({ data, onClose, onRefresh }) {
  const [form, setForm] = useState({});
  const [todayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const update = (event) =>
    setForm({ ...form, [event.target.name]: event.target.value });

  const submit = async (event) => {
    event.preventDefault();
    try {
      await api.post("/admin/employees", form);
      setMessage("Karyawan berhasil dibuat.");
      setForm({});
      onRefresh();
    } catch (err) {
      setError(err.message);
    }
  };

  const place = async (employee) => {
    const id_cabang = window.prompt("Masukkan ID cabang untuk penempatan:");
    if (!id_cabang) return;
    try {
      await api.post("/admin/placements", {
        id_karyawan: employee.id_karyawan,
        id_cabang,
        tanggal_mulai: todayDate,
      });
      onRefresh();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Modal title="Data Karyawan" onClose={onClose}>
      <form className="module-form" onSubmit={submit}>
        <Field label="Nama lengkap">
          <input
            name="nama_lengkap"
            value={form.nama_lengkap || ""}
            onChange={update}
            required
          />
        </Field>
        <Field label="NIP">
          <input
            name="nip"
            value={form.nip || ""}
            onChange={update}
            required
          />
        </Field>
        <Field label="Username">
          <input
            name="nama_pengguna"
            value={form.nama_pengguna || ""}
            onChange={update}
            required
          />
        </Field>
        <Field label="Email">
          <input
            type="email"
            name="email"
            value={form.email || ""}
            onChange={update}
            required
          />
        </Field>
        <Field label="Kata sandi">
          <input
            type="password"
            name="kata_sandi"
            value={form.kata_sandi || ""}
            onChange={update}
            required
          />
        </Field>
        <Field label="Nomor telepon">
          <input
            name="nomor_telepon"
            value={form.nomor_telepon || ""}
            onChange={update}
          />
        </Field>
        <button className="primary-button">Tambah Karyawan</button>
      </form>
      <Notice error={error} message={message} />
      <Table
        headers={["NIP", "Nama", "Email", "Status", "Penempatan", "Aksi"]}
        rows={(data.employees || []).map((item) => (
          <tr key={item.id_karyawan}>
            <td>{item.nip}</td>
            <td>{item.nama_lengkap}</td>
            <td>{item.email}</td>
            <td>{item.status_karyawan}</td>
            <td>
              {item.penempatan?.map((p) => p.nama_cabang).join(", ") || "-"}
            </td>
            <td>
              <button className="link-button" onClick={() => place(item)}>
                Tambah penempatan
              </button>
            </td>
          </tr>
        ))}
      />
    </Modal>
  );
}

function BranchModule({ data, onClose, onRefresh }) {
  const [form, setForm] = useState({ radius_meter: 100 });
  const [error, setError] = useState("");
  const update = (event) =>
    setForm({ ...form, [event.target.name]: event.target.value });

  const submit = async (event) => {
    event.preventDefault();
    try {
      await api.post("/admin/branches", form);
      setForm({ radius_meter: 100 });
      onRefresh();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Modal title="Data Cabang" onClose={onClose}>
      <form className="module-form" onSubmit={submit}>
        <Field label="Kode cabang">
          <input name="kode_cabang" onChange={update} required />
        </Field>
        <Field label="Nama cabang">
          <input name="nama_cabang" onChange={update} required />
        </Field>
        <Field label="Alamat">
          <input name="alamat" onChange={update} />
        </Field>
        <Field label="Latitude">
          <input
            type="number"
            step="any"
            name="latitude"
            onChange={update}
            required
          />
        </Field>
        <Field label="Longitude">
          <input
            type="number"
            step="any"
            name="longitude"
            onChange={update}
            required
          />
        </Field>
        <Field label="Radius (meter)">
          <input
            type="number"
            name="radius_meter"
            value={form.radius_meter}
            onChange={update}
            required
          />
        </Field>
        <button className="primary-button">Tambah Cabang</button>
      </form>
      <Notice error={error} />
      <Table
        headers={["Kode", "Nama", "Alamat", "Koordinat", "Radius", "Status"]}
        rows={(data.branches || []).map((item) => (
          <tr key={item.id_cabang}>
            <td>{item.kode_cabang}</td>
            <td>{item.nama_cabang}</td>
            <td>{item.alamat || "-"}</td>
            <td>
              {item.latitude}, {item.longitude}
            </td>
            <td>{item.radius_meter} m</td>
            <td>{item.status_cabang}</td>
          </tr>
        ))}
      />
    </Modal>
  );
}

function ScheduleModule({ data, onClose, onRefresh }) {
  const [form, setForm] = useState({ toleransi_menit: 10 });
  const [error, setError] = useState("");
  const update = (event) =>
    setForm({ ...form, [event.target.name]: event.target.value });

  const submit = async (event) => {
    event.preventDefault();
    try {
      await api.post("/admin/schedules", form);
      setForm({ toleransi_menit: 10 });
      onRefresh();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Modal title="Jadwal & Shift Kerja" onClose={onClose}>
      <form className="module-form" onSubmit={submit}>
        <Field label="Kode jadwal">
          <input
            name="kode_jadwal"
            placeholder="REGULER / PAKUAN_SIANG"
            onChange={update}
            required
          />
        </Field>
        <Field label="Nama jadwal">
          <input name="nama_jadwal" onChange={update} required />
        </Field>
        <Field label="Jam mulai">
          <input type="time" name="jam_mulai" onChange={update} required />
        </Field>
        <Field label="Jam selesai">
          <input type="time" name="jam_selesai" onChange={update} />
        </Field>
        <Field label="Toleransi (menit)">
          <input
            type="number"
            name="toleransi_menit"
            value={form.toleransi_menit}
            onChange={update}
          />
        </Field>
        <button className="primary-button">Tambah Jadwal</button>
      </form>
      <Notice error={error} />
      <Table
        headers={["Cabang", "Hari", "Jadwal", "Mulai", "Toleransi"]}
        rows={(data.schedules || []).map((item) => (
          <tr key={item.id_jadwal_umum}>
            <td>{item.nama_cabang}</td>
            <td>
              {
                ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"][
                  item.hari
                ]
              }
            </td>
            <td>{item.nama_jadwal}</td>
            <td>{String(item.jam_mulai).slice(0, 5)}</td>
            <td>{item.toleransi_menit} menit</td>
          </tr>
        ))}
      />
    </Modal>
  );
}

function AttendanceModule({ data, onClose }) {
  const [filter, setFilter] = useState("");
  const rows = (data.attendance || [])
    .filter((item) =>
      `${item.nama_lengkap} ${item.nip} ${item.nama_cabang}`
        .toLowerCase()
        .includes(filter.toLowerCase()),
    )
    .map((item) => (
      <tr key={item.id_absensi}>
        <td>{formatDate(item.tanggal)}</td>
        <td>
          {item.nama_lengkap}
          <br />
          <small>{item.nip}</small>
        </td>
        <td>{item.nama_cabang}</td>
        <td>{formatDateTime(item.waktu_masuk)}</td>
        <td>{formatDateTime(item.waktu_pulang)}</td>
        <td>{item.status_kehadiran}</td>
        <td>{item.menit_terlambat} menit</td>
        <td>{money(item.potongan)}</td>
      </tr>
    ));

  return (
    <Modal title="Monitoring Presensi" onClose={onClose}>
      <Field label="Cari karyawan/cabang">
        <input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Ketik untuk mencari..."
        />
      </Field>
      <Table
        headers={[
          "Tanggal",
          "Karyawan",
          "Cabang",
          "Masuk",
          "Pulang",
          "Status",
          "Terlambat",
          "Potongan",
        ]}
        rows={rows}
      />
    </Modal>
  );
}

function SubmissionModule({ data, onClose, onRefresh }) {
  const [status, setStatus] = useState("menunggu");
  const [error, setError] = useState("");

  const decide = async (id, keputusan) => {
    try {
      await api.patch(`/admin/submissions/${id}/decision`, { keputusan });
      onRefresh();
    } catch (err) {
      setError(err.message);
    }
  };

  const list = (data.submissions || [])
    .filter((item) => status === "semua" || item.status === status)
    .map((item) => (
      <tr key={item.id_pengajuan}>
        <td>
          {item.nama_lengkap}
          <br />
          <small>{item.nip}</small>
        </td>
        <td>{item.jenis}</td>
        <td>
          {formatDate(item.tanggal_mulai)} - {formatDate(item.tanggal_selesai)}
        </td>
        <td>{item.alasan}</td>
        <td>{item.status}</td>
        <td>
          {item.status === "menunggu" && (
            <>
              <button
                className="link-button"
                onClick={() => decide(item.id_pengajuan, "disetujui")}
              >
                Setujui
              </button>{" "}
              <button
                className="danger-link"
                onClick={() => decide(item.id_pengajuan, "ditolak")}
              >
                Tolak
              </button>
            </>
          )}
        </td>
      </tr>
    ));

  return (
    <Modal title="Pengajuan Izin & Sakit" onClose={onClose}>
      <Field label="Filter status">
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="menunggu">Menunggu</option>
          <option value="disetujui">Disetujui</option>
          <option value="ditolak">Ditolak</option>
          <option value="semua">Semua</option>
        </select>
      </Field>
      <Notice error={error} />
      <Table
        headers={["Karyawan", "Jenis", "Periode", "Alasan", "Status", "Aksi"]}
        rows={list}
      />
    </Modal>
  );
}

function ReportModule({ onClose }) {
  const [form, setForm] = useState(() => {
    const curYear = new Date().getFullYear();
    return { dari: `${curYear}-01-01`, sampai: `${curYear}-12-31` };
  });
  const [error, setError] = useState("");
  const update = (event) =>
    setForm({ ...form, [event.target.name]: event.target.value });

  const download = async (event) => {
    event.preventDefault();
    try {
      const response = await api.download(
        `/admin/reports/export?dari=${form.dari}&sampai=${form.sampai}`,
      );
      if (!response.ok) throw new Error("Laporan gagal dibuat.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `laporan-presensi-${form.dari}-${form.sampai}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Modal title="Laporan & Rekap" onClose={onClose}>
      <p className="muted">
        Laporan memuat data presensi seluruh cabang, keterlambatan, dan
        potongan.
      </p>
      <form className="module-form" onSubmit={download}>
        <Field label="Dari">
          <input type="date" name="dari" value={form.dari} onChange={update} />
        </Field>
        <Field label="Sampai">
          <input
            type="date"
            name="sampai"
            value={form.sampai}
            onChange={update}
          />
        </Field>
        <button className="primary-button">Unduh Excel (.xlsx)</button>
      </form>
      <Notice error={error} />
    </Modal>
  );
}
