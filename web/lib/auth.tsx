"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useApi } from "./api";

export type Role = "ADMIN" | "HR" | "EMPLOYEE";

export interface Me {
  id: number;
  email: string;
  role: Role;
  employee: {
    id: number;
    employeeCode: string;
    firstName: string;
    lastName: string;
    department: { name: string };
    designation: { title: string };
  } | null;
  company: { companyName: string; currencyCode: string; currencySymbol: string; timezone: string } | null;
}

interface AuthState {
  me: Me | undefined;
  loading: boolean;
  isHR: boolean;
  isAdmin: boolean;
  currency: string;
  refresh: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, isLoading, mutate } = useApi<Me>("/auth/me", { shouldRetryOnError: false });
  const value: AuthState = {
    me: data,
    loading: isLoading,
    isHR: data?.role === "ADMIN" || data?.role === "HR",
    isAdmin: data?.role === "ADMIN",
    currency: data?.company?.currencySymbol ?? "",
    refresh: () => void mutate(),
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
