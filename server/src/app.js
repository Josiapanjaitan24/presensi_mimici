
import express from "express";
import cors from "cors";
import { pool } from "./config/database.js";
import apiRoutes from "./routes/index.js";

const app = express();

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
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
  console.error("Unhandled API error:", error);
  if (res.headersSent) return next(error);
  res.status(error.code === "23505" ? 409 : 500).json({
    success: false,
    message: error.code === "23505" ? "Data sudah digunakan." : "Terjadi kesalahan pada server.",
  });
});

export default app;
