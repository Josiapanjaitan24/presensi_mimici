import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import jwt from "jsonwebtoken";
import app from "../app.js";
import { pool } from "../config/database.js";
import { loginRateLimiter } from "../routes/authRoutes.js";
import {
  calculateLateDeduction,
  calculateLateMinutes,
  haversineDistance,
  isAttendanceOpen,
  isValidBase64Image,
  isValidCoordinate,
  isValidDateString,
  isValidEmail,
  isValidPositiveId,
  isValidTimeString,
  parsePositiveIdArray,
  sanitizeDaysOff,
  sanitizeFilename,
} from "./business.js";
import {
  toAdminAccountDTO,
  toAuthUserDTO,
  toEmployeeDashboardDTO,
  toPlacementDashboardDTO,
} from "./http.js";
import { isTokenRevoked, revokeToken } from "../middlewares/authMiddleware.js";
import {
  createRateLimiter,
  securityHeaders,
} from "../middlewares/securityMiddleware.js";

test("menghitung jarak GPS dengan haversine", () => {
  const distance = haversineDistance(-6.595, 106.8, -6.595, 106.801);
  assert.ok(distance > 100 && distance < 120);
});

test("keterlambatan menghormati toleransi sepuluh menit", () => {
  assert.equal(
    calculateLateMinutes(new Date("2026-10-18T03:10:00Z"), "10:00", 10),
    0,
  );
  assert.equal(
    calculateLateMinutes(new Date("2026-10-18T03:15:00Z"), "10:00", 10),
    5,
  );
  assert.equal(calculateLateDeduction(5), 5000);
});

test("keterlambatan dihitung menurut waktu kerja Jakarta", () => {
  assert.equal(
    calculateLateMinutes(new Date("2026-10-18T03:15:00Z"), "09:00", 10),
    65,
  );
});

test("jam operasional presensi menolak pukul 00:01 s.d. 06:59 WIB", () => {
  // 2026-10-18T17:01:00Z = 2026-10-19 00:01:00 WIB (ditolak)
  assert.equal(isAttendanceOpen(new Date("2026-10-18T17:01:00Z")), false);
  // 2026-10-18T23:59:00Z = 2026-10-19 06:59:00 WIB (ditolak)
  assert.equal(isAttendanceOpen(new Date("2026-10-18T23:59:00Z")), false);
  // 2026-10-19T00:00:00Z = 2026-10-19 07:00:00 WIB (dibuka)
  assert.equal(isAttendanceOpen(new Date("2026-10-19T00:00:00Z")), true);
});

test("validasi input keamanan (ID, tanggal, jam, email, koordinat)", () => {
  assert.equal(isValidPositiveId("12"), true);
  assert.equal(isValidPositiveId(1), true);
  assert.equal(isValidPositiveId("0"), false);
  assert.equal(isValidPositiveId("-5"), false);
  assert.equal(isValidPositiveId("1; DROP TABLE pengguna"), false);

  assert.equal(isValidDateString("2026-10-29"), true);
  assert.equal(isValidDateString("2026-02-30"), false);
  assert.equal(isValidDateString("29-10-2026"), false);

  assert.equal(isValidTimeString("09:00"), true);
  assert.equal(isValidTimeString("22:00:00"), true);
  assert.equal(isValidTimeString("25:00"), false);

  assert.equal(isValidEmail("admin@mimici.com"), true);
  assert.equal(isValidEmail("bukan-email"), false);

  assert.equal(isValidCoordinate(-6.595, -90, 90), true);
  assert.equal(isValidCoordinate(95, -90, 90), false);

  assert.deepEqual(parsePositiveIdArray(["1", 5, "0", -2, "abc", "12"]), [1, 5, 12]);
  assert.deepEqual(parsePositiveIdArray(null), []);

  assert.deepEqual(sanitizeDaysOff(["Senin", "InvalidDay", "Minggu"]), ["Senin", "Minggu"]);
  assert.deepEqual(sanitizeDaysOff("bukan-array"), []);
});

test("validasi upload gambar base64 menolak SVG XSS dan menerima format aman", () => {
  const validJpeg = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/";
  const svgXss =
    "data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9ImFsZXJ0KDEpIj48L3N2Zz4=";
  const htmlPayload =
    "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==";

  assert.equal(isValidBase64Image(validJpeg), true);
  assert.equal(isValidBase64Image(svgXss), false);
  assert.equal(isValidBase64Image(htmlPayload), false);
});

test("sanitasi nama file mencegah path traversal dan karakter berbahaya", () => {
  assert.equal(
    sanitizeFilename("../../etc/passwd", "default.jpg"),
    "default.jpg",
  );
  assert.equal(
    sanitizeFilename("../../folder/bukti sakit.png", "default.jpg"),
    "bukti_sakit.png",
  );
  assert.equal(sanitizeFilename("", "surat_izin.jpg"), "surat_izin.jpg");
  assert.equal(
    sanitizeFilename("surat sakit 2026.png", "default.jpg"),
    "surat_sakit_2026.png",
  );
});

