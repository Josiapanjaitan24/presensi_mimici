
import jwt from "jsonwebtoken";

export function autentikasi(req, res, next) {
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
    req.pengguna = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ["HS256"],
    });

    next();
  } catch {
    return res.status(401).json({
      success: false,
      message: "Token tidak valid atau sudah kedaluwarsa.",
    });
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