
import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { pool } from "../config/database.js";
import { autentikasi } from "../middlewares/authMiddleware.js";

const router = Router();

router.post("/login", async (req, res) => {
  try {
    const { identitas, kata_sandi } = req.body ?? {};

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

    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET belum dikonfigurasi.");
      return res.status(500).json({
        success: false,
        message: "Konfigurasi autentikasi belum tersedia.",
      });
    }

    const result = await pool.query(
      `SELECT id_pengguna, nama_pengguna, email,
              kata_sandi_hash, peran, status_akun
       FROM pengguna
       WHERE LOWER(nama_pengguna) = LOWER($1)
          OR LOWER(email) = LOWER($1)
       LIMIT 1`,
      [identitas.trim()],
    );

    const pengguna = result.rows[0];

    if (!pengguna) {
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

    const cocok = await bcrypt.compare(
      kata_sandi,
      pengguna.kata_sandi_hash,
    );

    if (!cocok) {
      return res.status(401).json({
        success: false,
        message: "Identitas atau kata sandi salah.",
      });
    }

    const token = jwt.sign(
      {
        id_pengguna: pengguna.id_pengguna.toString(),
        peran: pengguna.peran,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRES_IN || "8h",
        algorithm: "HS256",
      },
    );

    return res.status(200).json({
      success: true,
      message: "Login berhasil.",
      token,
      pengguna: {
        id_pengguna: pengguna.id_pengguna.toString(),
        nama_pengguna: pengguna.nama_pengguna,
        email: pengguna.email,
        peran: pengguna.peran,
      },
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
    const result = await pool.query(
      `SELECT id_pengguna, nama_pengguna, email, peran, status_akun
       FROM pengguna
       WHERE id_pengguna = $1`,
      [req.pengguna.id_pengguna],
    );

    const pengguna = result.rows[0];

    if (!pengguna || pengguna.status_akun !== "aktif") {
      return res.status(401).json({
        success: false,
        message: "Akun tidak ditemukan atau tidak aktif.",
      });
    }

    return res.status(200).json({
      success: true,
      pengguna: {
        ...pengguna,
        id_pengguna: pengguna.id_pengguna.toString(),
      },
    });
  } catch (error) {
    console.error("Get profile error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Gagal mengambil profil pengguna.",
    });
  }
});

export default router;