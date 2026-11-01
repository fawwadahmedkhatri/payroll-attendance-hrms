import bcrypt from "bcryptjs";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { config } from "../../config";
import { prisma } from "../../db";
import { badRequest, unauthorized } from "../../lib/errors";
import { authenticate, currentUser, signToken } from "../../middleware/auth";

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.isTest ? 1000 : 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please try again in a few minutes." },
});

const loginSchema = z.object({
  email: z.string().email().transform((e) => e.toLowerCase()),
  password: z.string().min(1),
});

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  // Enable when served over HTTPS (e.g. behind a TLS ingress); local Docker/K8s use plain HTTP
  secure: process.env.COOKIE_SECURE === "true",
  maxAge: 12 * 60 * 60 * 1000,
  path: "/",
};

authRouter.post("/login", loginLimiter, async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email }, include: { employee: true } });
  const valid = user && user.isActive && (await bcrypt.compare(password, user.passwordHash));
  if (!user || !valid) throw unauthorized("Invalid email or password");
  if (user.employee && user.employee.status !== "ACTIVE") throw unauthorized("This employee account is deactivated");

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  const token = signToken({ id: user.id, role: user.role, employeeId: user.employeeId, email: user.email });
  res.cookie(config.cookieName, token, cookieOptions);
  res.json({ token, user: { id: user.id, email: user.email, role: user.role, employeeId: user.employeeId } });
});

authRouter.post("/logout", (_req, res) => {
  res.clearCookie(config.cookieName, { path: "/" });
  res.status(204).end();
});

authRouter.get("/me", authenticate, async (req, res) => {
  const { id } = currentUser(req);
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      role: true,
      employee: {
        select: {
          id: true,
          employeeCode: true,
          firstName: true,
          lastName: true,
          department: { select: { name: true } },
          designation: { select: { title: true } },
        },
      },
    },
  });
  if (!user) throw unauthorized();
  const company = await prisma.companySettings.findUnique({
    where: { id: 1 },
    select: { companyName: true, currencyCode: true, currencySymbol: true, timezone: true },
  });
  res.json({ ...user, company });
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Za-z]/, "Password must contain a letter")
    .regex(/\d/, "Password must contain a number"),
});

authRouter.post("/change-password", authenticate, async (req, res) => {
  const { currentPassword, newPassword } = passwordSchema.parse(req.body);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: currentUser(req).id } });
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) throw badRequest("Current password is incorrect");
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(newPassword, 10) } });
  res.status(204).end();
});
