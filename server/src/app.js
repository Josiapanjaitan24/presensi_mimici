import express from "express";
import cors from "cors";
import { pool } from "./config/database.js";
import apiRoutes from "./routes/index.js";
import { securityHeaders } from "./middlewares/securityMiddleware.js";

const app = express();

app.disable("x-powered-by");
app.use(securityHeaders);

const allowedOrigins = Array.from(
  new Set([
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    ...(process.env.CLIENT_URL || "http://localhost:5173")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  ]),
);

app.use(
  cors({
    origin: allowedOrigins.length === 1 ? allowedOrigins[0] : allowedOrigins,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(express.json({ limit: "7mb" }));

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    res.status(200).json({
      success: true,
      message: "Backend dan database terhubung",
      status: "OK",
    });
  } catch (error) {
    console.error("Database connection error:", error.message);

    res.status(503).json({
      success: false,
      message: "Backend berjalan, tetapi database belum terhubung",
      status: "ERROR",
    });
  }
});

app.use("/api", apiRoutes);

app.use((error, req, res, next) => {
  console.error(
    "Unhandled API error:",
    error?.code ? `[${error.code}]` : "",
    error?.message || "Unknown error",
  );
  if (res.headersSent) return next(error);

  if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
    return res.status(400).json({
      success: false,
      message: "Format JSON tidak valid.",
    });
  }

  if (error?.type === "entity.too.large" || error?.status === 413) {
    return res.status(413).json({
      success: false,
      message: "Ukuran data melebihi batas maksimal.",
    });
  }

  if (error?.code === "23505") {
    return res.status(409).json({
      success: false,
      message: "Data sudah digunakan.",
    });
  }

  if (error?.code === "23503") {
    return res.status(409).json({
      success: false,
      message: "Data masih terkait dengan entitas lain.",
    });
  }

  if (
    error?.code === "22P02" ||
    error?.code === "22007" ||
    error?.code === "22008" ||
    error?.code === "23514"
  ) {
    return res.status(400).json({
      success: false,
      message: "Format data tidak valid.",
    });
  }

  return res.status(500).json({
    success: false,
    message: "Terjadi kesalahan pada server.",
  });
});

export default app;
