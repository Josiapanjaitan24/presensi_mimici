const isLocalhost =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1");

export const API_URL =
  import.meta.env.VITE_API_URL ||
  (isLocalhost
    ? "http://localhost:5001/api"
    : "https://presensi-mimici.vercel.app/api");

let isRefreshing = false;
let lastRefreshTime = Date.now();

export function getStoredToken(role) {
  const currentPath =
    typeof window !== "undefined" ? window.location.pathname : "";
  const isAdminContext =
    role === "admin" || (!role && currentPath.startsWith("/admin"));
  const isEmployeeContext =
    role === "karyawan" ||
    (!role && (currentPath === "/" || currentPath.startsWith("/karyawan")));

  if (isAdminContext) {
    return (
      localStorage.getItem("token_admin") ||
      localStorage.getItem("token") ||
      ""
    );
  }
  if (isEmployeeContext) {
    return (
      localStorage.getItem("token_karyawan") ||
      localStorage.getItem("token") ||
      ""
    );
  }
  return localStorage.getItem("token") || "";
}

function sanitizeStoredUser(pengguna, fallbackRole = "") {
  if (!pengguna || typeof pengguna !== "object") return null;
  return {
    nama_pengguna: pengguna.nama_pengguna || "",
    peran: pengguna.peran || fallbackRole || "",
  };
}

export function saveSessionToken(role, token, pengguna) {
  const safeUser = sanitizeStoredUser(pengguna, role);

  if (role === "admin") {
    localStorage.setItem("token_admin", token);
    if (safeUser)
      localStorage.setItem("pengguna_admin", JSON.stringify(safeUser));
  } else if (role === "karyawan") {
    localStorage.setItem("token_karyawan", token);
    if (safeUser)
      localStorage.setItem("pengguna_karyawan", JSON.stringify(safeUser));
  }
  localStorage.setItem("token", token);
  if (safeUser) localStorage.setItem("pengguna", JSON.stringify(safeUser));
  localStorage.setItem(
    "session_expires_at",
    String(Date.now() + 60 * 60 * 1000),
  ); // 60 menit
  lastRefreshTime = Date.now();
}

// Background session keep-alive (renews token up to 60 minutes when user is actively working)
async function maybeRefreshToken(token, role) {
  if (isRefreshing || !token) return;
  const now = Date.now();
  // Refresh if active and last refresh was > 15 minutes ago
  if (now - lastRefreshTime > 15 * 60 * 1000) {
    isRefreshing = true;
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.token) {
          saveSessionToken(role, data.token, data.pengguna);
        }
      }
    } catch {
      // Ignore background refresh errors; will retry on next user action
    } finally {
      isRefreshing = false;
    }
  }
}

async function request(path, options = {}) {
  let targetRole = "";
  if (path.startsWith("/admin")) {
    targetRole = "admin";
  } else if (path.startsWith("/employee")) {
    targetRole = "karyawan";
  } else {
    targetRole = window.location.pathname.startsWith("/admin")
      ? "admin"
      : "karyawan";
  }

  const token = getStoredToken(targetRole);

  // Trigger non-blocking keep-alive if user is active
  if (token && !path.startsWith("/auth/")) {
    maybeRefreshToken(token, targetRole);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  // 1. Handle Sesi Kedaluwarsa (401 Unauthorized - 60 Menit)
  if (response.status === 401) {
    if (targetRole === "admin") {
      localStorage.removeItem("token_admin");
      localStorage.removeItem("pengguna_admin");
    } else {
      localStorage.removeItem("token_karyawan");
      localStorage.removeItem("pengguna_karyawan");
    }
    localStorage.removeItem("token");
    localStorage.removeItem("pengguna");
    localStorage.removeItem("session_expires_at");

    window.dispatchEvent(
      new CustomEvent("session-expired", {
        detail: {
          role: targetRole,
          message:
            "Sesi login Anda telah berakhir (60 menit). Silakan login kembali.",
        },
      }),
    );

    throw new Error(
      "Sesi login Anda telah berakhir (60 menit). Silakan login kembali.",
    );
  }

  // 2. Handle Akses Ditolak (403 Forbidden - Mismatch peran)
  if (response.status === 403) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(
      errData.message ||
        "Akses ditolak. Sesi Anda tidak memiliki izin untuk tindakan ini.",
    );
  }

  // 3. Handle File Download (Laporan Excel)
  if (options.download) {
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(
        errData.message || "Gagal mengunduh laporan presensi dari server.",
      );
    }
    return response;
  }

  // 4. Handle Standard JSON Responses
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || "Permintaan gagal diproses.");
  }
  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) =>
    request(path, { method: "POST", body: JSON.stringify(body) }),
  patch: (path, body) =>
    request(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: (path) => request(path, { method: "DELETE" }),
  download: (path) => request(path, { download: true }),
};

export function logout(role) {
  const currentPath =
    typeof window !== "undefined" ? window.location.pathname : "";
  const isAdmin = role === "admin" || currentPath.startsWith("/admin");
  const token = getStoredToken(isAdmin ? "admin" : "karyawan");

  if (token) {
    fetch(`${API_URL}/auth/logout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      keepalive: true,
    }).catch(() => {});
  }

  if (isAdmin) {
    localStorage.removeItem("token_admin");
    localStorage.removeItem("pengguna_admin");
  } else {
    localStorage.removeItem("token_karyawan");
    localStorage.removeItem("pengguna_karyawan");
  }
  localStorage.removeItem("token");
  localStorage.removeItem("pengguna");
  localStorage.removeItem("session_expires_at");

  window.location.href = isAdmin ? "/admin" : "/";
}

export function formatDate(value) {
  if (!value) return "-";
  return new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString(
    "id-ID",
  );
}

export function formatDateTime(value) {
  return value
    ? new Date(value).toLocaleString("id-ID", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : "-";
}

export function money(value) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

export function getClockHandDegrees(currentTime = new Date()) {
  const seconds = currentTime.getSeconds();
  const minutes = currentTime.getMinutes();
  const hours = currentTime.getHours();

  return {
    seconds,
    minutes,
    hours,
    secDeg: seconds * 6,
    minDeg: minutes * 6 + seconds * 0.1,
    hourDeg: (hours % 12) * 30 + minutes * 0.5,
    tanggalHariIni: currentTime.toLocaleDateString("id-ID", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
    jamSekarang: currentTime.toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
  };
}
