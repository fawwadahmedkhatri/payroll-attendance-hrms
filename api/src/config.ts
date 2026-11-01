import fs from "node:fs";
import path from "node:path";

const envFile = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: "12h",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
  isProduction: process.env.NODE_ENV === "production",
  isTest: process.env.NODE_ENV === "test",
  cookieName: "hrms_token",
};
