import { useState, useEffect } from "react";
import "./Dashboard.css";
import { api, formatDate, formatDateTime, logout, money } from "../services/api";

const DAYS_ID = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

export default function AdminDashboard() {
  const [adminUser, setAdminUser] = useState(() => JSON.parse(localStorage.getItem("pengguna") || "null"));
  const pengguna = adminUser;

  // Read initial tab from URL param or default to 'dashboard'
  const getInitialTab = () => {
    const param = new URLSearchParams(window.location.search).get("page");
    if (["dashboard", "karyawan", "cabang", "jadwal", "presensi", "pengajuan", "laporan"].includes(param)) {
      return param;
    }
    return "dashboard";
  };

  const [activeTab, setActiveTab] = useState(getInitialTab);

  // Real-time clock & popout modal
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isClockModalOpen, setIsClockModalOpen] = useState(false);

  // Core administrative data
  const [summary, setSummary] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [branches, setBranches] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [submissions, setSubmissions] = useState([]);

  // UI state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  // Modals state
  const [isAddEmployeeModalOpen, setIsAddEmployeeModalOpen] = useState(false);
  const [isPlacementModalOpen, setIsPlacementModalOpen] = useState(false);
  const [selectedEmployeeForPlacement, setSelectedEmployeeForPlacement] = useState(null);
  const [isAddBranchModalOpen, setIsAddBranchModalOpen] = useState(false);
  const [isAddScheduleModalOpen, setIsAddScheduleModalOpen] = useState(false);
  const [decisionModal, setDecisionModal] = useState(null); // { id, decision: 'disetujui' | 'ditolak', name }
  const [employeeToDelete, setEmployeeToDelete] = useState(null);
  const [deletingEmployee, setDeletingEmployee] = useState(false);
  const [detailModal, setDetailModal] = useState(null);

  // Kelola Cabang Modal state
  const [selectedBranchForKelola, setSelectedBranchForKelola] = useState(null);
  const [deletingBranch, setDeletingBranch] = useState(false);

  // Kelola Jadwal Modal state
  const [selectedScheduleForKelola, setSelectedScheduleForKelola] = useState(null);
  const [editScheduleForm, setEditScheduleForm] = useState({
    id_cabang: "",
    nama_jadwal: "",
    jam_mulai: "10:00",
    jam_selesai: "22:00",
    toleransi_menit: 10,
  });
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [deletingSchedule, setDeletingSchedule] = useState(false);

  // Selection & Bulk Actions state for Monitoring Presensi
  const [selectedAttendanceIds, setSelectedAttendanceIds] = useState([]);
  const [deletingAttendance, setDeletingAttendance] = useState(false);

  // Selection & Bulk Actions state for Pengajuan Izin
  const [selectedSubmissionIds, setSelectedSubmissionIds] = useState([]);
  const [deletingSubmissions, setDeletingSubmissions] = useState(false);

  // Kelola Karyawan Unified Modal state
  const [selectedEmployeeForKelola, setSelectedEmployeeForKelola] = useState(null);
  const [kelolaTab, setKelolaTab] = useState("cabang"); // 'cabang' | 'libur' | 'status' | 'hapus'
  const [kelolaDaysOff, setKelolaDaysOff] = useState([]);
  const [savingDaysOff, setSavingDaysOff] = useState(false);
  const [savingPlacement, setSavingPlacement] = useState(false);
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState("");

  // Search & Filter state
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [employeeStatusFilter, setEmployeeStatusFilter] = useState("semua");
  const [branchSearch, setBranchSearch] = useState("");
  const [attendanceSearch, setAttendanceSearch] = useState("");
  const [attendanceBranchFilter, setAttendanceBranchFilter] = useState("");
  const [attendanceDateDari, setAttendanceDateDari] = useState("");
  const [attendanceDateSampai, setAttendanceDateSampai] = useState("");
  const [submissionFilter, setSubmissionFilter] = useState("semua");

  // Form states
  const [employeeForm, setEmployeeForm] = useState({
    nama_lengkap: "",
    nip: "",
    nama_pengguna: "",
    email: "",
    kata_sandi: "",
    nomor_telepon: "",
    tanggal_bergabung: new Date().toISOString().slice(0, 10),
  });
  const [placementForm, setPlacementForm] = useState({
    id_cabang: "",
    tanggal_mulai: new Date().toISOString().slice(0, 10),
  });
  const [branchForm, setBranchForm] = useState({
    kode_cabang: "",
    nama_cabang: "",
    alamat: "",
    latitude: "",
    longitude: "",
    radius_meter: 100,
    kode_qr: "",
  });
  const [scheduleForm, setScheduleForm] = useState({
    id_cabang: "",
    nama_jadwal: "Shift Reguler",
    kode_jadwal: "REGULER",
    jam_mulai: "10:00",
    jam_selesai: "22:00",
    toleransi_menit: 10,
  });
  const [decisionNote, setDecisionNote] = useState("");
  const [reportDates, setReportDates] = useState(() => {
    const curYear = new Date().getFullYear();
    return {
      dari: `${curYear}-01-01`,
      sampai: `${curYear}-12-31`,
    };
  });
  const [downloadingReport, setDownloadingReport] = useState(false);
  const [reportMonthFilter, setReportMonthFilter] = useState("semua");
  const [reportBranchFilter, setReportBranchFilter] = useState("semua");

  // Admin Account Settings Modal state
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [accountForm, setAccountForm] = useState({
    nama_pengguna: "",
    email: "",
    kata_sandi_saat_ini: "",
    kata_sandi_baru: "",
    konfirmasi_kata_sandi: "",
  });
  const [savingAccount, setSavingAccount] = useState(false);
  const [accountModalError, setAccountModalError] = useState("");
  const [accountModalSuccess, setAccountModalSuccess] = useState("");

  // Update clock every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Escape key for clock modal
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape") {
        setIsClockModalOpen(false);
        setIsAddEmployeeModalOpen(false);
        setIsPlacementModalOpen(false);
        setIsAddBranchModalOpen(false);
        setIsAddScheduleModalOpen(false);
        setDecisionModal(null);
        setEmployeeToDelete(null);
        setDetailModal(null);
        setSelectedBranchForKelola(null);
        setSelectedScheduleForKelola(null);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Sync tab with browser URL history
  const handleNavClick = (page) => {
    setActiveTab(page);
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
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Load all admin data
  const loadAdminData = async () => {
    try {
      setLoading(true);
      const [sumRes, empRes, brRes, schRes, attRes, subRes] = await Promise.all([
        api.get("/admin/summary"),
        api.get("/admin/employees"),
        api.get("/admin/branches"),
        api.get("/admin/schedules"),
        api.get("/admin/attendance"),
        api.get("/admin/submissions"),
      ]);
      setSummary(sumRes.data || null);
      setEmployees(empRes.data || []);
      setBranches(brRes.data || []);
      setSchedules(schRes.data || []);
      setAttendance(attRes.data || []);
      setSubmissions(subRes.data || []);
      setError("");
    } catch (err) {
      setError(err.message || "Gagal memuat data administrator.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdminData();
  }, []);

  function handleLogout() {
    logout("admin");
  }

  const handleOpenAccountModal = async () => {
    setAccountModalError("");
    setAccountModalSuccess("");
    setAccountForm({
      nama_pengguna: adminUser?.nama_pengguna || "",
      email: adminUser?.email || "",
      kata_sandi_saat_ini: "",
      kata_sandi_baru: "",
      konfirmasi_kata_sandi: "",
    });
    setIsAccountModalOpen(true);

    try {
      const res = await api.get("/admin/account");
      if (res.data?.success && res.data.data) {
        setAccountForm((prev) => ({
          ...prev,
          nama_pengguna: res.data.data.nama_pengguna,
          email: res.data.data.email,
        }));
      }
    } catch {
      // fallback to adminUser state
    }
  };

  const handleSaveAccount = async (e) => {
    e.preventDefault();
    setAccountModalError("");
    setAccountModalSuccess("");

    if (!accountForm.nama_pengguna.trim()) {
      setAccountModalError("Username administrator tidak boleh kosong.");
      return;
    }
    if (!accountForm.email.trim()) {
      setAccountModalError("Email administrator tidak boleh kosong.");
      return;
    }
    if (!accountForm.kata_sandi_saat_ini) {
      setAccountModalError("Kata sandi saat ini wajib diisi untuk verifikasi keamanan.");
      return;
    }
    if (accountForm.kata_sandi_baru) {
      if (accountForm.kata_sandi_baru.length < 6) {
        setAccountModalError("Kata sandi baru minimal 6 karakter.");
        return;
      }
      if (accountForm.kata_sandi_baru !== accountForm.konfirmasi_kata_sandi) {
        setAccountModalError("Konfirmasi kata sandi baru tidak cocok.");
        return;
      }
    }

    setSavingAccount(true);
    try {
      const payload = {
        nama_pengguna: accountForm.nama_pengguna.trim(),
        email: accountForm.email.trim().toLowerCase(),
        kata_sandi_saat_ini: accountForm.kata_sandi_saat_ini,
      };
      if (accountForm.kata_sandi_baru && accountForm.kata_sandi_baru.trim()) {
        payload.kata_sandi_baru = accountForm.kata_sandi_baru.trim();
      }

      const res = await api.patch("/admin/account", payload);
      if (res.data?.success) {
        const updated = {
          ...adminUser,
          ...res.data.data,
        };
        setAdminUser(updated);
        localStorage.setItem("pengguna", JSON.stringify(updated));
        if (res.data.token) {
          localStorage.setItem("token", res.data.token);
        }
        setAccountModalSuccess("Akun administrator berhasil diperbarui!");
        setTimeout(() => {
          setIsAccountModalOpen(false);
        }, 1200);
      }
    } catch (err) {
      setAccountModalError(
        err.response?.data?.message || err.message || "Gagal memperbarui akun administrator."
      );
    } finally {
      setSavingAccount(false);
    }
  };

  // Indonesian date & time
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

  // Filtered employees
  const filteredEmployees = employees.filter((item) => {
    const matchesSearch =
      `${item.nama_lengkap} ${item.nip} ${item.email} ${item.nama_pengguna}`
        .toLowerCase()
        .includes(employeeSearch.toLowerCase()) ||
      (item.penempatan && item.penempatan.some((p) => p.nama_cabang?.toLowerCase().includes(employeeSearch.toLowerCase())));
    const matchesStatus =
      employeeStatusFilter === "semua" || item.status_karyawan === employeeStatusFilter;
    return matchesSearch && matchesStatus;
  });

  // Filtered branches
  const filteredBranches = branches.filter((item) => {
    return (
      `${item.kode_cabang} ${item.nama_cabang} ${item.alamat}`
        .toLowerCase()
        .includes(branchSearch.toLowerCase())
    );
  });

  // Filtered attendance
  const filteredAttendance = attendance.filter((item) => {
    const matchesSearch = `${item.nama_lengkap} ${item.nip} ${item.nama_cabang}`
      .toLowerCase()
      .includes(attendanceSearch.toLowerCase());
    const matchesBranch =
      !attendanceBranchFilter || String(item.nama_cabang) === attendanceBranchFilter;
    const matchesDateDari =
      !attendanceDateDari || (item.tanggal && item.tanggal.slice(0, 10) >= attendanceDateDari);
    const matchesDateSampai =
      !attendanceDateSampai || (item.tanggal && item.tanggal.slice(0, 10) <= attendanceDateSampai);
    return matchesSearch && matchesBranch && matchesDateDari && matchesDateSampai;
  });

  // Filtered submissions
  const filteredSubmissions = submissions.filter((item) => {
    if (submissionFilter === "semua") return true;
    return (item.status || "").toLowerCase() === submissionFilter.toLowerCase();
  });

  const pendingSubmissionsCount = submissions.filter(
    (s) => (s.status || "").toLowerCase() === "menunggu"
  ).length;

  // Laporan & Rekap Bulanan helpers & computations
  const monthsList = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
  ];

  const handleMonthChange = (e) => {
    const val = e.target.value;
    setReportMonthFilter(val);
    const now = new Date();
    const year = now.getFullYear();
    if (val === "semua") {
      setReportDates({
        dari: `${year}-01-01`,
        sampai: `${year}-12-31`,
      });
    } else {
      const monthIdx = parseInt(val, 10);
      const mStr = String(monthIdx + 1).padStart(2, "0");
      const lastDayNum = new Date(year, monthIdx + 1, 0).getDate();
      const lastDayStr = String(lastDayNum).padStart(2, "0");
      setReportDates({
        dari: `${year}-${mStr}-01`,
        sampai: `${year}-${mStr}-${lastDayStr}`,
      });
    }
  };

  const formatDateStrID = (val) => {
    if (!val) return "-";
    if (typeof val === "string") {
      const m = val.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    }
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    const day = String(d.getDate()).padStart(2, "0");
    const mon = String(d.getMonth() + 1).padStart(2, "0");
    return `${day}/${mon}/${d.getFullYear()}`;
  };

  const formatTimeOnlyStr = (val) => {
    if (!val) return "-";
    try {
      const d = new Date(val);
      if (isNaN(d.getTime())) return String(val).slice(0, 5);
      return new Intl.DateTimeFormat("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Asia/Jakarta",
      })
        .format(d)
        .replace(".", ":");
    } catch {
      return "-";
    }
  };

  const formatDisplayPeriod = (dariStr, sampaiStr) => {
    try {
      const d1 = new Date(dariStr + "T00:00:00");
      const d2 = new Date(sampaiStr + "T00:00:00");
      const day1 = d1.getDate();
      const day2 = d2.getDate();
      const mon1 = monthsList[d1.getMonth()];
      const mon2 = monthsList[d2.getMonth()];
      const yr1 = d1.getFullYear();
      const yr2 = d2.getFullYear();
      if (yr1 === yr2 && mon1 === mon2) {
        return `${day1} – ${day2} ${mon2} ${yr2}`;
      }
      if (yr1 === yr2) {
        return `${day1} ${mon1} – ${day2} ${mon2} ${yr2}`;
      }
      return `${day1} ${mon1} ${yr1} – ${day2} ${mon2} ${yr2}`;
    } catch {
      return `${dariStr} s/d ${sampaiStr}`;
    }
  };

  const preferredBranchOrder = ["pakuan", "botani", "azimar", "warung nangka", "ats", "ciapus"];
  const sortedBranches = [...branches].sort((a, b) => {
    const idxA = preferredBranchOrder.findIndex((p) => a.nama_cabang.toLowerCase().includes(p));
    const idxB = preferredBranchOrder.findIndex((p) => b.nama_cabang.toLowerCase().includes(p));
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.nama_cabang.localeCompare(b.nama_cabang);
  });

  const reportAttendance = attendance.filter((a) => {
    const tgl = a.tanggal ? String(a.tanggal).slice(0, 10) : "";
    if (reportDates.dari && tgl < reportDates.dari) return false;
    if (reportDates.sampai && tgl > reportDates.sampai) return false;
    return true;
  });

  const branchSummaryList = [];
  const displayBranchCards = [];

  let overallHadir = 0;
  let overallTerlambat = 0;
  let overallIzin = 0;
  let overallSakit = 0;
  let overallAlfa = 0;
  let overallMenit = 0;
  let overallPotongan = 0;

  sortedBranches.forEach((br) => {
    if (reportBranchFilter !== "semua" && br.nama_cabang.toLowerCase() !== reportBranchFilter.toLowerCase()) {
      return;
    }

    const brEmps = employees.filter((e) =>
      e.penempatan?.some((p) => String(p.id_cabang) === String(br.id_cabang))
    );

    const brAtts = reportAttendance.filter(
      (a) => String(a.nama_cabang).toLowerCase() === br.nama_cabang.toLowerCase()
    );

    let hadir = 0;
    let terlambat = 0;
    let izin = 0;
    let sakit = 0;
    let alfa = 0;
    let menit = 0;
    let potongan = 0;

    brAtts.forEach((a) => {
      const s = (a.status_kehadiran || "").toLowerCase();
      const m = Number(a.menit_terlambat) || 0;
      menit += m;
      if (s === "hadir") {
        hadir++;
      } else if (s === "terlambat") {
        hadir++; // Terlambat juga terhitung sebagai hadir
        terlambat++;
        potongan += m * 1000;
      } else if (s === "izin") {
        izin++;
        potongan += 65000;
      } else if (s === "sakit") {
        sakit++;
      } else if (s === "alfa") {
        alfa++;
        potongan += 100000;
      }
    });

    overallHadir += hadir;
    overallTerlambat += terlambat;
    overallIzin += izin;
    overallSakit += sakit;
    overallAlfa += alfa;
    overallMenit += menit;
    overallPotongan += potongan;

    branchSummaryList.push({
      nama_cabang: br.nama_cabang,
      hadir,
      terlambat,
      izin,
      sakit,
      alfa,
      totalPotongan: potongan,
    });

    displayBranchCards.push({
      nama_cabang: br.nama_cabang,
      totalKaryawan: brEmps.length || brAtts.length ? Math.max(brEmps.length, new Set(brAtts.map((a) => a.nip)).size) : 0,
      records: brAtts,
    });
  });

  // Rekap Bulanan Per Karyawan (Sesuai Permintaan User)
  const employeeRecapList = employees.map((emp, idx) => {
    const eAtts = reportAttendance.filter(
      (a) => a.nip === emp.nip || a.nama_lengkap?.toLowerCase() === emp.nama_lengkap?.toLowerCase()
    );

    let hadir = 0;
    let terlambat = 0;
    let izin = 0;
    let sakit = 0;
    let alfa = 0;
    let menit = 0;

    eAtts.forEach((a) => {
      const s = (a.status_kehadiran || "").toLowerCase();
      const m = Number(a.menit_terlambat) || 0;
      menit += m;
      if (s === "hadir") {
        hadir++;
      } else if (s === "terlambat") {
        hadir++; // Terlambat juga terhitung sebagai hadir
        terlambat++;
      } else if (s === "izin") izin++;
      else if (s === "sakit") sakit++;
      else if (s === "alfa") alfa++;
    });

    const totalPotongan = menit * 1000 + izin * 65000 + alfa * 100000;
    const cabang = emp.penempatan?.[0]?.nama_cabang || (eAtts[0]?.nama_cabang || "Pusat");

    return {
      no: idx + 1,
      nama_lengkap: emp.nama_lengkap,
      cabang,
      hadir,
      terlambat,
      izin,
      sakit,
      alfa,
      totalPotongan,
    };
  });

  const totalPresensi = overallHadir + overallIzin + overallSakit + overallAlfa;
  const attendanceRate = totalPresensi > 0
    ? ((overallHadir / totalPresensi) * 100).toFixed(1)
    : "100.0";

  const overallSummary = {
    hadir: overallHadir,
    terlambat: overallTerlambat,
    izin: overallIzin,
    sakit: overallSakit,
    alfa: overallAlfa,
    menitTerlambat: overallMenit,
    totalPotongan: overallPotongan,
  };

  // Handler: Tambah Karyawan
  const handleAddEmployee = async (e) => {
    e.preventDefault();
    try {
      await api.post("/admin/employees", employeeForm);
      setIsAddEmployeeModalOpen(false);
      setEmployeeForm({
        nama_lengkap: "",
        nip: "",
        nama_pengguna: "",
        email: "",
        kata_sandi: "",
        nomor_telepon: "",
        tanggal_bergabung: new Date().toISOString().slice(0, 10),
      });
      setActionMessage("Karyawan baru berhasil didaftarkan.");
      loadAdminData();
    } catch (err) {
      setError(err.message || "Gagal menambahkan karyawan.");
    }
  };

  // Handler: Toggle status karyawan
  const handleToggleEmployeeStatus = async (employee) => {
    const nextStatus = employee.status_karyawan === "aktif" ? "nonaktif" : "aktif";
    const confirmMsg = `Yakin ingin mengubah status karyawan ${employee.nama_lengkap} menjadi ${nextStatus.toUpperCase()}?`;
    if (!window.confirm(confirmMsg)) return;
    try {
      await api.patch(`/admin/employees/${employee.id_karyawan}/status`, {
        status_karyawan: nextStatus,
      });
      setActionMessage(`Status karyawan ${employee.nama_lengkap} diubah menjadi ${nextStatus}.`);
      loadAdminData();
    } catch (err) {
      setError(err.message || "Gagal mengubah status karyawan.");
    }
  };

  // Handler: Hapus Akun Karyawan
  const handleConfirmDeleteEmployee = async () => {
    if (!employeeToDelete) return;
    try {
      setDeletingEmployee(true);
      const res = await api.delete(`/admin/employees/${employeeToDelete.id_karyawan}`);
      setEmployeeToDelete(null);
      setActionMessage(res.message || `Akun karyawan ${employeeToDelete.nama_lengkap} berhasil dihapus.`);
      loadAdminData();
    } catch (err) {
      setError(err.message || "Gagal menghapus karyawan.");
    } finally {
      setDeletingEmployee(false);
    }
  };

  // Handler: Atur Penempatan Cabang
  const handleSavePlacement = async (e) => {
    e.preventDefault();
    if (!selectedEmployeeForPlacement || !placementForm.id_cabang) return;
    try {
      await api.post("/admin/placements", {
        id_karyawan: selectedEmployeeForPlacement.id_karyawan,
        id_cabang: placementForm.id_cabang,
        tanggal_mulai: placementForm.tanggal_mulai,
      });
      setIsPlacementModalOpen(false);
      setSelectedEmployeeForPlacement(null);
      setActionMessage("Penempatan cabang karyawan berhasil diperbarui.");
      loadAdminData();
    } catch (err) {
      setError(err.message || "Gagal menyimpan penempatan cabang.");
    }
  };

  // Handlers: Unified Kelola Karyawan (Cabang, Hari Libur, Status Akun, Hapus Akun)
  const handleOpenKelola = (emp) => {
    setSelectedEmployeeForKelola(emp);
    setKelolaTab("cabang");
    setPlacementForm({
      id_cabang: emp.penempatan?.[0]?.id_cabang ? String(emp.penempatan[0].id_cabang) : "",
      tanggal_mulai: emp.penempatan?.[0]?.tanggal_mulai ? String(emp.penempatan[0].tanggal_mulai).slice(0, 10) : new Date().toISOString().slice(0, 10),
    });
    setKelolaDaysOff(Array.isArray(emp.hari_libur) ? [...emp.hari_libur] : []);
    setDeleteConfirmationText("");
  };

  const handleToggleDayOff = (dayName) => {
    setKelolaDaysOff((prev) =>
      prev.includes(dayName) ? prev.filter((d) => d !== dayName) : [...prev, dayName]
    );
  };

  const handleSaveDaysOff = async () => {
    if (!selectedEmployeeForKelola) return;
    try {
      setSavingDaysOff(true);
      const res = await api.patch(`/admin/employees/${selectedEmployeeForKelola.id_karyawan}/days-off`, {
        hari_libur: kelolaDaysOff,
      });
      setActionMessage(res.message || `Hari libur karyawan ${selectedEmployeeForKelola.nama_lengkap} berhasil diperbarui.`);
      setSelectedEmployeeForKelola((prev) => (prev ? { ...prev, hari_libur: kelolaDaysOff } : null));
      loadAdminData();
    } catch (err) {
      setError(err.message || "Gagal memperbarui hari libur karyawan.");
    } finally {
      setSavingDaysOff(false);
    }
  };

  const handleSavePlacementInKelola = async (e) => {
    if (e) e.preventDefault();
    if (!selectedEmployeeForKelola || !placementForm.id_cabang) {
      setError("Silakan pilih cabang penempatan terlebih dahulu.");
      return;
    }
    try {
      setSavingPlacement(true);
      await api.post("/admin/placements", {
        id_karyawan: selectedEmployeeForKelola.id_karyawan,
        id_cabang: placementForm.id_cabang,
        tanggal_mulai: placementForm.tanggal_mulai,
      });
      setActionMessage(`Penempatan cabang karyawan ${selectedEmployeeForKelola.nama_lengkap} berhasil diperbarui.`);
      loadAdminData();
      const chosenBranch = branches.find((b) => String(b.id_cabang) === String(placementForm.id_cabang));
      if (chosenBranch) {
        setSelectedEmployeeForKelola((prev) =>
          prev
            ? {
                ...prev,
                penempatan: [
                  {
                    id_cabang: chosenBranch.id_cabang,
                    nama_cabang: chosenBranch.nama_cabang,
                    tanggal_mulai: placementForm.tanggal_mulai,
                  },
                ],
              }
            : null
        );
      }
    } catch (err) {
      setError(err.message || "Gagal menyimpan penempatan cabang.");
    } finally {
      setSavingPlacement(false);
    }
  };

  const handleToggleStatusInKelola = async () => {
    if (!selectedEmployeeForKelola) return;
    const nextStatus = selectedEmployeeForKelola.status_karyawan === "aktif" ? "nonaktif" : "aktif";
    try {
      setTogglingStatus(true);
      await api.patch(`/admin/employees/${selectedEmployeeForKelola.id_karyawan}/status`, {
        status_karyawan: nextStatus,
      });
      setActionMessage(`Status karyawan ${selectedEmployeeForKelola.nama_lengkap} berhasil diubah menjadi ${nextStatus.toUpperCase()}.`);
      setSelectedEmployeeForKelola((prev) => (prev ? { ...prev, status_karyawan: nextStatus } : null));
      loadAdminData();
    } catch (err) {
      setError(err.message || "Gagal mengubah status karyawan.");
    } finally {
      setTogglingStatus(false);
    }
  };

  const handleDeleteInKelola = async () => {
    if (!selectedEmployeeForKelola) return;
    try {
      setDeletingEmployee(true);
      const res = await api.delete(`/admin/employees/${selectedEmployeeForKelola.id_karyawan}`);
      const empName = selectedEmployeeForKelola.nama_lengkap;
      setSelectedEmployeeForKelola(null);
      setActionMessage(res.message || `Akun karyawan ${empName} berhasil dihapus.`);
      loadAdminData();
    } catch (err) {
      setError(err.message || "Gagal menghapus akun karyawan.");
    } finally {
      setDeletingEmployee(false);
    }
  };

  // Handler: Tambah Cabang
  const handleAddBranch = async (e) => {
    e.preventDefault();
    try {
      await api.post("/admin/branches", {
        ...branchForm,
        latitude: parseFloat(branchForm.latitude),
        longitude: parseFloat(branchForm.longitude),
        radius_meter: parseInt(branchForm.radius_meter) || 100,
      });
      setIsAddBranchModalOpen(false);
      setBranchForm({
        kode_cabang: "",
        nama_cabang: "",
        alamat: "",
        latitude: "",
        longitude: "",
        radius_meter: 100,
        kode_qr: "",
      });
      setActionMessage("Cabang baru berhasil ditambahkan.");
      loadAdminData();
    } catch (err) {
      setError(err.message || "Gagal menambahkan cabang.");
    }
  };

  // Handler: Toggle status cabang dari modal
  const handleToggleBranchStatusFromModal = async () => {
    if (!selectedBranchForKelola) return;
    const nextStatus = selectedBranchForKelola.status_cabang === "aktif" ? "nonaktif" : "aktif";
    try {
      setTogglingStatus(true);
      await api.patch(`/admin/branches/${selectedBranchForKelola.id_cabang}`, {
        status_cabang: nextStatus,
      });
      setSelectedBranchForKelola({ ...selectedBranchForKelola, status_cabang: nextStatus });
      setActionMessage(`Status cabang ${selectedBranchForKelola.nama_cabang} berhasil diubah menjadi ${nextStatus.toUpperCase()}.`);
      loadAdminData();
    } catch (err) {
      setError(err.message || "Gagal mengubah status cabang.");
    } finally {
      setTogglingStatus(false);
    }
  };

  // Handler: Hapus Cabang
  const handleDeleteBranchFromModal = async () => {
    if (!selectedBranchForKelola) return;
    const confirmDelete = window.confirm(
      `PERINGATAN: Apakah Anda yakin ingin MENGHAPUS cabang "${selectedBranchForKelola.nama_cabang}" secara permanen?\n\nSemua jadwal shift kerja dan riwayat penempatan di cabang ini akan ikut terhapus!`
    );
    if (!confirmDelete) return;

    try {
      setDeletingBranch(true);
      await api.delete(`/admin/branches/${selectedBranchForKelola.id_cabang}`);
      const branchName = selectedBranchForKelola.nama_cabang;
      setSelectedBranchForKelola(null);
      setActionMessage(`Cabang ${branchName} berhasil dihapus.`);
      loadAdminData();
    } catch (err) {
      setError(err.message || "Gagal menghapus cabang.");
    } finally {
      setDeletingBranch(false);
    }
  };

  // Handler: Toggle status cabang (legacy support)
  const handleToggleBranchStatus = async (branch) => {
    const nextStatus = branch.status_cabang === "aktif" ? "nonaktif" : "aktif";
    if (!window.confirm(`Ubah status cabang ${branch.nama_cabang} menjadi ${nextStatus.toUpperCase()}?`)) return;
    try {
      await api.patch(`/admin/branches/${branch.id_cabang}`, {
        status_cabang: nextStatus,
      });
      setActionMessage(`Status cabang ${branch.nama_cabang} berhasil diubah.`);
      loadAdminData();
    } catch (err) {
      setError(err.message || "Gagal memperbarui cabang.");
    }
  };

  // Handler: Tambah Jadwal Shift
  const handleAddSchedule = async (e) => {
    e.preventDefault();
    try {
      await api.post("/admin/schedules", {
        ...scheduleForm,
        toleransi_menit: parseInt(scheduleForm.toleransi_menit) || 10,
      });
      setIsAddScheduleModalOpen(false);
      setScheduleForm({
        id_cabang: "",
        nama_jadwal: "Shift Reguler",
        kode_jadwal: "REGULER",
        jam_mulai: "10:00",
        jam_selesai: "22:00",
        toleransi_menit: 10,
      });
      setActionMessage("Jadwal shift kerja berhasil ditambahkan.");
      loadAdminData();
    } catch (err) {
      setError(err.message || "Gagal menambahkan jadwal shift.");
    }
  };

  // Handler: Update Jadwal Shift
  const handleUpdateSchedule = async (e) => {
    e.preventDefault();
    if (!selectedScheduleForKelola) return;
    try {
      setSavingSchedule(true);
      await api.patch(`/admin/schedules/${selectedScheduleForKelola.id_jadwal_umum}`, {
        jam_mulai: editScheduleForm.jam_mulai,
        jam_selesai: editScheduleForm.jam_selesai || null,
        toleransi_menit: parseInt(editScheduleForm.toleransi_menit) || 10,
        id_cabang: editScheduleForm.id_cabang ? parseInt(editScheduleForm.id_cabang) : undefined,
      });
      setSelectedScheduleForKelola(null);
      setActionMessage("Jadwal shift kerja berhasil diperbarui.");
      loadAdminData();
    } catch (err) {
      setError(err.message || "Gagal memperbarui jadwal shift.");
    } finally {
      setSavingSchedule(false);
    }
  };

  // Handler: Hapus Jadwal Shift
  const handleDeleteSchedule = async () => {
    if (!selectedScheduleForKelola) return;
    if (!window.confirm("Apakah Anda yakin ingin menghapus jadwal shift ini?")) return;
    try {
      setDeletingSchedule(true);
      await api.delete(`/admin/schedules/${selectedScheduleForKelola.id_jadwal_umum}`);
      setSelectedScheduleForKelola(null);
      setActionMessage("Jadwal shift berhasil dihapus.");
      loadAdminData();
    } catch (err) {
      setError(err.message || "Gagal menghapus jadwal shift.");
    } finally {
      setDeletingSchedule(false);
    }
  };

  // Selection Presensi handlers
  const handleToggleSelectAllAttendance = () => {
    const visibleIds = filteredAttendance.map((a) => a.id_absensi);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedAttendanceIds.includes(id));
    if (allSelected) {
      setSelectedAttendanceIds([]);
    } else {
      setSelectedAttendanceIds(visibleIds);
    }
  };

  const handleToggleSelectAttendance = (id) => {
    setSelectedAttendanceIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleDeleteSingleAttendance = async (id) => {
    if (!window.confirm("Apakah Anda yakin ingin menghapus data presensi ini?")) return;
    try {
      await api.delete(`/admin/attendance/${id}`);
      setSelectedAttendanceIds((prev) => prev.filter((item) => item !== id));
      setActionMessage("Data presensi berhasil dihapus.");
      loadAdminData();
    } catch (err) {
      setError(err.message || "Gagal menghapus data presensi.");
    }
  };

  const handleBulkDeleteAttendance = async () => {
    if (selectedAttendanceIds.length === 0) return;
    const confirmDelete = window.confirm(
      `PERINGATAN: Apakah Anda yakin ingin menghapus ${selectedAttendanceIds.length} data presensi terpilih?\nTindakan ini tidak dapat dibatalkan.`
    );
    if (!confirmDelete) return;

    try {
      setDeletingAttendance(true);
      await api.post("/admin/attendance/bulk-delete", { ids: selectedAttendanceIds });
      setSelectedAttendanceIds([]);
      setActionMessage("Data presensi terpilih berhasil dihapus.");
      loadAdminData();
    } catch (err) {
      setError(err.message || "Gagal menghapus data presensi terpilih.");
    } finally {
      setDeletingAttendance(false);
    }
  };

  const handleDeleteAllAttendance = async () => {
    const confirmDelete = window.confirm(
      "PERINGATAN KRITIS: Apakah Anda yakin ingin MENGHAPUS SEMUA DATA PRESENSI?\n\nSeluruh rekaman absensi karyawan akan dihapus secara permanen dari sistem!"
    );
    if (!confirmDelete) return;

    try {
      setDeletingAttendance(true);
      await api.post("/admin/attendance/bulk-delete", { all: true });
      setSelectedAttendanceIds([]);
      setActionMessage("Seluruh rekaman presensi berhasil dihapus.");
      loadAdminData();
    } catch (err) {
      setError(err.message || "Gagal menghapus seluruh data presensi.");
    } finally {
      setDeletingAttendance(false);
    }
  };

  // Selection Pengajuan handlers
  const handleToggleSelectAllSubmissions = () => {
    const visibleIds = filteredSubmissions.map((s) => s.id_pengajuan);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedSubmissionIds.includes(id));
    if (allSelected) {
      setSelectedSubmissionIds([]);
    } else {
      setSelectedSubmissionIds(visibleIds);
    }
  };

  const handleToggleSelectSubmission = (id) => {
    setSelectedSubmissionIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleDeleteSingleSubmission = async (id) => {
    if (!window.confirm("Apakah Anda yakin ingin menghapus data pengajuan izin/sakit ini?")) return;
    try {
      await api.delete(`/admin/submissions/${id}`);
      setSelectedSubmissionIds((prev) => prev.filter((item) => item !== id));
      setActionMessage("Data pengajuan berhasil dihapus.");
      loadAdminData();
    } catch (err) {
      setError(err.message || "Gagal menghapus data pengajuan.");
    }
  };

  const handleBulkDeleteSubmissions = async () => {
    if (selectedSubmissionIds.length === 0) return;
    const confirmDelete = window.confirm(
      `PERINGATAN: Apakah Anda yakin ingin menghapus ${selectedSubmissionIds.length} data pengajuan izin/sakit terpilih?\nTindakan ini tidak dapat dibatalkan.`
    );
    if (!confirmDelete) return;

    try {
      setDeletingSubmissions(true);
      await api.post("/admin/submissions/bulk-delete", { ids: selectedSubmissionIds });
      setSelectedSubmissionIds([]);
      setActionMessage("Data pengajuan terpilih berhasil dihapus.");
      loadAdminData();
    } catch (err) {
      setError(err.message || "Gagal menghapus data pengajuan terpilih.");
    } finally {
      setDeletingSubmissions(false);
    }
  };

  const handleDeleteAllSubmissions = async () => {
    const confirmDelete = window.confirm(
      "PERINGATAN KRITIS: Apakah Anda yakin ingin MENGHAPUS SEMUA DATA PENGAJUAN IZIN & SAKIT?\n\nSeluruh riwayat pengajuan akan dihapus secara permanen dari sistem!"
    );
    if (!confirmDelete) return;

    try {
      setDeletingSubmissions(true);
      await api.post("/admin/submissions/bulk-delete", { all: true });
      setSelectedSubmissionIds([]);
      setActionMessage("Seluruh data pengajuan berhasil dihapus.");
      loadAdminData();
    } catch (err) {
      setError(err.message || "Gagal menghapus seluruh data pengajuan.");
    } finally {
      setDeletingSubmissions(false);
    }
  };

  // Handler: Konfirmasi Keputusan Pengajuan
  const handleConfirmDecision = async () => {
    if (!decisionModal) return;
    try {
      await api.patch(`/admin/submissions/${decisionModal.id}/decision`, {
        keputusan: decisionModal.decision,
        catatan: decisionNote,
      });
      setDecisionModal(null);
      setDecisionNote("");
      setActionMessage(`Pengajuan berhasil ${decisionModal.decision === "disetujui" ? "disetujui" : "ditolak"}.`);
      loadAdminData();
    } catch (err) {
      setError(err.message || "Gagal memproses keputusan pengajuan.");
    }
  };

  // Handler: Unduh Laporan Excel
  const handleDownloadReport = async (e) => {
    e.preventDefault();
    try {
      setDownloadingReport(true);
      const response = await api.download(
        `/admin/reports/export?dari=${reportDates.dari}&sampai=${reportDates.sampai}`
      );
      if (!response.ok) throw new Error("Gagal mengunduh laporan presensi dari server.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `laporan-presensi-mimici-${reportDates.dari}-${reportDates.sampai}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setActionMessage("Laporan presensi Excel berhasil diunduh.");
    } catch (err) {
      setError(err.message || "Terjadi kesalahan saat mengunduh laporan.");
    } finally {
      setDownloadingReport(false);
    }
  };

  return (
    <div className="emp-portal-layout">
      {/* Top Navbar Header (Unified Triple Capsule matching Employee Portal) */}
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
            <span className="brand-sub">Admin</span>
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

        {/* Right: Admin Account Profile Capsule */}
        <div className="navbar-account-capsule">
          <div
            className="account-profile-section clickable"
            onClick={handleOpenAccountModal}
            title="Klik untuk mengubah akun administrator"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") handleOpenAccountModal();
            }}
          >
            <div className="account-avatar">
              {pengguna?.nama_pengguna ? pengguna.nama_pengguna.charAt(0).toUpperCase() : "A"}
            </div>
            <div className="account-details">
              <span className="account-name">{pengguna?.nama_pengguna || "Admin Mimici"}</span>
            </div>
          </div>

          <button
            type="button"
            className="account-settings-btn"
            onClick={handleOpenAccountModal}
            title="Pengaturan & Ubah Akun Admin"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z" />
            </svg>
            <span>Ubah Akun</span>
          </button>

          <div className="account-divider" />

          <button
            className="account-logout-btn"
            onClick={handleLogout}
            title="Keluar dari sesi administrator"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span>Keluar</span>
          </button>
        </div>
      </header>

      {/* Portal Body with Sidebar on the Left & Content on the Right */}
      <div className="emp-portal-body">
        {/* Left Sidebar: 7 Dedicated Admin Navigation Pages */}
        <aside className="emp-sidebar">
          <nav className="emp-sidebar-nav">
            <div className="emp-nav-header">Menu Admin</div>

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

            {/* 2. Data Karyawan */}
            <button
              type="button"
              className={`emp-nav-btn ${activeTab === "karyawan" ? "active" : ""}`}
              onClick={() => handleNavClick("karyawan")}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <span>Data Karyawan</span>
            </button>

            {/* 3. Data Cabang */}
            <button
              type="button"
              className={`emp-nav-btn ${activeTab === "cabang" ? "active" : ""}`}
              onClick={() => handleNavClick("cabang")}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
              <span>Data Cabang</span>
            </button>

            {/* 4. Jadwal & Shift */}
            <button
              type="button"
              className={`emp-nav-btn ${activeTab === "jadwal" ? "active" : ""}`}
              onClick={() => handleNavClick("jadwal")}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <span>Jadwal & Shift</span>
            </button>

            {/* 5. Monitoring Presensi */}
            <button
              type="button"
              className={`emp-nav-btn ${activeTab === "presensi" ? "active" : ""}`}
              onClick={() => handleNavClick("presensi")}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span>Monitoring Presensi</span>
            </button>

            {/* 6. Pengajuan Izin */}
            <button
              type="button"
              className={`emp-nav-btn ${activeTab === "pengajuan" ? "active" : ""}`}
              onClick={() => handleNavClick("pengajuan")}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
              <span>Pengajuan Izin</span>
              {pendingSubmissionsCount > 0 && (
                <span
                  style={{
                    marginLeft: "auto",
                    background: "#f59e0b",
                    color: "#ffffff",
                    fontSize: "11px",
                    fontWeight: 700,
                    padding: "2px 7px",
                    borderRadius: "9999px",
                  }}
                >
                  {pendingSubmissionsCount}
                </span>
              )}
            </button>

            {/* 7. Laporan & Rekap */}
            <button
              type="button"
              className={`emp-nav-btn ${activeTab === "laporan" ? "active" : ""}`}
              onClick={() => handleNavClick("laporan")}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
              <span>Laporan & Rekap</span>
            </button>
          </nav>

          {/* Sidebar Footer Widget */}
          <div className="emp-sidebar-footer">
            <div className="emp-branch-pill">
              <span className="emp-branch-label">Hak Akses Sistem</span>
              <span className="emp-branch-value">
                <span className="emp-status-dot" />
                Admin Multi-Cabang
              </span>
            </div>
          </div>
        </aside>

        {/* Right Main Content */}
        <main className="emp-main-content">
          {error && <div className="form-error" style={{ marginBottom: "20px" }}>{error}</div>}
          {actionMessage && <div className="form-success" style={{ marginBottom: "20px" }}>{actionMessage}</div>}

          {/* ================= PAGE 1: DASHBOARD ================= */}
          {activeTab === "dashboard" && (
            <div>
              <div className="emp-page-heading">
                <p className="emp-page-eyebrow">PORTAL ADMINISTRATOR MIMICI</p>
                <h1>Dashboard Administrator</h1>
                <p className="emp-page-subtitle">
                  Pantau ringkasan operasional kehadiran, manajemen cabang, dan aktivitas seluruh karyawan.
                </p>
              </div>

              {/* Welcome Banner */}
              <div className="emp-welcome-card">
                <div className="emp-welcome-info">
                  <h2>Halo, {pengguna?.nama_pengguna || "Administrator"}!</h2>
                  <p>
                    Anda memiliki hak akses penuh untuk mengelola master data karyawan, operasional cabang, dan memvalidasi presensi.
                  </p>
                  <div className="emp-meta-badges">
                    <span className="emp-badge-tag">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 6v6l4 2" />
                      </svg>
                      Role: Administrator Utama
                    </span>
                    <span className="emp-badge-tag">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                      </svg>
                      Multi-Cabang: {summary?.cabang?.aktif ?? branches.length} Cabang Aktif
                    </span>
                    <span className="emp-badge-tag">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                      </svg>
                      Karyawan: {summary?.karyawan?.aktif ?? employees.length} Terdaftar
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  className="emp-mulai-absensi-btn"
                  onClick={() => handleNavClick("presensi")}
                  title="Buka live monitoring presensi"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  <span>Monitoring Presensi →</span>
                </button>
              </div>

              {/* 4 Summary Stat Cards */}
              <div className="admin-grid-4">
                {/* 1. Karyawan */}
                <div className="emp-stat-card">
                  <div className="emp-stat-top">
                    <span className="emp-stat-title">Karyawan Aktif</span>
                    <div className="emp-stat-icon-wrap" style={{ background: "#eff6ff", color: "#2563eb" }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                      </svg>
                    </div>
                  </div>
                  <div>
                    <div className="emp-stat-val" style={{ color: "#2563eb" }}>
                      {loading ? "..." : summary?.karyawan?.aktif ?? employees.length}
                    </div>
                    <p className="emp-stat-desc" style={{ marginTop: "6px" }}>
                      Dari total {summary?.karyawan?.total ?? employees.length} karyawan terdaftar
                    </p>
                  </div>
                </div>

                {/* 2. Cabang */}
                <div className="emp-stat-card">
                  <div className="emp-stat-top">
                    <span className="emp-stat-title">Cabang Operasional</span>
                    <div className="emp-stat-icon-wrap" style={{ background: "#ecfdf5", color: "#059669" }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                        <polyline points="9 22 9 12 15 12 15 22" />
                      </svg>
                    </div>
                  </div>
                  <div>
                    <div className="emp-stat-val" style={{ color: "#059669" }}>
                      {loading ? "..." : summary?.cabang?.aktif ?? branches.length}
                    </div>
                    <p className="emp-stat-desc" style={{ marginTop: "6px" }}>
                      Validasi geofencing GPS aktif
                    </p>
                  </div>
                </div>

                {/* 3. Presensi Hari Ini */}
                <div className="emp-stat-card">
                  <div className="emp-stat-top">
                    <span className="emp-stat-title">Presensi Hari Ini</span>
                    <div className="emp-stat-icon-wrap" style={{ background: "#fffbeb", color: "#d97706" }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                    </div>
                  </div>
                  <div>
                    <div className="emp-stat-val" style={{ color: "#0f172a" }}>
                      {loading ? "..." : summary?.presensi_hari_ini?.total ?? 0}
                    </div>
                    <p className="emp-stat-desc" style={{ marginTop: "6px" }}>
                      <strong style={{ color: "#d97706" }}>
                        {summary?.presensi_hari_ini?.terlambat ?? 0}
                      </strong>{" "}
                      karyawan terlambat
                    </p>
                  </div>
                </div>

                {/* 4. Pengajuan Menunggu */}
                <div className="emp-stat-card">
                  <div className="emp-stat-top">
                    <span className="emp-stat-title">Pengajuan Izin</span>
                    <div className="emp-stat-icon-wrap" style={{ background: "#fff1f2", color: "#e11d48" }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 11l3 3L22 4" />
                        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                      </svg>
                    </div>
                  </div>
                  <div>
                    <div
                      className="emp-stat-val"
                      style={{
                        color: (summary?.pengajuan?.menunggu ?? 0) > 0 ? "#e11d48" : "#0f172a",
                      }}
                    >
                      {loading ? "..." : summary?.pengajuan?.menunggu ?? 0}
                    </div>
                    <p className="emp-stat-desc" style={{ marginTop: "6px" }}>
                      Menunggu verifikasi admin
                    </p>
                  </div>
                </div>
              </div>

              {/* Module Cards Grid (Consistent with Employee Portal layout) */}
              <div style={{ marginTop: "32px" }}>
                <div style={{ marginBottom: "16px" }}>
                  <h2 style={{ margin: "0 0 4px", fontSize: "19px", fontWeight: 700, color: "#0f172a" }}>
                    Pusat Pengelolaan Sistem
                  </h2>
                  <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>
                    Pilih modul di bawah ini atau gunakan menu navigasi sebelah kiri untuk mengakses modul pengelolaan.
                  </p>
                </div>

                <div className="modules-grid">
                  {/* Modul 1: Data Karyawan */}
                  <article className="module-card">
                    <div className="module-card-top">
                      <div className="module-icon icon-blue">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                          <circle cx="9" cy="7" r="4" />
                        </svg>
                      </div>
                    </div>
                    <h3>Data Karyawan</h3>
                    <p>Kelola data induk, NIP, akun pengguna, dan penempatan cabang karyawan.</p>
                    <button className="module-action-btn" onClick={() => handleNavClick("karyawan")}>
                      <span>Buka Modul</span>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="5" y1="12" x2="19" y2="12" />
                        <polyline points="12 5 19 12 12 19" />
                      </svg>
                    </button>
                  </article>

                  {/* Modul 2: Data Cabang */}
                  <article className="module-card">
                    <div className="module-card-top">
                      <div className="module-icon icon-emerald">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                          <polyline points="9 22 9 12 15 12 15 22" />
                        </svg>
                      </div>
                    </div>
                    <h3>Data Cabang</h3>
                    <p>Atur informasi geofencing, radius GPS, dan status cabang operasional Mimici.</p>
                    <button className="module-action-btn" onClick={() => handleNavClick("cabang")}>
                      <span>Buka Modul</span>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="5" y1="12" x2="19" y2="12" />
                        <polyline points="12 5 19 12 12 19" />
                      </svg>
                    </button>
                  </article>

                  {/* Modul 3: Jadwal & Shift */}
                  <article className="module-card">
                    <div className="module-card-top">
                      <div className="module-icon icon-indigo">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                          <line x1="16" y1="2" x2="16" y2="6" />
                          <line x1="8" y1="2" x2="8" y2="6" />
                          <line x1="3" y1="10" x2="21" y2="10" />
                        </svg>
                      </div>
                    </div>
                    <h3>Jadwal & Shift Kerja</h3>
                    <p>Atur rotasi kerja, shift harian, dan batas toleransi keterlambatan presensi.</p>
                    <button className="module-action-btn" onClick={() => handleNavClick("jadwal")}>
                      <span>Buka Modul</span>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="5" y1="12" x2="19" y2="12" />
                        <polyline points="12 5 19 12 12 19" />
                      </svg>
                    </button>
                  </article>

                  {/* Modul 4: Monitoring Presensi */}
                  <article className="module-card">
                    <div className="module-card-top">
                      <div className="module-icon icon-amber">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="12 6 12 12 16 14" />
                        </svg>
                      </div>
                    </div>
                    <h3>Monitoring Presensi</h3>
                    <p>Pantau log absensi harian seluruh cabang, foto presensi, dan keterlambatan real-time.</p>
                    <button className="module-action-btn" onClick={() => handleNavClick("presensi")}>
                      <span>Buka Modul</span>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="5" y1="12" x2="19" y2="12" />
                        <polyline points="12 5 19 12 12 19" />
                      </svg>
                    </button>
                  </article>

                  {/* Modul 5: Pengajuan Izin */}
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
                    <p>Tinjau, setujui, atau tolak permohonan izin karyawan berserta bukti surat.</p>
                    <button className="module-action-btn" onClick={() => handleNavClick("pengajuan")}>
                      <span>Buka Modul</span>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="5" y1="12" x2="19" y2="12" />
                        <polyline points="12 5 19 12 12 19" />
                      </svg>
                    </button>
                  </article>

                  {/* Modul 6: Laporan Rekap */}
                  <article className="module-card">
                    <div className="module-card-top">
                      <div className="module-icon icon-teal">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="18" y1="20" x2="18" y2="10" />
                          <line x1="12" y1="20" x2="12" y2="4" />
                          <line x1="6" y1="20" x2="6" y2="14" />
                        </svg>
                      </div>
                    </div>
                    <h3>Laporan & Rekap</h3>
                    <p>Unduh rekap kehadiran bulanan, keterlambatan, dan data potongan gaji dalam format Excel.</p>
                    <button className="module-action-btn" onClick={() => handleNavClick("laporan")}>
                      <span>Buka Modul</span>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="5" y1="12" x2="19" y2="12" />
                        <polyline points="12 5 19 12 12 19" />
                      </svg>
                    </button>
                  </article>
                </div>
              </div>

              {/* Recent Activity Section */}
              <div style={{ marginTop: "36px" }}>
                <div className="admin-card-section">
                  <div className="admin-card-header">
                    <div>
                      <h3>Catatan Presensi Terbaru</h3>
                      <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#64748b" }}>
                        Menampilkan rekaman presensi terbaru dari seluruh cabang Mimici.
                      </p>
                    </div>
                    <button
                      className="admin-btn admin-btn-secondary admin-btn-sm"
                      onClick={() => handleNavClick("presensi")}
                    >
                      <span>Lihat Semua Presensi</span>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="5" y1="12" x2="19" y2="12" />
                        <polyline points="12 5 19 12 12 19" />
                      </svg>
                    </button>
                  </div>

                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Tanggal</th>
                          <th>Karyawan</th>
                          <th>Cabang</th>
                          <th>Jam Masuk</th>
                          <th>Jam Pulang</th>
                          <th>Status</th>
                          <th>Potongan</th>
                        </tr>
                      </thead>
                      <tbody>
                        {attendance.slice(0, 5).map((row) => (
                          <tr key={row.id_absensi}>
                            <td><strong>{formatDate(row.tanggal)}</strong></td>
                            <td>
                              <div><strong>{row.nama_lengkap}</strong></div>
                              <small style={{ color: "#64748b" }}>{row.nip}</small>
                            </td>
                            <td>{row.nama_cabang}</td>
                            <td>{formatDateTime(row.waktu_masuk)}</td>
                            <td>{formatDateTime(row.waktu_pulang)}</td>
                            <td>
                              <span
                                className={`badge-status ${
                                  row.status_kehadiran === "Hadir"
                                    ? "badge-hadir"
                                    : row.status_kehadiran === "Terlambat"
                                    ? "badge-terlambat"
                                    : row.status_kehadiran === "Izin"
                                    ? "badge-izin"
                                    : row.status_kehadiran === "Sakit"
                                    ? "badge-sakit"
                                    : "badge-alfa"
                                }`}
                              >
                                {row.status_kehadiran}
                              </span>
                            </td>
                            <td style={{ fontWeight: 600, color: row.potongan > 0 ? "#b91c1c" : "#0f172a" }}>
                              {money(row.potongan)}
                            </td>
                          </tr>
                        ))}
                        {attendance.length === 0 && (
                          <tr>
                            <td colSpan={7} className="empty-cell">Belum ada catatan presensi.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================= PAGE 2: DATA KARYAWAN ================= */}
          {activeTab === "karyawan" && (
            <div>
              <div className="emp-page-heading">
                <p className="emp-page-eyebrow">MANAJEMEN PENGGUNA & PENEMPATAN</p>
                <h1>Data Karyawan</h1>
                <p className="emp-page-subtitle">
                  Kelola data induk karyawan, NIP, akun pengguna, dan penempatan cabang operasional.
                </p>
              </div>

              {/* Action & Filter Toolbar */}
              <div className="admin-filter-bar">
                <div className="admin-filter-group">
                  <div className="admin-search-wrap">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                      type="text"
                      className="admin-search-input"
                      placeholder="Cari nama, NIP, email, cabang..."
                      value={employeeSearch}
                      onChange={(e) => setEmployeeSearch(e.target.value)}
                    />
                  </div>

                  <select
                    className="admin-select"
                    value={employeeStatusFilter}
                    onChange={(e) => setEmployeeStatusFilter(e.target.value)}
                  >
                    <option value="semua">Semua Status</option>
                    <option value="aktif">Aktif</option>
                    <option value="nonaktif">Nonaktif</option>
                  </select>
                </div>

                <button
                  type="button"
                  className="admin-btn admin-btn-primary"
                  onClick={() => setIsAddEmployeeModalOpen(true)}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  <span>Tambah Karyawan</span>
                </button>
              </div>

              {/* Table Card */}
              <div className="admin-card-section">
                <div className="admin-card-header">
                  <div>
                    <h3>
                      Daftar Karyawan
                      <span className="admin-badge-count">{filteredEmployees.length}</span>
                    </h3>
                  </div>
                </div>

                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>NIP</th>
                        <th>Nama Lengkap</th>
                        <th>Akun & Email</th>
                        <th>Penempatan Cabang</th>
                        <th>Hari Libur Mingguan</th>
                        <th>Status Akun</th>
                        <th style={{ textAlign: "center" }}>Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEmployees.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="empty-cell">
                            Tidak ada data karyawan yang cocok dengan filter.
                          </td>
                        </tr>
                      ) : (
                        filteredEmployees.map((emp) => {
                          const activeBranch =
                            emp.penempatan && emp.penempatan.length > 0
                              ? emp.penempatan[0].nama_cabang
                              : null;
                          return (
                            <tr key={emp.id_karyawan}>
                              <td><strong>{emp.nip}</strong></td>
                              <td>
                                <div><strong>{emp.nama_lengkap}</strong></div>
                                <small style={{ color: "#64748b" }}>{emp.nomor_telepon || "-"}</small>
                              </td>
                              <td>
                                <div>{emp.email}</div>
                                <small style={{ color: "#64748b" }}>@{emp.nama_pengguna}</small>
                              </td>
                              <td>
                                {activeBranch ? (
                                  <span
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: "6px",
                                      padding: "3px 10px",
                                      borderRadius: "8px",
                                      background: "#f1f5f9",
                                      fontSize: "12px",
                                      fontWeight: 600,
                                      color: "#1e293b",
                                    }}
                                  >
                                    <span className="emp-status-dot" />
                                    Mimici {activeBranch}
                                  </span>
                                ) : (
                                  <span style={{ color: "#94a3b8", fontSize: "12.5px" }}>Belum ditempatkan</span>
                                )}
                              </td>
                              <td>
                                {Array.isArray(emp.hari_libur) && emp.hari_libur.length > 0 ? (
                                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                                    {emp.hari_libur.map((d) => (
                                      <span
                                        key={d}
                                        style={{
                                          display: "inline-block",
                                          padding: "2px 8px",
                                          borderRadius: "6px",
                                          fontSize: "11.5px",
                                          fontWeight: 600,
                                          background: "#eff6ff",
                                          color: "#1d4ed8",
                                          border: "1px solid #bfdbfe",
                                        }}
                                      >
                                        {d}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span style={{ color: "#94a3b8", fontSize: "12px" }}>-</span>
                                )}
                              </td>
                              <td>
                                <span
                                  className={`badge-status ${
                                    emp.status_karyawan === "aktif" ? "badge-hadir" : "badge-alfa"
                                  }`}
                                >
                                  {emp.status_karyawan === "aktif" ? "Aktif" : "Nonaktif"}
                                </span>
                              </td>
                              <td style={{ textAlign: "center" }}>
                                <button
                                  type="button"
                                  className="admin-btn admin-btn-primary admin-btn-sm"
                                  onClick={() => handleOpenKelola(emp)}
                                  title="Kelola cabang, hari libur, status akun, dan hapus karyawan"
                                  style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                                >
                                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2">
                                    <circle cx="12" cy="12" r="3" />
                                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                                  </svg>
                                  Kelola
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ================= PAGE 3: DATA CABANG ================= */}
          {activeTab === "cabang" && (
            <div>
              <div className="emp-page-heading">
                <p className="emp-page-eyebrow">MASTER DATA OUTLET</p>
                <h1>Data Cabang Operasional</h1>
                <p className="emp-page-subtitle">
                  Kelola lokasi fisik gerai Mimici, koordinat lintang & bujur GPS, serta radius geofencing presensi.
                </p>
              </div>

              {/* Action Toolbar */}
              <div className="admin-filter-bar">
                <div className="admin-filter-group">
                  <div className="admin-search-wrap">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                      type="text"
                      className="admin-search-input"
                      placeholder="Cari kode, nama, atau alamat cabang..."
                      value={branchSearch}
                      onChange={(e) => setBranchSearch(e.target.value)}
                    />
                  </div>
                </div>

                <button
                  type="button"
                  className="admin-btn admin-btn-primary"
                  onClick={() => setIsAddBranchModalOpen(true)}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  <span>Tambah Cabang</span>
                </button>
              </div>

              {/* Table Card */}
              <div className="admin-card-section">
                <div className="admin-card-header">
                  <div>
                    <h3>
                      Daftar Cabang Mimici
                      <span className="admin-badge-count">{filteredBranches.length}</span>
                    </h3>
                  </div>
                </div>

                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Kode</th>
                        <th>Nama Cabang</th>
                        <th>Alamat</th>
                        <th>Koordinat GPS</th>
                        <th>Radius Geofence</th>
                        <th>Status</th>
                        <th>Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBranches.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="empty-cell">Belum ada data cabang.</td>
                        </tr>
                      ) : (
                        filteredBranches.map((br) => (
                          <tr key={br.id_cabang}>
                            <td><strong>{br.kode_cabang}</strong></td>
                            <td><strong>Mimici {br.nama_cabang}</strong></td>
                            <td>{br.alamat || "-"}</td>
                            <td>
                              <span style={{ fontSize: "12px", fontFamily: "monospace", color: "#475569" }}>
                                {br.latitude}, {br.longitude}
                              </span>
                            </td>
                            <td>
                              <span style={{ fontWeight: 600, color: "#0f172a" }}>
                                {br.radius_meter} meter
                              </span>
                            </td>
                            <td>
                              <span
                                className={`badge-status ${
                                  br.status_cabang === "aktif" ? "badge-hadir" : "badge-alfa"
                                }`}
                              >
                                {br.status_cabang === "aktif" ? "Aktif" : "Nonaktif"}
                              </span>
                            </td>
                            <td>
                              <button
                                type="button"
                                className="admin-btn admin-btn-sm admin-btn-outline"
                                onClick={() => setSelectedBranchForKelola(br)}
                              >
                                Kelola
                              </button>
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

          {/* ================= PAGE 4: JADWAL & SHIFT ================= */}
          {activeTab === "jadwal" && (
            <div>
              <div className="emp-page-heading">
                <p className="emp-page-eyebrow">PENGATURAN OPERASIONAL KERJA</p>
                <h1>Jadwal & Shift Kerja</h1>
                <p className="emp-page-subtitle">
                  Atur jam kerja reguler, rotasi shift cabang, serta toleransi keterlambatan presensi.
                </p>
              </div>

              {/* Action Toolbar */}
              <div className="admin-filter-bar">
                <div style={{ flex: 1 }} />
                <button
                  type="button"
                  className="admin-btn admin-btn-primary"
                  onClick={() => setIsAddScheduleModalOpen(true)}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  <span>Tambah Jadwal Shift</span>
                </button>
              </div>

              {/* Table Card */}
              <div className="admin-card-section">
                <div className="admin-card-header">
                  <div>
                    <h3>
                      Daftar Jadwal Shift Cabang
                      <span className="admin-badge-count">{schedules.length}</span>
                    </h3>
                  </div>
                </div>

                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Cabang</th>
                        <th>Hari</th>
                        <th>Nama Jadwal</th>
                        <th>Jam Masuk</th>
                        <th>Jam Pulang</th>
                        <th>Toleransi Keterlambatan</th>
                        <th style={{ textAlign: "center" }}>Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {schedules.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="empty-cell">Belum ada jadwal shift yang terdaftar.</td>
                        </tr>
                      ) : (
                        schedules.map((sch) => (
                          <tr key={sch.id_jadwal_umum}>
                            <td><strong>Mimici {sch.nama_cabang}</strong></td>
                            <td>{DAYS_ID[sch.hari] || "Setiap Hari"}</td>
                            <td>{sch.nama_jadwal}</td>
                            <td><strong>{String(sch.jam_mulai).slice(0, 5)} WIB</strong></td>
                            <td>{sch.jam_selesai ? `${String(sch.jam_selesai).slice(0, 5)} WIB` : "-"}</td>
                            <td>
                              <span style={{ fontWeight: 600, color: "#d97706" }}>
                                {sch.toleransi_menit} menit
                              </span>
                            </td>
                            <td style={{ textAlign: "center" }}>
                              <button
                                type="button"
                                className="admin-btn admin-btn-sm admin-btn-outline"
                                onClick={() => {
                                  setSelectedScheduleForKelola(sch);
                                  setEditScheduleForm({
                                    id_cabang: sch.id_cabang || "",
                                    nama_jadwal: sch.nama_jadwal || "",
                                    jam_mulai: String(sch.jam_mulai).slice(0, 5),
                                    jam_selesai: sch.jam_selesai ? String(sch.jam_selesai).slice(0, 5) : "",
                                    toleransi_menit: sch.toleransi_menit ?? 10,
                                  });
                                }}
                              >
                                Kelola
                              </button>
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

          {/* ================= PAGE 5: MONITORING PRESENSI ================= */}
          {activeTab === "presensi" && (
            <div>
              <div className="emp-page-heading">
                <p className="emp-page-eyebrow">LOG KEHADIRAN SELURUH CABANG</p>
                <h1>Monitoring Presensi</h1>
                <p className="emp-page-subtitle">
                  Pantau catatan waktu masuk, waktu pulang, keterlambatan, dan potongan denda secara real-time.
                </p>
              </div>

              {/* Filter Toolbar */}
              <div className="admin-filter-bar">
                <div className="admin-filter-group">
                  <div className="admin-search-wrap">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                      type="text"
                      className="admin-search-input"
                      placeholder="Cari karyawan atau NIP..."
                      value={attendanceSearch}
                      onChange={(e) => setAttendanceSearch(e.target.value)}
                    />
                  </div>

                  <select
                    className="admin-select"
                    value={attendanceBranchFilter}
                    onChange={(e) => setAttendanceBranchFilter(e.target.value)}
                  >
                    <option value="">Semua Cabang</option>
                    {branches.map((b) => (
                      <option key={b.id_cabang} value={b.nama_cabang}>
                        Mimici {b.nama_cabang}
                      </option>
                    ))}
                  </select>

                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ fontSize: "12px", color: "#64748b" }}>Dari:</span>
                    <input
                      type="date"
                      className="admin-input"
                      style={{ padding: "8px 10px", width: "135px" }}
                      value={attendanceDateDari}
                      onChange={(e) => setAttendanceDateDari(e.target.value)}
                    />
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ fontSize: "12px", color: "#64748b" }}>Sampai:</span>
                    <input
                      type="date"
                      className="admin-input"
                      style={{ padding: "8px 10px", width: "135px" }}
                      value={attendanceDateSampai}
                      onChange={(e) => setAttendanceDateSampai(e.target.value)}
                    />
                  </div>

                  {(attendanceSearch || attendanceBranchFilter || attendanceDateDari || attendanceDateSampai) && (
                    <button
                      type="button"
                      className="admin-btn admin-btn-secondary admin-btn-sm"
                      onClick={() => {
                        setAttendanceSearch("");
                        setAttendanceBranchFilter("");
                        setAttendanceDateDari("");
                        setAttendanceDateSampai("");
                      }}
                    >
                      Reset Filter
                    </button>
                  )}
                </div>
              </div>

              {/* Table Card */}
              <div className="admin-card-section">
                <div className="admin-card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                  <div>
                    <h3>
                      Rekaman Presensi
                      <span className="admin-badge-count">{filteredAttendance.length}</span>
                    </h3>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    {selectedAttendanceIds.length > 0 && (
                      <button
                        type="button"
                        className="admin-btn admin-btn-danger admin-btn-sm"
                        disabled={deletingAttendance}
                        onClick={handleBulkDeleteAttendance}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 14, height: 14 }}>
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                        <span>Hapus Terpilih ({selectedAttendanceIds.length})</span>
                      </button>
                    )}
                    {attendance.length > 0 && (
                      <button
                        type="button"
                        className="admin-btn admin-btn-secondary admin-btn-sm"
                        style={{ color: "#dc2626", borderColor: "#fca5a5" }}
                        disabled={deletingAttendance}
                        onClick={handleDeleteAllAttendance}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 14, height: 14 }}>
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                        <span>Delete All Presensi</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: "40px", textAlign: "center" }}>
                          <input
                            type="checkbox"
                            className="admin-table-checkbox"
                            title="Pilih Semua Presensi"
                            checked={
                              filteredAttendance.length > 0 &&
                              filteredAttendance.every((a) => selectedAttendanceIds.includes(a.id_absensi))
                            }
                            onChange={handleToggleSelectAllAttendance}
                          />
                        </th>
                        <th>Tanggal</th>
                        <th>Karyawan</th>
                        <th>Cabang</th>
                        <th>Jam Masuk</th>
                        <th>Jam Pulang</th>
                        <th>Status</th>
                        <th>Terlambat</th>
                        <th>Potongan</th>
                        <th style={{ textAlign: "center" }}>Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAttendance.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="empty-cell">
                            Tidak ada rekaman presensi yang sesuai dengan filter.
                          </td>
                        </tr>
                      ) : (
                        filteredAttendance.map((row) => (
                          <tr key={row.id_absensi} className={selectedAttendanceIds.includes(row.id_absensi) ? "row-selected" : ""}>
                            <td style={{ textAlign: "center" }}>
                              <input
                                type="checkbox"
                                className="admin-table-checkbox"
                                checked={selectedAttendanceIds.includes(row.id_absensi)}
                                onChange={() => handleToggleSelectAttendance(row.id_absensi)}
                              />
                            </td>
                            <td><strong>{formatDate(row.tanggal)}</strong></td>
                            <td>
                              <div><strong>{row.nama_lengkap}</strong></div>
                              <small style={{ color: "#64748b" }}>{row.nip}</small>
                            </td>
                            <td>Mimici {row.nama_cabang}</td>
                            <td>{formatDateTime(row.waktu_masuk)}</td>
                            <td>{formatDateTime(row.waktu_pulang)}</td>
                            <td>
                              <span
                                className={`badge-status ${
                                  row.status_kehadiran === "Hadir"
                                    ? "badge-hadir"
                                    : row.status_kehadiran === "Terlambat"
                                    ? "badge-terlambat"
                                    : row.status_kehadiran === "Izin"
                                    ? "badge-izin"
                                    : row.status_kehadiran === "Sakit"
                                    ? "badge-sakit"
                                    : "badge-alfa"
                                }`}
                              >
                                {row.status_kehadiran}
                              </span>
                            </td>
                            <td>
                              {row.menit_terlambat ? (
                                <span style={{ color: "#d97706", fontWeight: 600 }}>
                                  {row.menit_terlambat} menit
                                </span>
                              ) : (
                                "-"
                              )}
                            </td>
                            <td style={{ fontWeight: 600, color: row.potongan > 0 ? "#b91c1c" : "#0f172a" }}>
                              {money(row.potongan)}
                            </td>
                            <td style={{ textAlign: "center" }}>
                              <button
                                type="button"
                                className="admin-btn-action-icon text-danger"
                                title="Hapus rekaman presensi ini"
                                onClick={() => handleDeleteSingleAttendance(row.id_absensi)}
                              >
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <polyline points="3 6 5 6 21 6" />
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                </svg>
                              </button>
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

          {/* ================= PAGE 6: PENGAJUAN IZIN ================= */}
          {activeTab === "pengajuan" && (
            <div>
              <div className="emp-page-heading">
                <p className="emp-page-eyebrow">VERIFIKASI & PERSETUJUAN</p>
                <h1>Pengajuan Izin & Sakit</h1>
                <p className="emp-page-subtitle">
                  Tinjau permohonan ketidakhadiran karyawan dan berikan keputusan persetujuan atau penolakan.
                </p>
              </div>

              {/* Status Tabs Toolbar */}
              <div className="admin-filter-bar">
                <div className="admin-tab-group">
                  <button
                    type="button"
                    className={`admin-tab-btn ${submissionFilter === "semua" ? "active" : ""}`}
                    onClick={() => setSubmissionFilter("semua")}
                  >
                    Semua ({submissions.length})
                  </button>
                  <button
                    type="button"
                    className={`admin-tab-btn ${submissionFilter === "menunggu" ? "active" : ""}`}
                    onClick={() => setSubmissionFilter("menunggu")}
                  >
                    Menunggu ({pendingSubmissionsCount})
                  </button>
                  <button
                    type="button"
                    className={`admin-tab-btn ${submissionFilter === "disetujui" ? "active" : ""}`}
                    onClick={() => setSubmissionFilter("disetujui")}
                  >
                    Disetujui
                  </button>
                  <button
                    type="button"
                    className={`admin-tab-btn ${submissionFilter === "ditolak" ? "active" : ""}`}
                    onClick={() => setSubmissionFilter("ditolak")}
                  >
                    Ditolak
                  </button>
                </div>
              </div>

              {/* Table Card */}
              <div className="admin-card-section">
                <div className="admin-card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                  <div>
                    <h3>
                      Daftar Pengajuan Karyawan
                      <span className="admin-badge-count">{filteredSubmissions.length}</span>
                    </h3>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    {selectedSubmissionIds.length > 0 && (
                      <button
                        type="button"
                        className="admin-btn admin-btn-danger admin-btn-sm"
                        disabled={deletingSubmissions}
                        onClick={handleBulkDeleteSubmissions}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 14, height: 14 }}>
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                        <span>Hapus Terpilih ({selectedSubmissionIds.length})</span>
                      </button>
                    )}
                    {submissions.length > 0 && (
                      <button
                        type="button"
                        className="admin-btn admin-btn-secondary admin-btn-sm"
                        style={{ color: "#dc2626", borderColor: "#fca5a5" }}
                        disabled={deletingSubmissions}
                        onClick={handleDeleteAllSubmissions}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 14, height: 14 }}>
                          <path d="M3 6h18" />
                          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                        </svg>
                        <span>Delete All Izin/Sakit</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: "40px", textAlign: "center" }}>
                          <input
                            type="checkbox"
                            className="admin-table-checkbox"
                            title="Pilih Semua Pengajuan"
                            checked={
                              filteredSubmissions.length > 0 &&
                              filteredSubmissions.every((s) => selectedSubmissionIds.includes(s.id_pengajuan))
                            }
                            onChange={handleToggleSelectAllSubmissions}
                          />
                        </th>
                        <th>Karyawan</th>
                        <th>Jenis</th>
                        <th>Periode Tanggal</th>
                        <th>Alasan</th>
                        <th>Detail & Bukti</th>
                        <th>Status</th>
                        <th>Catatan Admin</th>
                        <th style={{ textAlign: "center" }}>Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSubmissions.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="empty-cell">
                            Tidak ada data pengajuan pada kategori ini.
                          </td>
                        </tr>
                      ) : (
                        filteredSubmissions.map((sub) => {
                          const isPending = (sub.status || "").toLowerCase() === "menunggu";
                          return (
                            <tr key={sub.id_pengajuan} className={selectedSubmissionIds.includes(sub.id_pengajuan) ? "row-selected" : ""}>
                              <td style={{ textAlign: "center" }}>
                                <input
                                  type="checkbox"
                                  className="admin-table-checkbox"
                                  checked={selectedSubmissionIds.includes(sub.id_pengajuan)}
                                  onChange={() => handleToggleSelectSubmission(sub.id_pengajuan)}
                                />
                              </td>
                              <td>
                                <div><strong>{sub.nama_lengkap}</strong></div>
                                <small style={{ color: "#64748b" }}>{sub.nip}</small>
                              </td>
                              <td>
                                <span className={`badge-status ${sub.jenis === "izin" ? "badge-izin" : "badge-sakit"}`}>
                                  {sub.jenis ? sub.jenis.toUpperCase() : "IZIN"}
                                </span>
                              </td>
                              <td>
                                <strong>{formatDate(sub.tanggal_mulai)}</strong>
                                {sub.tanggal_selesai && sub.tanggal_selesai !== sub.tanggal_mulai && (
                                  <> s/d {formatDate(sub.tanggal_selesai)}</>
                                )}
                              </td>
                              <td>
                                <div
                                  style={{
                                    maxWidth: "180px",
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    color: "#475569",
                                    fontSize: "13.5px",
                                  }}
                                  title={sub.alasan}
                                >
                                  {sub.alasan || "-"}
                                </div>
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className="admin-eye-btn"
                                  title="Lihat Detail, Alasan Lengkap & Bukti Foto"
                                  onClick={() => setDetailModal(sub)}
                                >
                                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                    <circle cx="12" cy="12" r="3" />
                                  </svg>
                                  <span>Lihat</span>
                                </button>
                              </td>
                              <td>
                                <span
                                  className={`badge-status ${
                                    sub.status === "disetujui"
                                      ? "badge-disetujui"
                                      : sub.status === "ditolak"
                                      ? "badge-ditolak"
                                      : "badge-menunggu"
                                  }`}
                                >
                                  {sub.status ? sub.status.toUpperCase() : "MENUNGGU"}
                                </span>
                              </td>
                              <td>{sub.catatan_admin || "-"}</td>
                              <td style={{ textAlign: "center" }}>
                                <div style={{ display: "flex", gap: "6px", justifyContent: "center", alignItems: "center" }}>
                                  {isPending ? (
                                    <>
                                      <button
                                        type="button"
                                        className="admin-btn admin-btn-success admin-btn-sm"
                                        onClick={() => {
                                          setDecisionModal({
                                            id: sub.id_pengajuan,
                                            decision: "disetujui",
                                            name: sub.nama_lengkap,
                                          });
                                          setDecisionNote("");
                                        }}
                                      >
                                        Setujui
                                      </button>
                                      <button
                                        type="button"
                                        className="admin-btn admin-btn-danger admin-btn-sm"
                                        onClick={() => {
                                          setDecisionModal({
                                            id: sub.id_pengajuan,
                                            decision: "ditolak",
                                            name: sub.nama_lengkap,
                                          });
                                          setDecisionNote("");
                                        }}
                                      >
                                        Tolak
                                      </button>
                                    </>
                                  ) : (
                                    <span style={{ color: "#94a3b8", fontSize: "12px" }}>Selesai</span>
                                  )}
                                  <button
                                    type="button"
                                    className="admin-btn-action-icon text-danger"
                                    title="Hapus pengajuan ini"
                                    onClick={() => handleDeleteSingleSubmission(sub.id_pengajuan)}
                                  >
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <polyline points="3 6 5 6 21 6" />
                                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                    </svg>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ================= PAGE 7: LAPORAN & REKAP ================= */}
          {activeTab === "laporan" && (
            <div className="laporan-rekap-wrapper">
              <div className="emp-page-heading" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px", marginBottom: "20px" }}>
                <div>
                  <p className="emp-page-eyebrow">PUSAT REKAPITULASI DATA</p>
                  <h1>Rekap Presensi Bulanan</h1>
                  <p className="emp-page-subtitle">
                    Monitoring terpadu kehadiran karyawan seluruh cabang & ekspor laporan Microsoft Excel (.xlsx).
                  </p>
                </div>

                <form onSubmit={handleDownloadReport} className="laporan-top-controls">
                  <div className="laporan-date-box">
                    <span className="laporan-date-title">Rentang:</span>
                    <input
                      type="date"
                      className="laporan-date-inp"
                      value={reportDates.dari}
                      onChange={(e) => setReportDates({ ...reportDates, dari: e.target.value })}
                      required
                    />
                    <span className="laporan-date-dash">s/d</span>
                    <input
                      type="date"
                      className="laporan-date-inp"
                      value={reportDates.sampai}
                      onChange={(e) => setReportDates({ ...reportDates, sampai: e.target.value })}
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    className="emp-mulai-absensi-btn"
                    disabled={downloadingReport}
                    style={{ padding: "9px 18px", fontSize: "13.5px" }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: 16, height: 16 }}>
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    <span>{downloadingReport ? "Membuat Excel..." : "Unduh File Excel (.xlsx)"}</span>
                  </button>
                </form>
              </div>

              {/* EXECUTIVE BOARD (SESUAI GAMBAR REFERENSI USER) */}
              <div className="mimici-rekap-board">
                {/* 1. TOP PURPLE BANNER */}
                <div className="mimici-board-banner">
                  <div className="mimici-banner-brand">
                    <div className="mimici-brand-badge">M</div>
                    <div className="mimici-brand-meta">
                      <span className="mimici-brand-heading">MIMICI</span>
                      <span className="mimici-brand-subheading">Presensi Karyawan</span>
                    </div>
                  </div>

                  <div className="mimici-banner-center">
                    <div className="mimici-banner-title">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                      <span>Rekap Presensi Bulanan</span>
                    </div>
                    <div className="mimici-banner-period">
                      Periode: {formatDisplayPeriod(reportDates.dari, reportDates.sampai)}
                    </div>
                  </div>

                  <div className="mimici-banner-actions">
                    <select
                      className="mimici-select-pill"
                      value={reportMonthFilter}
                      onChange={handleMonthChange}
                    >
                      <option value="semua">Semua Bulan ▾</option>
                      {monthsList.map((m, idx) => (
                        <option key={idx} value={idx}>{m}</option>
                      ))}
                    </select>

                    <select
                      className="mimici-select-pill"
                      value={reportBranchFilter}
                      onChange={(e) => setReportBranchFilter(e.target.value)}
                    >
                      <option value="semua">Semua Cabang ▾</option>
                      {branches.map((b) => (
                        <option key={b.id_cabang} value={b.nama_cabang}>{b.nama_cabang}</option>
                      ))}
                    </select>

                    <button
                      type="button"
                      className="mimici-export-pill-btn"
                      onClick={handleDownloadReport}
                      disabled={downloadingReport}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: 14, height: 14 }}>
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      <span>Export Excel</span>
                    </button>
                  </div>
                </div>

                {/* 2. MIDDLE 6 BRANCH CARDS (SEBARIS PENUH: Pakuan, Botani, Azimar, Warung Nangka, ATS, Ciapus) */}
                <div className="mimici-branches-track">
                  {displayBranchCards.map((bCard) => (
                    <div key={bCard.nama_cabang} className="mimici-branch-card mimici-branch-card-horizontal">
                      <div className="mimici-card-header">
                        <div className="mimici-card-title">
                          <span className="mimici-pin-icon">📍</span>
                          <span className="mimici-branch-name">{bCard.nama_cabang}</span>
                        </div>
                        <div className="mimici-card-count">
                          Total Karyawan: <strong>{bCard.totalKaryawan}</strong>
                        </div>
                      </div>

                      <div className="mimici-card-table-wrapper">
                        <table className="mimici-card-table">
                          <thead>
                            <tr>
                              <th>Tanggal</th>
                              <th>Nama Karyawan</th>
                              <th>Jam Masuk</th>
                              <th>Jam Pulang</th>
                              <th>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {bCard.records.length > 0 ? (
                              bCard.records.slice(0, 15).map((row, idx) => (
                                <tr key={idx}>
                                  <td>{formatDateStrID(row.tanggal)}</td>
                                  <td className="mimici-emp-name" title={row.nama_lengkap}>{row.nama_lengkap}</td>
                                  <td>{formatTimeOnlyStr(row.waktu_masuk)}</td>
                                  <td>{formatTimeOnlyStr(row.waktu_pulang)}</td>
                                  <td>
                                    <span className={`mimici-badge badge-${(row.status_kehadiran || "hadir").toLowerCase()}`}>
                                      {row.status_kehadiran || "Hadir"}
                                    </span>
                                  </td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan="5" className="mimici-empty-row">Belum ada catatan presensi</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>

                {/* 3. BOTTOM 3 SUMMARY PANELS */}
                <div className="mimici-bottom-grid">
                  {/* Panel 1: Ringkasan Rekap Bulanan (Per Karyawan) */}
                  <div className="mimici-panel mimici-panel-summary">
                    <div className="mimici-panel-header">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="18" y1="20" x2="18" y2="10" />
                        <line x1="12" y1="20" x2="12" y2="4" />
                        <line x1="6" y1="20" x2="6" y2="14" />
                      </svg>
                      <span>Ringkasan Rekap Bulanan (Per Karyawan)</span>
                    </div>
                    <div className="mimici-panel-body" style={{ maxHeight: "360px", overflowY: "auto" }}>
                      <table className="mimici-summary-table">
                        <thead>
                          <tr>
                            <th style={{ width: "35px" }}>No</th>
                            <th style={{ textAlign: "left" }}>Nama Karyawan</th>
                            <th>Cabang</th>
                            <th>Hadir</th>
                            <th>Terlambat</th>
                            <th>Izin</th>
                            <th>Sakit</th>
                            <th>Alfa</th>
                            <th style={{ textAlign: "right" }}>Total Potongan</th>
                          </tr>
                        </thead>
                        <tbody>
                          {employeeRecapList.map((emp) => (
                            <tr key={emp.no}>
                              <td>{emp.no}</td>
                              <td className="mimici-branch-td">{emp.nama_lengkap}</td>
                              <td style={{ color: "#64748b" }}>{emp.cabang}</td>
                              <td>{emp.hadir}</td>
                              <td className={emp.terlambat > 0 ? "mimici-text-amber" : ""}>{emp.terlambat}</td>
                              <td>{emp.izin}</td>
                              <td>{emp.sakit}</td>
                              <td className={emp.alfa > 0 ? "mimici-text-red" : ""}>{emp.alfa}</td>
                              <td style={{ textAlign: "right", fontWeight: 600 }}>{money(emp.totalPotongan)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr>
                            <td colSpan="3" style={{ textAlign: "left", paddingLeft: "12px" }}>TOTAL KESELURUHAN</td>
                            <td>{overallSummary.hadir}</td>
                            <td className={overallSummary.terlambat > 0 ? "mimici-text-amber" : ""}>{overallSummary.terlambat}</td>
                            <td>{overallSummary.izin}</td>
                            <td>{overallSummary.sakit}</td>
                            <td className={overallSummary.alfa > 0 ? "mimici-text-red" : ""}>{overallSummary.alfa}</td>
                            <td style={{ textAlign: "right", color: "#dc2626", fontWeight: 800 }}>{money(overallSummary.totalPotongan)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>

                  {/* Panel 2: Persentase Kehadiran */}
                  <div className="mimici-panel mimici-panel-donut">
                    <div className="mimici-panel-header">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
                        <path d="M22 12A10 10 0 0 0 12 2v10z" />
                      </svg>
                      <span>Persentase Kehadiran</span>
                    </div>
                    <div className="mimici-panel-body mimici-donut-body">
                      <div className="mimici-donut-circle">
                        <span className="mimici-donut-val">{attendanceRate}%</span>
                        <span className="mimici-donut-lbl">Hadir</span>
                      </div>
                      <div className="mimici-donut-legend">
                        <div className="mimici-legend-item">
                          <span className="legend-dot dot-hadir" />
                          <span className="legend-name">Hadir</span>
                          <span className="legend-count">{overallSummary.hadir.toLocaleString("id-ID")}</span>
                        </div>
                        <div className="mimici-legend-item">
                          <span className="legend-dot dot-izin" />
                          <span className="legend-name">Izin</span>
                          <span className="legend-count">{overallSummary.izin.toLocaleString("id-ID")}</span>
                        </div>
                        <div className="mimici-legend-item">
                          <span className="legend-dot dot-sakit" />
                          <span className="legend-name">Sakit</span>
                          <span className="legend-count">{overallSummary.sakit.toLocaleString("id-ID")}</span>
                        </div>
                        <div className="mimici-legend-item">
                          <span className="legend-dot dot-alfa" />
                          <span className="legend-name">Alfa</span>
                          <span className="legend-count">{overallSummary.alfa.toLocaleString("id-ID")}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Panel 3: Catatan Penting */}
                  <div className="mimici-panel mimici-panel-notes">
                    <div className="mimici-panel-header">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
                        <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                        <path d="M4 22h16" />
                        <path d="M10 14.66V17c0 .55-.45 1-1 1H7" />
                        <path d="M14 14.66V17c0 .55.45 1 1 1h2" />
                        <path d="M18 2H6v7a6 6 0 0 0 12 0V2z" />
                      </svg>
                      <span>Catatan Penting</span>
                    </div>
                    <div className="mimici-panel-body mimici-notes-body">
                      <div className="mimici-note-card">
                        <div className="mimici-note-icon icon-blue">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                            <line x1="16" y1="2" x2="16" y2="6" />
                            <line x1="8" y1="2" x2="8" y2="6" />
                            <line x1="3" y1="10" x2="21" y2="10" />
                          </svg>
                        </div>
                        <div className="mimici-note-info">
                          <span className="mimici-note-label">Total Karyawan</span>
                          <span className="mimici-note-value">{employees.length} Orang</span>
                        </div>
                      </div>

                      <div className="mimici-note-card">
                        <div className="mimici-note-icon icon-amber">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <polyline points="12 6 12 12 16 14" />
                          </svg>
                        </div>
                        <div className="mimici-note-info">
                          <span className="mimici-note-label">Total Keterlambatan</span>
                          <span className="mimici-note-value text-amber">{overallSummary.menitTerlambat.toLocaleString("id-ID")} Menit</span>
                        </div>
                      </div>

                      <div className="mimici-note-card">
                        <div className="mimici-note-icon icon-red">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="12" y1="1" x2="12" y2="23" />
                            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                          </svg>
                        </div>
                        <div className="mimici-note-info">
                          <span className="mimici-note-label">Total Potongan</span>
                          <span className="mimici-note-value text-red">{money(overallSummary.totalPotongan)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* iOS Style Clock Popout Modal (Identical to Employee Portal) */}
      {isClockModalOpen && (
        <div
          className="clock-modal-backdrop"
          onClick={() => setIsClockModalOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div className="clock-modal-card" onClick={(e) => e.stopPropagation()}>
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

      {/* MODAL 1: Tambah Karyawan */}
      {isAddEmployeeModalOpen && (
        <div className="admin-modal-overlay" onClick={() => setIsAddEmployeeModalOpen(false)}>
          <div className="admin-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <div className="admin-modal-title">
                <h3>Tambah Karyawan Baru</h3>
              </div>
              <button
                type="button"
                className="admin-modal-close"
                onClick={() => setIsAddEmployeeModalOpen(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleAddEmployee}>
              <div className="admin-modal-body">
                <div className="admin-form-group">
                  <label className="admin-form-label">Nama Lengkap *</label>
                  <input
                    type="text"
                    className="admin-form-input"
                    placeholder="Contoh: Budi Santoso"
                    value={employeeForm.nama_lengkap}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, nama_lengkap: e.target.value })}
                    required
                  />
                </div>

                <div className="admin-form-grid-2">
                  <div className="admin-form-group">
                    <label className="admin-form-label">NIP (Nomor Induk Pegawai) *</label>
                    <input
                      type="text"
                      className="admin-form-input"
                      placeholder="Contoh: MMC-2026-003"
                      value={employeeForm.nip}
                      onChange={(e) => setEmployeeForm({ ...employeeForm, nip: e.target.value })}
                      required
                    />
                  </div>

                  <div className="admin-form-group">
                    <label className="admin-form-label">Username Akun *</label>
                    <input
                      type="text"
                      className="admin-form-input"
                      placeholder="Contoh: budi_mimici"
                      value={employeeForm.nama_pengguna}
                      onChange={(e) => setEmployeeForm({ ...employeeForm, nama_pengguna: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="admin-form-grid-2">
                  <div className="admin-form-group">
                    <label className="admin-form-label">Email *</label>
                    <input
                      type="email"
                      className="admin-form-input"
                      placeholder="budi@mimici.com"
                      value={employeeForm.email}
                      onChange={(e) => setEmployeeForm({ ...employeeForm, email: e.target.value })}
                      required
                    />
                  </div>

                  <div className="admin-form-group">
                    <label className="admin-form-label">Kata Sandi (Min. 8 Karakter) *</label>
                    <input
                      type="password"
                      className="admin-form-input"
                      placeholder="••••••••"
                      value={employeeForm.kata_sandi}
                      onChange={(e) => setEmployeeForm({ ...employeeForm, kata_sandi: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="admin-form-grid-2">
                  <div className="admin-form-group">
                    <label className="admin-form-label">Nomor Telepon</label>
                    <input
                      type="tel"
                      className="admin-form-input"
                      placeholder="081234567890"
                      value={employeeForm.nomor_telepon}
                      onChange={(e) => setEmployeeForm({ ...employeeForm, nomor_telepon: e.target.value })}
                    />
                  </div>

                  <div className="admin-form-group">
                    <label className="admin-form-label">Tanggal Bergabung</label>
                    <input
                      type="date"
                      className="admin-form-input"
                      value={employeeForm.tanggal_bergabung}
                      onChange={(e) => setEmployeeForm({ ...employeeForm, tanggal_bergabung: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <div className="admin-modal-footer">
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary"
                  onClick={() => setIsAddEmployeeModalOpen(false)}
                >
                  Batal
                </button>
                <button type="submit" className="admin-btn admin-btn-primary">
                  Simpan Karyawan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL KELOLA KARYAWAN (Atur Cabang, Hari Libur Mingguan, Status Akun, Hapus Akun) */}
      {selectedEmployeeForKelola && (
        <div className="admin-modal-overlay" onClick={() => !deletingEmployee && setSelectedEmployeeForKelola(null)}>
          <div className="admin-modal-box modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <div className="admin-modal-title">
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    background: "#e0f2fe",
                    color: "#0284c7",
                    display: "grid",
                    placeItems: "center",
                    flexShrink: 0,
                  }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ width: 20, height: 20 }}>
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                </div>
                <div>
                  <h3 style={{ margin: 0 }}>Kelola Karyawan</h3>
                  <div style={{ fontSize: "12.5px", color: "#64748b", marginTop: "2px" }}>
                    Atur cabang penempatan, hari libur mingguan, status akun, dan kelola karyawan
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="admin-modal-close"
                disabled={deletingEmployee}
                onClick={() => setSelectedEmployeeForKelola(null)}
              >
                ✕
              </button>
            </div>

            <div className="admin-modal-body">
              {/* Employee Summary Banner */}
              <div className="kelola-emp-hero">
                <div className="kelola-emp-avatar">
                  {selectedEmployeeForKelola.nama_lengkap.slice(0, 2).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <h4 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
                      {selectedEmployeeForKelola.nama_lengkap}
                    </h4>
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: "6px",
                        fontSize: "11.5px",
                        fontWeight: 700,
                        background: "#f1f5f9",
                        color: "#475569",
                      }}
                    >
                      NIP: {selectedEmployeeForKelola.nip}
                    </span>
                    <span
                      className={`badge-status ${
                        selectedEmployeeForKelola.status_karyawan === "aktif" ? "badge-hadir" : "badge-alfa"
                      }`}
                    >
                      {selectedEmployeeForKelola.status_karyawan === "aktif" ? "Akun Aktif" : "Akun Nonaktif"}
                    </span>
                  </div>
                  <div style={{ fontSize: "12.5px", color: "#64748b", marginTop: "4px" }}>
                    @{selectedEmployeeForKelola.nama_pengguna} &bull; {selectedEmployeeForKelola.email} &bull;{" "}
                    {selectedEmployeeForKelola.nomor_telepon || "Tidak ada telepon"}
                  </div>
                </div>
              </div>

              {/* Navigation Tabs */}
              <div className="kelola-tab-nav">
                <button
                  type="button"
                  className={`kelola-tab-btn ${kelolaTab === "cabang" ? "active" : ""}`}
                  onClick={() => setKelolaTab("cabang")}
                >
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                    <polyline points="9 22 9 12 15 12 15 22" />
                  </svg>
                  Atur Cabang
                </button>
                <button
                  type="button"
                  className={`kelola-tab-btn ${kelolaTab === "libur" ? "active" : ""}`}
                  onClick={() => setKelolaTab("libur")}
                >
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  Hari Libur Mingguan
                </button>
                <button
                  type="button"
                  className={`kelola-tab-btn ${kelolaTab === "status" ? "active" : ""}`}
                  onClick={() => setKelolaTab("status")}
                >
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                  Status Akun
                </button>
                <button
                  type="button"
                  className={`kelola-tab-btn ${kelolaTab === "hapus" ? "active" : ""}`}
                  onClick={() => setKelolaTab("hapus")}
                  style={{ color: kelolaTab === "hapus" ? "#dc2626" : undefined }}
                >
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                  Hapus Akun
                </button>
              </div>

              {/* TAB 1: ATUR CABANG */}
              {kelolaTab === "cabang" && (
                <div>
                  <div style={{ marginBottom: "16px", padding: "12px 16px", background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: "10px", color: "#0369a1", fontSize: "13px" }}>
                    📍 <strong>Status Penempatan Saat Ini:</strong>{" "}
                    {selectedEmployeeForKelola.penempatan && selectedEmployeeForKelola.penempatan.length > 0 ? (
                      <span>Ditempatkan di <strong>Mimici {selectedEmployeeForKelola.penempatan[0].nama_cabang}</strong> sejak {formatDate(selectedEmployeeForKelola.penempatan[0].tanggal_mulai)}</span>
                    ) : (
                      <span>Belum ditempatkan di cabang mana pun.</span>
                    )}
                  </div>

                  <form onSubmit={handleSavePlacementInKelola}>
                    <div className="admin-form-group">
                      <label className="admin-form-label">Pilih Cabang Penempatan *</label>
                      <select
                        className="admin-form-select"
                        value={placementForm.id_cabang}
                        onChange={(e) => setPlacementForm({ ...placementForm, id_cabang: e.target.value })}
                        required
                      >
                        <option value="">-- Pilih Cabang Mimici --</option>
                        {branches.map((b) => (
                          <option key={b.id_cabang} value={b.id_cabang}>
                            Mimici {b.nama_cabang} ({b.kode_cabang}) - Radius {b.radius_meter}m
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="admin-form-group">
                      <label className="admin-form-label">Tanggal Mulai Berlaku Penempatan *</label>
                      <input
                        type="date"
                        className="admin-form-input"
                        value={placementForm.tanggal_mulai}
                        onChange={(e) => setPlacementForm({ ...placementForm, tanggal_mulai: e.target.value })}
                        required
                      />
                    </div>

                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "20px" }}>
                      <button
                        type="submit"
                        className="admin-btn admin-btn-primary"
                        disabled={savingPlacement}
                      >
                        {savingPlacement ? "Menyimpan Cabang..." : "Simpan Penempatan Cabang"}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* TAB 2: HARI LIBUR MINGGUAN */}
              {kelolaTab === "libur" && (
                <div>
                  <div style={{ marginBottom: "16px", padding: "14px 16px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px" }}>
                    <div style={{ fontWeight: 700, fontSize: "14px", color: "#0f172a", marginBottom: "4px" }}>
                      🗓️ Pengaturan Hari Libur Rutin Mingguan
                    </div>
                    <p style={{ margin: 0, fontSize: "13px", color: "#64748b", lineHeight: 1.5 }}>
                      Tentukan hari libur mingguan untuk karyawan ini (contoh: <strong>Senin dan Kamis</strong>, atau <strong>Selasa dan Jumat</strong>). Sistem akan otomatis menetapkan status <strong>Libur</strong> pada hari-hari yang dipilih sehingga presensi tidak diwajibkan dan karyawan tidak terkena potongan.
                    </p>
                  </div>

                  {/* Preset Shortcuts */}
                  <div style={{ marginBottom: "16px" }}>
                    <label style={{ fontSize: "12px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      Pilihan Cepat (Presets):
                    </label>
                    <div className="kelola-presets" style={{ marginTop: "6px" }}>
                      <button
                        type="button"
                        className="kelola-preset-btn"
                        onClick={() => setKelolaDaysOff(["Senin", "Kamis"])}
                      >
                        Senin & Kamis
                      </button>
                      <button
                        type="button"
                        className="kelola-preset-btn"
                        onClick={() => setKelolaDaysOff(["Selasa", "Jumat"])}
                      >
                        Selasa & Jumat
                      </button>
                      <button
                        type="button"
                        className="kelola-preset-btn"
                        onClick={() => setKelolaDaysOff(["Rabu", "Sabtu"])}
                      >
                        Rabu & Sabtu
                      </button>
                      <button
                        type="button"
                        className="kelola-preset-btn"
                        onClick={() => setKelolaDaysOff(["Sabtu", "Minggu"])}
                      >
                        Sabtu & Minggu (Weekend)
                      </button>
                      <button
                        type="button"
                        className="kelola-preset-btn"
                        onClick={() => setKelolaDaysOff(["Minggu"])}
                      >
                        Minggu Saja
                      </button>
                      <button
                        type="button"
                        className="kelola-preset-btn"
                        style={{ color: "#ef4444", borderColor: "#fca5a5" }}
                        onClick={() => setKelolaDaysOff([])}
                      >
                        Kosongkan (Semua Hari Kerja)
                      </button>
                    </div>
                  </div>

                  {/* 7 Day Pills */}
                  <label style={{ fontSize: "12px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Pilih Hari Libur (Klik pada hari yang diinginkan):
                  </label>
                  <div className="kelola-days-grid">
                    {["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"].map((dayName) => {
                      const isSelected = kelolaDaysOff.includes(dayName);
                      return (
                        <div
                          key={dayName}
                          className={`kelola-day-pill ${isSelected ? "active" : ""}`}
                          onClick={() => handleToggleDayOff(dayName)}
                          role="checkbox"
                          aria-checked={isSelected}
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              handleToggleDayOff(dayName);
                            }
                          }}
                        >
                          <span style={{ fontSize: "13px", fontWeight: 700 }}>{dayName}</span>
                          <span style={{ fontSize: "11px", opacity: isSelected ? 0.9 : 0.6 }}>
                            {isSelected ? "✓ Libur" : "Kerja"}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Selection Summary */}
                  <div style={{ marginTop: "14px", padding: "12px 16px", background: kelolaDaysOff.length > 0 ? "#eff6ff" : "#f8fafc", border: `1px solid ${kelolaDaysOff.length > 0 ? "#bfdbfe" : "#e2e8f0"}`, borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ fontSize: "13px", color: kelolaDaysOff.length > 0 ? "#1e40af" : "#64748b" }}>
                      <strong>Hari Libur Terpilih:</strong>{" "}
                      {kelolaDaysOff.length > 0 ? (
                        <span>
                          <strong>{kelolaDaysOff.join(", ")}</strong> ({kelolaDaysOff.length} hari per minggu)
                        </span>
                      ) : (
                        <span>Tidak ada libur rutin (Karyawan bekerja setiap hari / mengikuti shift cabang)</span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "20px" }}>
                    <button
                      type="button"
                      className="admin-btn admin-btn-primary"
                      disabled={savingDaysOff}
                      onClick={handleSaveDaysOff}
                    >
                      {savingDaysOff ? "Menyimpan..." : "Simpan Hari Libur Mingguan"}
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 3: STATUS AKUN */}
              {kelolaTab === "status" && (
                <div>
                  <div style={{ padding: "16px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", marginBottom: "16px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                      <div>
                        <div style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a" }}>Status Akun Karyawan</div>
                        <div style={{ fontSize: "13px", color: "#64748b", marginTop: "2px" }}>
                          Karyawan: <strong>{selectedEmployeeForKelola.nama_lengkap}</strong> (@{selectedEmployeeForKelola.nama_pengguna})
                        </div>
                      </div>
                      <span className={`badge-status ${selectedEmployeeForKelola.status_karyawan === "aktif" ? "badge-hadir" : "badge-alfa"}`}>
                        {selectedEmployeeForKelola.status_karyawan === "aktif" ? "Aktif" : "Nonaktif"}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: "13px", color: "#475569", lineHeight: 1.5 }}>
                      {selectedEmployeeForKelola.status_karyawan === "aktif"
                        ? "Akun saat ini berstatus AKTIF. Karyawan dapat masuk ke sistem portal dan melakukan presensi kehadiran sesuai penempatan cabangnya."
                        : "Akun saat ini berstatus NONAKTIF. Karyawan diblokir dari login dan tidak dapat melakukan presensi kehadiran sampai akun diaktifkan kembali oleh administrator."}
                    </p>
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "20px" }}>
                    <button
                      type="button"
                      className={`admin-btn ${
                        selectedEmployeeForKelola.status_karyawan === "aktif" ? "admin-btn-secondary" : "admin-btn-success"
                      }`}
                      disabled={togglingStatus}
                      onClick={handleToggleStatusInKelola}
                    >
                      {togglingStatus
                        ? "Memperbarui Status..."
                        : selectedEmployeeForKelola.status_karyawan === "aktif"
                        ? "Nonaktifkan Akun Karyawan"
                        : "Aktifkan Kembali Akun Karyawan"}
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 4: HAPUS AKUN (ZONA BAHAYA) */}
              {kelolaTab === "hapus" && (
                <div className="kelola-danger-box">
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", marginBottom: "14px" }}>
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#fee2e2", color: "#dc2626", display: "grid", placeItems: "center", flexShrink: 0 }}>
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                        <line x1="12" y1="9" x2="12" y2="13" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                      </svg>
                    </div>
                    <div>
                      <h4 style={{ margin: "0 0 4px", fontSize: "15px", fontWeight: 700, color: "#991b1b" }}>
                        Hapus Akun Karyawan Secara Permanen
                      </h4>
                      <p style={{ margin: 0, fontSize: "13px", color: "#b91c1c", lineHeight: 1.5 }}>
                        Tindakan ini bersifat permanen dan tidak dapat dibatalkan. Menghapus akun ini akan menghapus akun login pengguna (@{selectedEmployeeForKelola.nama_pengguna}), riwayat absensi, penempatan cabang, serta seluruh pengajuan izin/sakit terkait.
                      </p>
                    </div>
                  </div>

                  <div style={{ margin: "16px 0" }}>
                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 700, color: "#991b1b", marginBottom: "6px" }}>
                      Konfirmasi Penghapusan (Ketik <strong>HAPUS</strong> untuk melanjutkan):
                    </label>
                    <input
                      type="text"
                      className="admin-form-input"
                      placeholder="Ketik kata HAPUS..."
                      value={deleteConfirmationText}
                      onChange={(e) => setDeleteConfirmationText(e.target.value)}
                      style={{ borderColor: "#fca5a5" }}
                    />
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "16px" }}>
                    <button
                      type="button"
                      className="admin-btn admin-btn-secondary"
                      onClick={() => setKelolaTab("cabang")}
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      className="admin-btn admin-btn-danger"
                      disabled={deleteConfirmationText.trim().toUpperCase() !== "HAPUS" || deletingEmployee}
                      onClick={handleDeleteInKelola}
                    >
                      {deletingEmployee ? "Menghapus Akun..." : "Ya, Hapus Akun Karyawan"}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="admin-modal-footer">
              <button
                type="button"
                className="admin-btn admin-btn-secondary"
                disabled={deletingEmployee}
                onClick={() => setSelectedEmployeeForKelola(null)}
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Atur Penempatan Cabang */}
      {isPlacementModalOpen && selectedEmployeeForPlacement && (
        <div className="admin-modal-overlay" onClick={() => setIsPlacementModalOpen(false)}>
          <div className="admin-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <div className="admin-modal-title">
                <h3>Atur Penempatan Cabang</h3>
              </div>
              <button
                type="button"
                className="admin-modal-close"
                onClick={() => setIsPlacementModalOpen(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSavePlacement}>
              <div className="admin-modal-body">
                <div style={{ marginBottom: "16px", padding: "12px", background: "#f8fafc", borderRadius: "10px" }}>
                  <div style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a" }}>
                    {selectedEmployeeForPlacement.nama_lengkap}
                  </div>
                  <div style={{ fontSize: "12.5px", color: "#64748b" }}>
                    NIP: {selectedEmployeeForPlacement.nip} &middot; {selectedEmployeeForPlacement.email}
                  </div>
                </div>

                <div className="admin-form-group">
                  <label className="admin-form-label">Pilih Cabang Penempatan *</label>
                  <select
                    className="admin-form-select"
                    value={placementForm.id_cabang}
                    onChange={(e) => setPlacementForm({ ...placementForm, id_cabang: e.target.value })}
                    required
                  >
                    <option value="">-- Pilih Cabang Mimici --</option>
                    {branches.map((b) => (
                      <option key={b.id_cabang} value={b.id_cabang}>
                        Mimici {b.nama_cabang} ({b.kode_cabang}) - Radius {b.radius_meter}m
                      </option>
                    ))}
                  </select>
                </div>

                <div className="admin-form-group">
                  <label className="admin-form-label">Mulai Berlaku Tanggal *</label>
                  <input
                    type="date"
                    className="admin-form-input"
                    value={placementForm.tanggal_mulai}
                    onChange={(e) => setPlacementForm({ ...placementForm, tanggal_mulai: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="admin-modal-footer">
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary"
                  onClick={() => setIsPlacementModalOpen(false)}
                >
                  Batal
                </button>
                <button type="submit" className="admin-btn admin-btn-primary">
                  Simpan Penempatan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Tambah Cabang Baru */}
      {isAddBranchModalOpen && (
        <div className="admin-modal-overlay" onClick={() => setIsAddBranchModalOpen(false)}>
          <div className="admin-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <div className="admin-modal-title">
                <h3>Tambah Cabang Operasional</h3>
              </div>
              <button
                type="button"
                className="admin-modal-close"
                onClick={() => setIsAddBranchModalOpen(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleAddBranch}>
              <div className="admin-modal-body">
                <div className="admin-form-grid-2">
                  <div className="admin-form-group">
                    <label className="admin-form-label">Kode Cabang *</label>
                    <input
                      type="text"
                      className="admin-form-input"
                      placeholder="Contoh: BOGOR-PAKUAN"
                      value={branchForm.kode_cabang}
                      onChange={(e) => setBranchForm({ ...branchForm, kode_cabang: e.target.value })}
                      required
                    />
                  </div>

                  <div className="admin-form-group">
                    <label className="admin-form-label">Nama Cabang *</label>
                    <input
                      type="text"
                      className="admin-form-input"
                      placeholder="Contoh: Pakuan"
                      value={branchForm.nama_cabang}
                      onChange={(e) => setBranchForm({ ...branchForm, nama_cabang: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="admin-form-group">
                  <label className="admin-form-label">Alamat Lengkap</label>
                  <input
                    type="text"
                    className="admin-form-input"
                    placeholder="Contoh: Jl. Pakuan No. 12, Bogor"
                    value={branchForm.alamat}
                    onChange={(e) => setBranchForm({ ...branchForm, alamat: e.target.value })}
                  />
                </div>

                <div className="admin-form-grid-2">
                  <div className="admin-form-group">
                    <label className="admin-form-label">Latitude (Lintang GPS) *</label>
                    <input
                      type="number"
                      step="any"
                      className="admin-form-input"
                      placeholder="-6.5971"
                      value={branchForm.latitude}
                      onChange={(e) => setBranchForm({ ...branchForm, latitude: e.target.value })}
                      required
                    />
                  </div>

                  <div className="admin-form-group">
                    <label className="admin-form-label">Longitude (Bujur GPS) *</label>
                    <input
                      type="number"
                      step="any"
                      className="admin-form-input"
                      placeholder="106.8060"
                      value={branchForm.longitude}
                      onChange={(e) => setBranchForm({ ...branchForm, longitude: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="admin-form-grid-2">
                  <div className="admin-form-group">
                    <label className="admin-form-label">Radius Geofencing (Meter) *</label>
                    <input
                      type="number"
                      className="admin-form-input"
                      value={branchForm.radius_meter}
                      onChange={(e) => setBranchForm({ ...branchForm, radius_meter: e.target.value })}
                      required
                    />
                  </div>

                  <div className="admin-form-group">
                    <label className="admin-form-label">Kode QR (Opsional)</label>
                    <input
                      type="text"
                      className="admin-form-input"
                      placeholder="Default otomatis"
                      value={branchForm.kode_qr}
                      onChange={(e) => setBranchForm({ ...branchForm, kode_qr: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <div className="admin-modal-footer">
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary"
                  onClick={() => setIsAddBranchModalOpen(false)}
                >
                  Batal
                </button>
                <button type="submit" className="admin-btn admin-btn-primary">
                  Simpan Cabang
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: Tambah Jadwal Shift */}
      {isAddScheduleModalOpen && (
        <div className="admin-modal-overlay" onClick={() => setIsAddScheduleModalOpen(false)}>
          <div className="admin-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <div className="admin-modal-title">
                <h3>Tambah Jadwal Shift Cabang</h3>
              </div>
              <button
                type="button"
                className="admin-modal-close"
                onClick={() => setIsAddScheduleModalOpen(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleAddSchedule}>
              <div className="admin-modal-body">
                <div className="admin-form-group">
                  <label className="admin-form-label">Pilih Cabang *</label>
                  <select
                    className="admin-form-select"
                    value={scheduleForm.id_cabang}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, id_cabang: e.target.value })}
                    required
                  >
                    <option value="">-- Pilih Cabang --</option>
                    {branches.map((b) => (
                      <option key={b.id_cabang} value={b.id_cabang}>
                        Mimici {b.nama_cabang} ({b.kode_cabang})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="admin-form-grid-2">
                  <div className="admin-form-group">
                    <label className="admin-form-label">Kode Jadwal *</label>
                    <input
                      type="text"
                      className="admin-form-input"
                      placeholder="Contoh: SHIFT_PAGI"
                      value={scheduleForm.kode_jadwal}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, kode_jadwal: e.target.value })}
                      required
                    />
                  </div>

                  <div className="admin-form-group">
                    <label className="admin-form-label">Nama Jadwal *</label>
                    <input
                      type="text"
                      className="admin-form-input"
                      placeholder="Contoh: Shift Pagi Reguler"
                      value={scheduleForm.nama_jadwal}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, nama_jadwal: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="admin-form-grid-2">
                  <div className="admin-form-group">
                    <label className="admin-form-label">Jam Masuk *</label>
                    <input
                      type="time"
                      className="admin-form-input"
                      value={scheduleForm.jam_mulai}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, jam_mulai: e.target.value })}
                      required
                    />
                  </div>

                  <div className="admin-form-group">
                    <label className="admin-form-label">Jam Pulang</label>
                    <input
                      type="time"
                      className="admin-form-input"
                      value={scheduleForm.jam_selesai}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, jam_selesai: e.target.value })}
                    />
                  </div>
                </div>

                <div className="admin-form-group">
                  <label className="admin-form-label">Toleransi Keterlambatan (Menit) *</label>
                  <input
                    type="number"
                    className="admin-form-input"
                    value={scheduleForm.toleransi_menit}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, toleransi_menit: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="admin-modal-footer">
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary"
                  onClick={() => setIsAddScheduleModalOpen(false)}
                >
                  Batal
                </button>
                <button type="submit" className="admin-btn admin-btn-primary">
                  Simpan Jadwal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL KELOLA CABANG (Status Aktif/Nonaktif & Hapus Cabang) */}
      {selectedBranchForKelola && (
        <div className="admin-modal-overlay" onClick={() => !deletingBranch && setSelectedBranchForKelola(null)}>
          <div className="admin-modal-box" style={{ maxWidth: "520px" }} onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <div className="admin-modal-title">
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    background: "#e0e7ff",
                    color: "#4f46e5",
                    display: "grid",
                    placeItems: "center",
                    flexShrink: 0,
                  }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 20, height: 20 }}>
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                </div>
                <div>
                  <h3 style={{ margin: 0 }}>Kelola Cabang Mimici</h3>
                  <div style={{ fontSize: "12.5px", color: "#64748b", marginTop: "2px" }}>
                    Atur status operasional atau hapus cabang gerai
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="admin-modal-close"
                disabled={deletingBranch}
                onClick={() => setSelectedBranchForKelola(null)}
              >
                ✕
              </button>
            </div>

            <div className="admin-modal-body" style={{ gap: "16px", display: "flex", flexDirection: "column" }}>
              {/* Branch info card */}
              <div
                style={{
                  padding: "16px",
                  background: "#f8fafc",
                  borderRadius: "12px",
                  border: "1px solid #e2e8f0",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <h4 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
                    Mimici {selectedBranchForKelola.nama_cabang}
                  </h4>
                  <span
                    className={`badge-status ${
                      selectedBranchForKelola.status_cabang === "aktif" ? "badge-hadir" : "badge-alfa"
                    }`}
                  >
                    {selectedBranchForKelola.status_cabang === "aktif" ? "Aktif" : "Nonaktif"}
                  </span>
                </div>
                <div style={{ fontSize: "13px", color: "#64748b", display: "flex", flexDirection: "column", gap: "6px" }}>
                  <div><strong>Kode Cabang:</strong> {selectedBranchForKelola.kode_cabang}</div>
                  <div><strong>Alamat:</strong> {selectedBranchForKelola.alamat || "-"}</div>
                  <div>
                    <strong>Koordinat GPS:</strong>{" "}
                    <code style={{ background: "#e2e8f0", padding: "2px 6px", borderRadius: "4px" }}>
                      {selectedBranchForKelola.latitude}, {selectedBranchForKelola.longitude}
                    </code>
                  </div>
                  <div><strong>Radius Geofence:</strong> {selectedBranchForKelola.radius_meter} meter</div>
                </div>
              </div>

              {/* Action 1: Toggle Status */}
              <div
                style={{
                  padding: "14px 16px",
                  background: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderRadius: "12px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "12px",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: "14px", color: "#0f172a" }}>
                    Status Operasional Cabang
                  </div>
                  <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
                    {selectedBranchForKelola.status_cabang === "aktif"
                      ? "Cabang saat ini aktif dan dapat digunakan presensi."
                      : "Cabang saat ini nonaktif. Presensi di gerai ini ditutup."}
                  </div>
                </div>
                <button
                  type="button"
                  className={`admin-btn admin-btn-sm ${
                    selectedBranchForKelola.status_cabang === "aktif" ? "admin-btn-secondary" : "admin-btn-success"
                  }`}
                  disabled={togglingStatus}
                  onClick={handleToggleBranchStatusFromModal}
                >
                  {togglingStatus ? "Memproses..." : selectedBranchForKelola.status_cabang === "aktif" ? "Nonaktifkan" : "Aktifkan"}
                </button>
              </div>

              {/* Action 2: Hapus Cabang Permanen */}
              <div
                style={{
                  padding: "14px 16px",
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  borderRadius: "12px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <strong style={{ color: "#991b1b", fontSize: "13.5px" }}>Zona Berbahaya: Hapus Cabang</strong>
                </div>
                <p style={{ margin: "0 0 12px", fontSize: "12.5px", color: "#7f1d1d", lineHeight: 1.5 }}>
                  Menghapus cabang ini akan menghapus jadwal shift kerja, riwayat penempatan, dan rekaman presensi terkait secara permanen.
                </p>
                <button
                  type="button"
                  className="admin-btn admin-btn-danger admin-btn-sm"
                  style={{ width: "100%", justifyContent: "center" }}
                  disabled={deletingBranch}
                  onClick={handleDeleteBranchFromModal}
                >
                  {deletingBranch ? "Menghapus Cabang..." : "Hapus Cabang Permanen"}
                </button>
              </div>
            </div>

            <div className="admin-modal-footer">
              <button
                type="button"
                className="admin-btn admin-btn-secondary"
                disabled={deletingBranch}
                onClick={() => setSelectedBranchForKelola(null)}
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL KELOLA JADWAL SHIFT (Edit Jam Kerja, Toleransi & Hapus Jadwal) */}
      {selectedScheduleForKelola && (
        <div className="admin-modal-overlay" onClick={() => !savingSchedule && !deletingSchedule && setSelectedScheduleForKelola(null)}>
          <div className="admin-modal-box" style={{ maxWidth: "480px" }} onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <div className="admin-modal-title">
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    background: "#fef3c7",
                    color: "#d97706",
                    display: "grid",
                    placeItems: "center",
                    flexShrink: 0,
                  }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 20, height: 20 }}>
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </div>
                <div>
                  <h3 style={{ margin: 0 }}>Kelola Jadwal Shift</h3>
                  <div style={{ fontSize: "12.5px", color: "#64748b", marginTop: "2px" }}>
                    Edit jam kerja, toleransi keterlambatan, atau hapus shift
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="admin-modal-close"
                disabled={savingSchedule || deletingSchedule}
                onClick={() => setSelectedScheduleForKelola(null)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateSchedule}>
              <div className="admin-modal-body">
                <div className="admin-form-group">
                  <label className="admin-form-label">Cabang *</label>
                  <select
                    className="admin-form-select"
                    value={editScheduleForm.id_cabang}
                    onChange={(e) => setEditScheduleForm({ ...editScheduleForm, id_cabang: e.target.value })}
                    required
                  >
                    {branches.map((b) => (
                      <option key={b.id_cabang} value={b.id_cabang}>
                        Mimici {b.nama_cabang}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="admin-form-row">
                  <div className="admin-form-group">
                    <label className="admin-form-label">Jam Masuk (Mulai) *</label>
                    <input
                      type="time"
                      className="admin-form-input"
                      value={editScheduleForm.jam_mulai}
                      onChange={(e) => setEditScheduleForm({ ...editScheduleForm, jam_mulai: e.target.value })}
                      required
                    />
                  </div>
                  <div className="admin-form-group">
                    <label className="admin-form-label">Jam Pulang (Selesai)</label>
                    <input
                      type="time"
                      className="admin-form-input"
                      value={editScheduleForm.jam_selesai}
                      onChange={(e) => setEditScheduleForm({ ...editScheduleForm, jam_selesai: e.target.value })}
                    />
                  </div>
                </div>

                <div className="admin-form-group">
                  <label className="admin-form-label">Toleransi Keterlambatan (menit) *</label>
                  <input
                    type="number"
                    min="0"
                    max="180"
                    className="admin-form-input"
                    value={editScheduleForm.toleransi_menit}
                    onChange={(e) => setEditScheduleForm({ ...editScheduleForm, toleransi_menit: e.target.value })}
                    required
                  />
                  <small style={{ color: "#64748b", fontSize: "12px", marginTop: "4px", display: "block" }}>
                    Presensi melebihi toleransi akan dikenakan denda Rp 1.000 per menit keterlambatan.
                  </small>
                </div>
              </div>

              <div
                className="admin-modal-footer"
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
              >
                <button
                  type="button"
                  className="admin-btn admin-btn-danger admin-btn-sm"
                  disabled={savingSchedule || deletingSchedule}
                  onClick={handleDeleteSchedule}
                >
                  {deletingSchedule ? "Menghapus..." : "Hapus Jadwal"}
                </button>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    type="button"
                    className="admin-btn admin-btn-secondary"
                    disabled={savingSchedule || deletingSchedule}
                    onClick={() => setSelectedScheduleForKelola(null)}
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="admin-btn admin-btn-primary"
                    disabled={savingSchedule || deletingSchedule}
                  >
                    {savingSchedule ? "Menyimpan..." : "Simpan Perubahan"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: Keputusan Pengajuan */}
      {decisionModal && (
        <div className="admin-modal-overlay" onClick={() => setDecisionModal(null)}>
          <div className="admin-modal-box" style={{ maxWidth: "480px" }} onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <div className="admin-modal-title">
                <h3>
                  Konfirmasi:{" "}
                  {decisionModal.decision === "disetujui" ? (
                    <span style={{ color: "#059669" }}>Setujui Pengajuan</span>
                  ) : (
                    <span style={{ color: "#dc2626" }}>Tolak Pengajuan</span>
                  )}
                </h3>
              </div>
              <button
                type="button"
                className="admin-modal-close"
                onClick={() => setDecisionModal(null)}
              >
                ✕
              </button>
            </div>
            <div className="admin-modal-body">
              <p style={{ margin: "0 0 14px", fontSize: "14px", color: "#334155" }}>
                Anda akan menandai pengajuan dari <strong>{decisionModal.name}</strong> sebagai{" "}
                <strong>{decisionModal.decision.toUpperCase()}</strong>.
              </p>

              <div className="admin-form-group">
                <label className="admin-form-label">Catatan Admin (Opsional)</label>
                <textarea
                  className="admin-form-textarea"
                  placeholder="Tambahkan catatan atau alasan keputusan untuk karyawan..."
                  value={decisionNote}
                  onChange={(e) => setDecisionNote(e.target.value)}
                />
              </div>
            </div>
            <div className="admin-modal-footer">
              <button
                type="button"
                className="admin-btn admin-btn-secondary"
                onClick={() => setDecisionModal(null)}
              >
                Batal
              </button>
              <button
                type="button"
                className={`admin-btn ${
                  decisionModal.decision === "disetujui" ? "admin-btn-success" : "admin-btn-danger"
                }`}
                onClick={handleConfirmDecision}
              >
                Konfirmasi {decisionModal.decision === "disetujui" ? "Setujui" : "Tolak"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 6: Konfirmasi Hapus Akun Karyawan */}
      {employeeToDelete && (
        <div className="admin-modal-overlay" onClick={() => !deletingEmployee && setEmployeeToDelete(null)}>
          <div className="admin-modal-box" style={{ maxWidth: "480px" }} onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <div className="admin-modal-title">
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: "#fee2e2",
                    color: "#dc2626",
                    display: "grid",
                    placeItems: "center",
                    flexShrink: 0,
                  }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 18, height: 18 }}>
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    <line x1="10" y1="11" x2="10" y2="17" />
                    <line x1="14" y1="11" x2="14" y2="17" />
                  </svg>
                </div>
                <h3>Hapus Akun Karyawan</h3>
              </div>
              <button
                type="button"
                className="admin-modal-close"
                disabled={deletingEmployee}
                onClick={() => setEmployeeToDelete(null)}
              >
                ✕
              </button>
            </div>
            <div className="admin-modal-body">
              <p style={{ margin: "0 0 14px", fontSize: "14.5px", color: "#1e293b", lineHeight: 1.6 }}>
                Apakah Anda yakin ingin menghapus akun karyawan <strong>{employeeToDelete.nama_lengkap}</strong> (NIP: <strong>{employeeToDelete.nip}</strong>)?
              </p>
              <div
                style={{
                  padding: "12px 14px",
                  background: "#fff1f2",
                  border: "1px solid #fecaca",
                  borderRadius: "10px",
                  color: "#991b1b",
                  fontSize: "13px",
                  lineHeight: 1.5,
                }}
              >
                ⚠️ <strong>Peringatan:</strong> Tindakan ini akan menghapus akun login pengguna (@{employeeToDelete.nama_pengguna}), data penempatan cabang, rekaman absensi, serta seluruh pengajuan izin/sakit terkait secara permanen.
              </div>
            </div>
            <div className="admin-modal-footer">
              <button
                type="button"
                className="admin-btn admin-btn-secondary"
                disabled={deletingEmployee}
                onClick={() => setEmployeeToDelete(null)}
              >
                Batal
              </button>
              <button
                type="button"
                className="admin-btn admin-btn-danger"
                disabled={deletingEmployee}
                onClick={handleConfirmDeleteEmployee}
              >
                {deletingEmployee ? "Menghapus..." : "Ya, Hapus Akun"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Detail Pengajuan Karyawan (Icon Mata) */}
      {detailModal && (
        <div className="proof-modal-backdrop" onClick={() => setDetailModal(null)} role="dialog" aria-modal="true">
          <div className="proof-modal-card" style={{ maxWidth: "640px" }} onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="proof-modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div
                  style={{
                    width: "40px",
                    height: "40px",
                    borderRadius: "12px",
                    background: "#eff6ff",
                    color: "#2563eb",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: "17.5px", fontWeight: 700, color: "#0f172a" }}>
                    Detail Pengajuan {detailModal.jenis ? detailModal.jenis.toUpperCase() : "IZIN / SAKIT"}
                  </h3>
                  <small style={{ color: "#64748b", fontSize: "12.5px" }}>
                    Karyawan: <strong>{detailModal.nama_lengkap}</strong> ({detailModal.nip})
                  </small>
                </div>
              </div>
              <button
                type="button"
                className="proof-modal-close-btn"
                onClick={() => setDetailModal(null)}
                aria-label="Tutup"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="proof-modal-body" style={{ padding: "20px 24px", gap: "16px", alignItems: "stretch" }}>
              {/* Profile & Info Cards */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: "12px",
                  background: "#f8fafc",
                  padding: "14px 16px",
                  borderRadius: "14px",
                  border: "1px solid #e2e8f0",
                }}
              >
                <div>
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Periode Pengajuan
                  </span>
                  <div style={{ marginTop: "4px", fontSize: "14px", fontWeight: 600, color: "#0f172a" }}>
                    {formatDate(detailModal.tanggal_mulai)}
                    {detailModal.tanggal_selesai && detailModal.tanggal_selesai !== detailModal.tanggal_mulai && (
                      <> s/d {formatDate(detailModal.tanggal_selesai)}</>
                    )}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Status Keputusan
                  </span>
                  <div style={{ marginTop: "4px" }}>
                    <span
                      className={`badge-status ${
                        detailModal.status === "disetujui"
                          ? "badge-disetujui"
                          : detailModal.status === "ditolak"
                          ? "badge-ditolak"
                          : "badge-menunggu"
                      }`}
                    >
                      {detailModal.status ? detailModal.status.toUpperCase() : "MENUNGGU"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Alasan Lengkap */}
              <div
                style={{
                  background: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderLeft: "4px solid #2563eb",
                  borderRadius: "12px",
                  padding: "14px 18px",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  <span style={{ fontSize: "12px", fontWeight: 700, color: "#2563eb", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Alasan Lengkap dari Karyawan
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: "14px", color: "#1e293b", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                  {detailModal.alasan || "(Tidak ada keterangan alasan)"}
                </p>
              </div>

              {/* Bukti Foto / Dokumen */}
              <div
                style={{
                  background: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderRadius: "14px",
                  padding: "16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                    <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#334155", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      Bukti Foto / Surat Keterangan Dokter
                    </span>
                  </div>
                  {detailModal.nama_file_bukti && (
                    <small style={{ color: "#64748b", fontSize: "12px" }}>{detailModal.nama_file_bukti}</small>
                  )}
                </div>

                {detailModal.foto_bukti ? (
                  <div style={{ textAlign: "center", background: "#f8fafc", borderRadius: "10px", padding: "12px", border: "1px solid #f1f5f9" }}>
                    <img
                      src={detailModal.foto_bukti}
                      alt="Bukti Surat Karyawan"
                      className="proof-modal-img"
                      style={{ maxHeight: "40vh" }}
                    />
                  </div>
                ) : (
                  <div style={{ padding: "20px", textAlign: "center", background: "#f8fafc", borderRadius: "10px", color: "#94a3b8", fontSize: "13px" }}>
                    Tidak ada lampiran foto bukti pada pengajuan ini.
                  </div>
                )}
              </div>

              {/* Catatan Admin jika sudah diproses */}
              {detailModal.catatan_admin && (
                <div
                  style={{
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    borderRadius: "12px",
                    padding: "12px 16px",
                  }}
                >
                  <span style={{ fontSize: "11.5px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
                    Catatan Keputusan Admin:
                  </span>
                  <p style={{ margin: "4px 0 0", fontSize: "13.5px", color: "#334155" }}>
                    {detailModal.catatan_admin}
                  </p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: "14px 24px",
                borderTop: "1px solid #e2e8f0",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "#f8fafc",
              }}
            >
              <div>
                {(detailModal.status || "").toLowerCase() === "menunggu" && (
                  <span style={{ fontSize: "12.5px", color: "#d97706", fontWeight: 600 }}>
                    ⏳ Menunggu keputusan admin
                  </span>
                )}
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary"
                  onClick={() => setDetailModal(null)}
                >
                  Tutup
                </button>
                {(detailModal.status || "").toLowerCase() === "menunggu" && (
                  <>
                    <button
                      type="button"
                      className="admin-btn admin-btn-danger"
                      onClick={() => {
                        const target = detailModal;
                        setDetailModal(null);
                        setDecisionModal({
                          id: target.id_pengajuan,
                          decision: "ditolak",
                          name: target.nama_lengkap,
                        });
                        setDecisionNote("");
                      }}
                    >
                      Tolak
                    </button>
                    <button
                      type="button"
                      className="admin-btn admin-btn-success"
                      onClick={() => {
                        const target = detailModal;
                        setDetailModal(null);
                        setDecisionModal({
                          id: target.id_pengajuan,
                          decision: "disetujui",
                          name: target.nama_lengkap,
                        });
                        setDecisionNote("");
                      }}
                    >
                      Setujui
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Pengaturan & Ubah Akun Admin */}
      {isAccountModalOpen && (
        <div
          className="proof-modal-backdrop"
          onClick={() => !savingAccount && setIsAccountModalOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="proof-modal-card"
            style={{ maxWidth: "520px" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="proof-modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div
                  style={{
                    width: "42px",
                    height: "42px",
                    borderRadius: "12px",
                    background: "linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)",
                    color: "#ffffff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: "17.5px", fontWeight: 700, color: "#0f172a" }}>
                    Pengaturan Akun Administrator
                  </h3>
                  <small style={{ color: "#64748b", fontSize: "12.5px" }}>
                    Kelola username, email, dan kata sandi admin Anda
                  </small>
                </div>
              </div>
              <button
                type="button"
                className="proof-modal-close-btn"
                onClick={() => !savingAccount && setIsAccountModalOpen(false)}
                aria-label="Tutup"
              >
                ✕
              </button>
            </div>

            {/* Modal Body Form */}
            <form onSubmit={handleSaveAccount}>
              <div
                className="proof-modal-body"
                style={{ padding: "20px 24px", gap: "16px", alignItems: "stretch" }}
              >
                {/* Security Single-Admin Banner */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "10px",
                    background: "#f0fdf4",
                    border: "1px solid #bbf7d0",
                    borderRadius: "10px",
                    padding: "12px 14px",
                    fontSize: "12.5px",
                    color: "#166534",
                    lineHeight: 1.5,
                  }}
                >
                  <span style={{ fontSize: "16px", flexShrink: 0 }}>🛡️</span>
                  <div>
                    <strong>Sistem Keamanan Akun Tunggal:</strong> Sistem presensi menerapkan kebijakan ketat <strong>hanya 1 akun admin aktif</strong> untuk mencegah kebocoran akses dan akun liar. Anda dapat mengganti username, email, dan password sewaktu-waktu di sini.
                  </div>
                </div>

                {accountModalError && (
                  <div
                    style={{
                      background: "#fef2f2",
                      border: "1px solid #fecaca",
                      borderRadius: "10px",
                      padding: "10px 14px",
                      fontSize: "13px",
                      color: "#dc2626",
                    }}
                  >
                    ⚠️ {accountModalError}
                  </div>
                )}

                {accountModalSuccess && (
                  <div
                    style={{
                      background: "#f0fdf4",
                      border: "1px solid #bbf7d0",
                      borderRadius: "10px",
                      padding: "10px 14px",
                      fontSize: "13px",
                      color: "#16a34a",
                    }}
                  >
                    ✅ {accountModalSuccess}
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "13px", fontWeight: 600, color: "#334155" }}>
                    Username Admin <span style={{ color: "#dc2626" }}>*</span>
                  </label>
                  <input
                    type="text"
                    className="admin-input"
                    value={accountForm.nama_pengguna}
                    onChange={(e) => setAccountForm({ ...accountForm, nama_pengguna: e.target.value })}
                    placeholder="Contoh: admin-mimici-bogor"
                    required
                  />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "13px", fontWeight: 600, color: "#334155" }}>
                    Email Admin <span style={{ color: "#dc2626" }}>*</span>
                  </label>
                  <input
                    type="email"
                    className="admin-input"
                    value={accountForm.email}
                    onChange={(e) => setAccountForm({ ...accountForm, email: e.target.value })}
                    placeholder="Contoh: admin.mimicibogor@gmail.com"
                    required
                  />
                </div>

                <div
                  style={{
                    borderTop: "1px solid #e2e8f0",
                    paddingTop: "14px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                  }}
                >
                  <div style={{ fontSize: "12.5px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Ganti Kata Sandi (Opsional)
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <label style={{ fontSize: "13px", fontWeight: 600, color: "#334155" }}>
                      Kata Sandi Baru
                    </label>
                    <input
                      type="password"
                      className="admin-input"
                      value={accountForm.kata_sandi_baru}
                      onChange={(e) => setAccountForm({ ...accountForm, kata_sandi_baru: e.target.value })}
                      placeholder="Kosongkan jika tidak ingin mengganti kata sandi"
                      autoComplete="new-password"
                    />
                  </div>

                  {accountForm.kata_sandi_baru && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      <label style={{ fontSize: "13px", fontWeight: 600, color: "#334155" }}>
                        Konfirmasi Kata Sandi Baru <span style={{ color: "#dc2626" }}>*</span>
                      </label>
                      <input
                        type="password"
                        className="admin-input"
                        value={accountForm.konfirmasi_kata_sandi}
                        onChange={(e) => setAccountForm({ ...accountForm, konfirmasi_kata_sandi: e.target.value })}
                        placeholder="Ketik ulang kata sandi baru"
                        autoComplete="new-password"
                        required
                      />
                    </div>
                  )}
                </div>

                <div
                  style={{
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    borderRadius: "10px",
                    padding: "12px 14px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                  }}
                >
                  <label style={{ fontSize: "13px", fontWeight: 600, color: "#0f172a" }}>
                    Kata Sandi Saat Ini <span style={{ color: "#dc2626" }}>*</span>
                  </label>
                  <input
                    type="password"
                    className="admin-input"
                    value={accountForm.kata_sandi_saat_ini}
                    onChange={(e) => setAccountForm({ ...accountForm, kata_sandi_saat_ini: e.target.value })}
                    placeholder="Masukkan kata sandi saat ini untuk verifikasi"
                    autoComplete="current-password"
                    required
                  />
                  <small style={{ color: "#64748b", fontSize: "11.5px" }}>
                    Wajib diisi sebagai konfirmasi otentikasi bahwa perubahan dilakukan oleh admin yang sah.
                  </small>
                </div>
              </div>

              {/* Modal Footer */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "10px",
                  padding: "14px 24px",
                  background: "#f8fafc",
                  borderTop: "1px solid #e2e8f0",
                  borderBottomLeftRadius: "16px",
                  borderBottomRightRadius: "16px",
                }}
              >
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary"
                  onClick={() => setIsAccountModalOpen(false)}
                  disabled={savingAccount}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="admin-btn admin-btn-primary"
                  disabled={savingAccount}
                >
                  {savingAccount ? "Menyimpan Perubahan..." : "Simpan Perubahan Akun"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