test("data minimization DTO menyaring field sensitif dari respons API", () => {
  const rawDbUser = {
    id_pengguna: 1,
    nama_pengguna: "mimici-bogor",
    email: "rahasia@mimici.com",
    kata_sandi_hash: "$2b$12$secretHashValue",
    peran: "admin",
    status_akun: "aktif",
  };

  const authDto = toAuthUserDTO(rawDbUser);
  assert.deepEqual(authDto, {
    nama_pengguna: "mimici-bogor",
    peran: "admin",
  });
  assert.equal("id_pengguna" in authDto, false);
  assert.equal("email" in authDto, false);
  assert.equal("status_akun" in authDto, false);
  assert.equal("kata_sandi_hash" in authDto, false);

  const adminDto = toAdminAccountDTO(rawDbUser);
  assert.deepEqual(adminDto, {
    nama_pengguna: "mimici-bogor",
    email: "rahasia@mimici.com",
    peran: "admin",
  });
  assert.equal("id_pengguna" in adminDto, false);
  assert.equal("kata_sandi_hash" in adminDto, false);

  const empDto = toEmployeeDashboardDTO({
    id_karyawan: 7,
    id_pengguna: 12,
    nip: "MMC001",
    nama_lengkap: "Budi Santoso",
    nomor_telepon: "08123456789",
    email: "budi@mimici.com",
    status_karyawan: "aktif",
  });
  assert.deepEqual(empDto, {
    nip: "MMC001",
    nama_lengkap: "Budi Santoso",
  });
  assert.equal("id_karyawan" in empDto, false);
  assert.equal("id_pengguna" in empDto, false);
  assert.equal("nomor_telepon" in empDto, false);
  assert.equal("email" in empDto, false);

  const placeDto = toPlacementDashboardDTO(
    {
      id_penempatan: 3,
      id_karyawan: 7,
      id_cabang: 2,
      nama_cabang: "Cabang Pakuan",
      kode_cabang: "PAKUAN",
      latitude: -6.59,
      longitude: 106.8,
      radius_meter: 100,
    },
    {
      id_jadwal: 99,
      nama_jadwal: "Pakuan Shift Pagi",
      jam_masuk: "09:00:00",
      toleransi_menit: 10,
      status_jadwal: "kerja",
      is_libur: false,
    },
  );
  assert.equal("id_penempatan" in placeDto, false);
  assert.equal("id_karyawan" in placeDto, false);
  assert.equal("id_cabang" in placeDto, false);
  assert.equal("id_jadwal" in placeDto, false);
  assert.equal(placeDto.nama_cabang, "Cabang Pakuan");
});

test("pencabutan token (token revocation) saat logout berfungsi dengan benar", () => {
  const sampleToken = jwt.sign(
    { id_pengguna: "1", peran: "admin" },
    "test-secret-key",
    { expiresIn: "1h", algorithm: "HS256" },
  );
  const decoded = jwt.decode(sampleToken);

  assert.equal(isTokenRevoked(sampleToken), false);
  revokeToken(sampleToken, decoded.exp);
  assert.equal(isTokenRevoked(sampleToken), true);
});

test("security headers dan rate limiter bekerja sesuai kebijakan keamanan", () => {
  const headers = {};
  const reqMock = { headers: { "x-forwarded-for": "203.0.113.55" } };
  let statusCode = 200;
  let jsonBody = null;

  const resMock = {
    setHeader(k, v) {
      headers[k] = v;
    },
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      jsonBody = payload;
      return this;
    },
  };

  let nextCalled = false;
  securityHeaders(reqMock, resMock, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
  assert.equal(headers["X-Content-Type-Options"], "nosniff");
  assert.equal(headers["X-Frame-Options"], "DENY");
  assert.ok(headers["Cache-Control"].includes("no-store"));
  assert.ok(
    headers["Content-Security-Policy"].includes("frame-ancestors 'none'"),
  );

  const limiter = createRateLimiter({
    windowMs: 60_000,
    max: 2,
    keyPrefix: "test-limit",
    message: "Terlalu banyak permintaan.",
  });

  let passCount = 0;
  limiter(reqMock, resMock, () => {
    passCount += 1;
  });
  limiter(reqMock, resMock, () => {
    passCount += 1;
  });
  limiter(reqMock, resMock, () => {
    passCount += 1;
  });

  assert.equal(passCount, 2);
  assert.equal(statusCode, 429);
  assert.equal(jsonBody?.success, false);
  assert.ok(Number(headers["Retry-After"]) > 0);
  limiter.reset();
});

