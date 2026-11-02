import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { pool } from "../config/database.js";
import { autentikasi, revokeToken } from "../middlewares/authMiddleware.js";
import { createRateLimiter } from "../middlewares/securityMiddleware.js";
import { toAuthUserDTO } from "../utils/http.js";

const router = Router();

const DUMMY_PASSWORD_HASH = bcrypt.hashSync(
  "mimici_timing_safe_placeholder_password",
  10,
);

export const loginRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 15,
  keyPrefix: "auth-login",
  message:
    "Terlalu banyak percobaan login. Silakan coba lagi beberapa saat.",
});

router.post("/login", loginRateLimiter, async (req, res) => {
  try {
    const { identitas, kata_sandi, peran } = req.body ?? {};

    if (
      typeof identitas !== "string" ||
      typeof kata_sandi !== "string" ||
      !identitas.trim() ||
      !kata_sandi
    ) {
      return res.status(400).json({
        success: false,
        message: "Username/email dan kata sandi wajib diisi.",
      });
    }

    if (peran !== undefined && !["admin", "karyawan"].includes(peran)) {
      return res
        .status(400)
        .json({ success: false, message: "Peran login tidak valid." });
    }

    const trimmedIdentity = identitas.trim();
    if (trimmedIdentity.length > 150 || kata_sandi.length > 200) {
      return res.status(401).json({
        success: false,
        message: "Identitas atau kata sandi salah.",
      });
    }

    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET belum dikonfigurasi.");
      return res.status(500).json({
        success: false,
        message: "Konfigurasi autentikasi belum tersedia.",
      });
    }

    const result = await pool.query(
      `SELECT u.id_pengguna, u.nama_pengguna,
              u.kata_sandi_hash, u.peran, u.status_akun
       FROM pengguna u
       LEFT JOIN karyawan k ON k.id_pengguna = u.id_pengguna
       WHERE (LOWER(u.nama_pengguna) = LOWER($1)
          OR LOWER(u.email) = LOWER($1)
          OR LOWER(k.nomor_induk) = LOWER($1))
          AND ($2::text IS NULL OR u.peran = $2)
       LIMIT 1`,
      [trimmedIdentity, peran || null],
    );

    const pengguna = result.rows[0];
    const hashTarget = pengguna?.kata_sandi_hash || DUMMY_PASSWORD_HASH;
    const cocok = await bcrypt.compare(kata_sandi, hashTarget);

    if (!pengguna || !cocok) {
      return res.status(401).json({
        success: false,
        message: "Identitas atau kata sandi salah.",
      });
    }

    if (pengguna.status_akun !== "aktif") {
      return res.status(403).json({
        success: false,
        message: "Akun tidak aktif. Hubungi admin.",
      });
    }

    const token = jwt.sign(
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

    return res.status(200).json({
      success: true,
      message: "Login berhasil.",
      token,
      pengguna: toAuthUserDTO(pengguna),
    });
  } catch (error) {
    console.error("Login error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan pada server.",
    });
  }
});

router.get("/me", autentikasi, async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      pengguna: toAuthUserDTO(req.pengguna),
    });
  } catch (error) {
    console.error("Get profile error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Gagal mengambil profil pengguna.",
    });
  }
});

router.post("/refresh", autentikasi, async (req, res) => {
  try {
    const pengguna = req.pengguna;

    const token = jwt.sign(
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

    return res.status(200).json({
      success: true,
      message: "Sesi berhasil diperpanjang.",
      token,
      pengguna: toAuthUserDTO(pengguna),
    });
  } catch (error) {
    console.error("Refresh token error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Gagal memperpanjang sesi.",
    });
  }
});

router.post("/logout", autentikasi, (req, res) => {
  revokeToken(req.token, req.pengguna?.exp);
  return res.status(200).json({
    success: true,
    message: "Logout berhasil.",
  });
});

export default router;
