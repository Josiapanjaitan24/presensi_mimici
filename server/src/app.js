
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

app.use(express.json());

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

export default app;