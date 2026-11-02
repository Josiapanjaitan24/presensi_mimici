export function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

export function sendError(res, status, message) {
  return res.status(status).json({ success: false, message });
}

/**
 * Response DTO untuk sesi autentikasi (/login, /me, /refresh).
 * Menerapkan prinsip Data Minimization: hanya mengirimkan field yang
 * benar-benar diperlukan oleh frontend (nama_pengguna & peran), tanpa
 * mengekspos id_pengguna internal, email, atau status_akun pada sesi umum.
 */
export function toAuthUserDTO(pengguna) {
  if (!pengguna) return null;
  return {
    nama_pengguna: String(pengguna.nama_pengguna || ""),
    peran: String(pengguna.peran || ""),
  };
}

/**
 * Response DTO untuk modal Pengaturan Akun Admin (/admin/account).
 * Hanya mengirimkan field yang diperlukan form pengaturan akun.
 */
export function toAdminAccountDTO(pengguna) {
  if (!pengguna) return null;
  return {
    nama_pengguna: String(pengguna.nama_pengguna || ""),
    email: String(pengguna.email || ""),
    peran: String(pengguna.peran || "admin"),
  };
}

/**
 * Response DTO untuk profil ringkas karyawan pada Dashboard Karyawan.
 */
export function toEmployeeDashboardDTO(employee) {
  if (!employee) return null;
  return {
    nip: String(employee.nip || ""),
    nama_lengkap: String(employee.nama_lengkap || ""),
  };
}

/**
 * Response DTO untuk informasi penempatan dan jadwal cabang pada Dashboard Karyawan.
 */
export function toPlacementDashboardDTO(placement, schedule) {
  if (!placement) return null;
  const isLibur = Boolean(schedule?.status_jadwal === "libur" || schedule?.is_libur);
  return {
    nama_cabang: placement.nama_cabang,
    kode_cabang: placement.kode_cabang,
    radius_meter: Number(placement.radius_meter) || 100,
    nama_jadwal: schedule?.nama_jadwal || `${placement.nama_cabang} Reguler`,
    jam_mulai: schedule?.jam_masuk || "10:00:00",
    toleransi_menit: schedule?.toleransi_menit ?? 10,
    status_jadwal: schedule?.status_jadwal || "kerja",
    is_libur: isLibur,
  };
}
