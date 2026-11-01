import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { Role } from "@prisma/client";
import { config } from "../config";
import { forbidden, unauthorized } from "../lib/errors";

export interface AuthUser {
  id: number;
  role: Role;
  employeeId: number | null;
  email: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(user: AuthUser): string {
  return jwt.sign(user, config.jwtSecret, { expiresIn: config.jwtExpiresIn as jwt.SignOptions["expiresIn"] });
}

function readToken(req: Request): string | null {
  const cookie = req.cookies?.[config.cookieName];
  if (cookie) return cookie;
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  return null;
}

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const token = readToken(req);
  if (!token) return next(unauthorized());
  try {
    const payload = jwt.verify(token, config.jwtSecret) as AuthUser;
    req.user = { id: payload.id, role: payload.role, employeeId: payload.employeeId, email: payload.email };
    next();
  } catch {
    next(unauthorized("Your session has expired, please sign in again"));
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  };
}

/** HR and Admin manage the workforce; only Admin changes company configuration. */
export const requireHR = requireRole("ADMIN", "HR");
export const requireAdmin = requireRole("ADMIN");

export function currentUser(req: Request): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}

export function currentEmployeeId(req: Request): number {
  const user = currentUser(req);
  if (!user.employeeId) throw forbidden("This account is not linked to an employee record");
  return user.employeeId;
}