test("integrasi API: autentikasi, RBAC, data minimization, validasi, dan logout", async () => {
  let dbConnected = false;
  try {
    await pool.query("SELECT 1");
    dbConnected = true;
  } catch {
    dbConnected = false;
  }

  if (!dbConnected) {
    // Jika dijalankan di dalam sandbox tanpa akses TCP lokal ke PostgreSQL, lewati bagian koneksi DB langsung
    return;
  }

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}/api`;

  try {
    // 1. Health Check & Security Headers
    const healthRes = await fetch(`${baseUrl}/health`);
    assert.equal(healthRes.status, 200);
    assert.equal(healthRes.headers.get("x-content-type-options"), "nosniff");
    assert.equal(healthRes.headers.get("x-frame-options"), "DENY");
    assert.equal(healthRes.headers.get("x-powered-by"), null);

    // 2. Malformed JSON -> 400
    const badJsonRes = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ invalid_json: ",
    });
    assert.equal(badJsonRes.status, 400);

    // 3. Login tidak valid -> 401
    const badLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identitas: "pengguna_tidak_terdaftar_999",
        kata_sandi: "salah123",
      }),
    });
    assert.equal(badLoginRes.status, 401);

    // 4. Verifikasi /api/auth/me Data Minimization & RBAC
    const adminRow = (
      await pool.query(
        "SELECT id_pengguna, nama_pengguna, peran FROM pengguna WHERE peran = 'admin' AND status_akun = 'aktif' LIMIT 1",
      )
    ).rows[0];
    assert.ok(adminRow);

    const adminToken = jwt.sign(
      { id_pengguna: adminRow.id_pengguna.toString(), peran: "admin" },
      process.env.JWT_SECRET,
      { expiresIn: "1h", algorithm: "HS256" },
    );

    const meRes = await fetch(`${baseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const meBody = await meRes.json();
    assert.equal(meRes.status, 200);
    assert.deepEqual(Object.keys(meBody.pengguna).sort(), [
      "nama_pengguna",
      "peran",
    ]);
    assert.equal("id_pengguna" in meBody.pengguna, false);
    assert.equal("email" in meBody.pengguna, false);
    assert.equal("status_akun" in meBody.pengguna, false);

    // 5. Akses tanpa token -> 401
    const noTokenRes = await fetch(`${baseUrl}/admin/summary`);
    assert.equal(noTokenRes.status, 401);

    // 6. Admin mengakses endpoint khusus karyawan -> 403
    const adminOnEmpRes = await fetch(`${baseUrl}/employee/dashboard`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(adminOnEmpRes.status, 403);

    // 7. Karyawan mengakses endpoint admin -> 403 & SVG XSS upload -> 400
    const empRow = (
      await pool.query(
        "SELECT u.id_pengguna FROM pengguna u JOIN karyawan k ON k.id_pengguna = u.id_pengguna WHERE u.peran = 'karyawan' AND u.status_akun = 'aktif' AND k.status_karyawan = 'aktif' LIMIT 1",
      )
    ).rows[0];
    if (empRow) {
      const empToken = jwt.sign(
        { id_pengguna: empRow.id_pengguna.toString(), peran: "karyawan" },
        process.env.JWT_SECRET,
        { expiresIn: "1h", algorithm: "HS256" },
      );

      const empOnAdminRes = await fetch(`${baseUrl}/admin/employees`, {
        headers: { Authorization: `Bearer ${empToken}` },
      });
      assert.equal(empOnAdminRes.status, 403);

      const empDashRes = await fetch(`${baseUrl}/employee/dashboard`, {
        headers: { Authorization: `Bearer ${empToken}` },
      });
      const empDashBody = await empDashRes.json();
      assert.equal(empDashRes.status, 200);
      assert.deepEqual(Object.keys(empDashBody.karyawan).sort(), [
        "nama_lengkap",
        "nip",
      ]);

      const svgUploadRes = await fetch(`${baseUrl}/employee/submissions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${empToken}`,
        },
        body: JSON.stringify({
          jenis: "izin",
          tanggal_mulai: "2026-10-29",
          tanggal_selesai: "2026-10-29",
          alasan: "Tes blokir SVG",
          foto_bukti:
            "data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9ImFsZXJ0KDEpIj48L3N2Zz4=",
        }),
      });
      assert.equal(svgUploadRes.status, 400);
    }

    // 8. Validasi parameter :id tidak valid -> 400
    const badIdRes = await fetch(
      `${baseUrl}/admin/employees/invalid-id/status`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ status_karyawan: "aktif" }),
      },
    );
    assert.equal(badIdRes.status, 400);

    // 9. Logout mencabut token sehingga tidak bisa digunakan kembali -> 401
    const logoutToken = jwt.sign(
      { id_pengguna: adminRow.id_pengguna.toString(), peran: "admin" },
      process.env.JWT_SECRET,
      { expiresIn: "1h", algorithm: "HS256" },
    );
    const logoutRes = await fetch(`${baseUrl}/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${logoutToken}` },
    });
    assert.equal(logoutRes.status, 200);

    const reuseRes = await fetch(`${baseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${logoutToken}` },
    });
    assert.equal(reuseRes.status, 401);
  } finally {
    loginRateLimiter.reset();
    server.close();
    await pool.end();
  }
});
