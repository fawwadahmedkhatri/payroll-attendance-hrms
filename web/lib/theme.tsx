"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type ThemePreference = "light" | "dark" | "system";
const STORAGE_KEY = "hrms-theme";

/**
 * Runs before React hydrates (inlined in <head>) so the page never flashes the wrong theme.
 * Keep in sync with applyTheme below.
 */
export const themeInitScript = `(function(){try{var o=JSON.parse(localStorage.getItem("hrms-branding")||"{}");var p=localStorage.getItem("${STORAGE_KEY}")||o.defaultTheme||"system";var d=p==="dark"||(p==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.classList.toggle("dark",d);r.dataset.theme=d?"dark":"light";}catch(e){}})();`;

function systemPrefersDark() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyTheme(preference: ThemePreference): "light" | "dark" {
  const resolved = preference === "system" ? (systemPrefersDark() ? "dark" : "light") : preference;
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.dataset.theme = resolved;
  return resolved;
}

interface ThemeState {
  preference: ThemePreference;
  resolved: "light" | "dark";
  setPreference: (p: ThemePreference) => void;
  /** The organisation's default — used until the user picks their own theme */
  setOrgDefault: (p: ThemePreference) => void;
}

function ownPreference(): ThemePreference | null {
  try {
    return localStorage.getItem(STORAGE_KEY) as ThemePreference | null;
  } catch {
    return null;
  }
}

const ThemeContext = createContext<ThemeState | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPref] = useState<ThemePreference>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("light");

  useEffect(() => {
    let stored: ThemePreference = "system";
    try {
      const org = JSON.parse(localStorage.getItem("hrms-branding") ?? "{}").defaultTheme as ThemePreference | undefined;
      stored = ownPreference() ?? org ?? "system";
    } catch {
      /* storage unavailable — fall back to system */
    }
    setPref(stored);
    setResolved(applyTheme(stored));
  }, []);

  const setOrgDefault = useCallback((p: ThemePreference) => {
    if (ownPreference()) return;
    setPref(p);
    setResolved(applyTheme(p));
  }, []);

  // Follow OS changes while in "system" mode
  useEffect(() => {
    if (preference !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setResolved(applyTheme("system"));
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [preference]);

  const setPreference = useCallback((p: ThemePreference) => {
    setPref(p);
    try {
      localStorage.setItem(STORAGE_KEY, p);
    } catch {
      /* ignore */
    }
    // Smooth cross-fade where the View Transitions API exists
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    const run = () => setResolved(applyTheme(p));
    if (doc.startViewTransition && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) doc.startViewTransition(run);
    else run();
  }, []);

  return <ThemeContext.Provider value={{ preference, resolved, setPreference, setOrgDefault }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
