import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { pool } from "../config/database.js";
import { isValidPositiveId } from "../utils/business.js";

const revokedTokens = new Map();
const MAX_REVOKED_TOKENS = 5000;

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function cleanupRevokedTokens(nowMs = Date.now()) {
  if (revokedTokens.size === 0) return;
  for (const [digest, expiresAtMs] of revokedTokens.entries()) {
    if (nowMs >= expiresAtMs) {
      revokedTokens.delete(digest);
    }
  }
  while (revokedTokens.size >= MAX_REVOKED_TOKENS) {
    const oldestKey = revokedTokens.keys().next().value;
    if (!oldestKey) break;
    revokedTokens.delete(oldestKey);
  }
}

export function signSessionToken(pengguna) {
  return jwt.sign(
    {
      id_pengguna: pengguna.id_pengguna.toString(),
      peran: pengguna.peran,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "1h",
      algorithm: "HS256",
    },
  );
}

export function revokeToken(token, expSeconds) {
  if (!token) return;
  const nowMs = Date.now();
  cleanupRevokedTokens(nowMs);
  const expiresAtMs = Number.isFinite(Number(expSeconds))
    ? Number(expSeconds) * 1000
    : nowMs + 60 * 60 * 1000;
  revokedTokens.set(hashToken(token), expiresAtMs);
}

export function isTokenRevoked(token) {
  if (!token) return false;
  cleanupRevokedTokens();
  const digest = hashToken(token);
  const expiresAtMs = revokedTokens.get(digest);
  if (!expiresAtMs) return false;
  if (Date.now() >= expiresAtMs) {
    revokedTokens.delete(digest);
    return false;
  }
  return true;
}

export async function autentikasi(req, res, next) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ")
    ? header.slice(7).trim()
    : null;

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Token autentikasi diperlukan.",
    });
  }

  if (!process.env.JWT_SECRET) {
    return res.status(500).json({
      success: false,
      message: "Konfigurasi autentikasi belum tersedia.",
    });
  }

  if (isTokenRevoked(token)) {
    return res.status(401).json({
      success: false,
      message: "Sesi login Anda telah berakhir (60 menit). Silakan login kembali.",
    });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ["HS256"],
    });

    if (!isValidPositiveId(payload?.id_pengguna)) {
      return res.status(401).json({
        success: false,
        message: "Sesi tidak valid atau akun sudah tidak aktif.",
      });
    }

    const result = await pool.query(
      "SELECT id_pengguna, nama_pengguna, peran, status_akun FROM pengguna WHERE id_pengguna = $1",
      [payload.id_pengguna],
    );
    const pengguna = result.rows[0];
    if (!pengguna || pengguna.status_akun !== "aktif" || pengguna.peran !== payload.peran) {
      return res.status(401).json({
        success: false,
        message: "Sesi tidak valid atau akun sudah tidak aktif.",
      });
    }

    req.token = token;
    req.pengguna = {
      id_pengguna: pengguna.id_pengguna.toString(),
      nama_pengguna: pengguna.nama_pengguna,
      peran: pengguna.peran,
      status_akun: pengguna.status_akun,
      exp: payload.exp,
    };

    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Sesi login Anda telah berakhir (60 menit). Silakan login kembali.",
      });
    }
    return next(error);
  }
}

export function hanyaPeran(...peranDiizinkan) {
  return (req, res, next) => {
    if (
      !req.pengguna ||
      !peranDiizinkan.includes(req.pengguna.peran)
    ) {
      return res.status(403).json({
        success: false,
        message: "Anda tidak memiliki akses.",
      });
    }

    next();
  };
}

export const hanyaAdmin = hanyaPeran("admin");
export const hanyaKaryawan = hanyaPeran("karyawan");
