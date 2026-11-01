import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { config } from "./config";
import { errorHandler } from "./lib/errors";
import { attendanceRouter } from "./modules/attendance/attendance.routes";
import { deviceRouter } from "./modules/attendance/device.routes";
import { authRouter } from "./modules/auth/auth.routes";
import { employeesRouter } from "./modules/employees/employees.routes";
import { leaveRouter } from "./modules/leave/leave.routes";
import { payrollRouter } from "./modules/payroll/payroll.routes";
import { reportsRouter } from "./modules/reports/reports.routes";
import { brandingRouter, settingsRouter } from "./modules/settings/settings.routes";
import { prisma } from "./db";

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  app.use(express.json({ limit: "5mb" }));
  app.use(cookieParser());
  if (!config.isTest) app.use(morgan(config.isProduction ? "combined" : "dev"));

  app.get("/api/health", async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/device", deviceRouter);
  app.use("/api/employees", employeesRouter);
  app.use("/api/attendance", attendanceRouter);
  app.use("/api/leave", leaveRouter);
  app.use("/api/payroll", payrollRouter);
  app.use("/api/reports", reportsRouter);
  app.use("/api/branding", brandingRouter);
  app.use("/api/settings", settingsRouter);

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Endpoint not found" });
  });
  app.use(errorHandler);
  return app;
}
