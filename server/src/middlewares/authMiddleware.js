
import jwt from "jsonwebtoken";
import { pool } from "../config/database.js";

export async function autentikasi(req, res, next) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ")
    ? header.slice(7)
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

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ["HS256"],
    });

    const result = await pool.query(
      "SELECT id_pengguna, peran, status_akun FROM pengguna WHERE id_pengguna = $1",
      [payload.id_pengguna],
    );
    const pengguna = result.rows[0];
    if (!pengguna || pengguna.status_akun !== "aktif" || pengguna.peran !== payload.peran) {
      return res.status(401).json({
        success: false,
        message: "Sesi tidak valid atau akun sudah tidak aktif.",
      });
    }

    req.pengguna = { ...payload, ...pengguna, id_pengguna: pengguna.id_pengguna.toString() };

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
