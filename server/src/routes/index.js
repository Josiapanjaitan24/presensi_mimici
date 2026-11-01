
import { Router } from "express";
import authRoutes from "./authRoutes.js";
import employeeRoutes from "./employeeRoutes.js";
import adminRoutes from "./adminRoutes.js";

const router = Router();

router.use("/auth", authRoutes);
router.use("/employee", employeeRoutes);
router.use("/admin", adminRoutes);

export default router;
