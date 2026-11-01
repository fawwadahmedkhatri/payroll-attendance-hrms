"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useApi } from "./api";

/**
 * White-label branding. The organisation's colours, logo, name, default theme and corner
 * style are stored in company settings and applied as CSS variables on <html>, so every
 * screen re-themes without code changes.
 */

export interface Branding {
  companyName: string;
  productName: string;
  brandColor: string;
  accentColor: string;
  logoDataUrl: string | null;
  defaultTheme: "light" | "dark" | "system";
  cornerStyle: "sharp" | "soft" | "rounded";
}

export const DEFAULT_BRANDING: Branding = {
  companyName: "",
  productName: "PayTrack HRMS",
  brandColor: "#3a5ce0",
  accentColor: "#36b3e6",
  logoDataUrl: null,
  defaultTheme: "system",
  cornerStyle: "rounded",
};

export const BRANDING_CACHE_KEY = "hrms-branding";
const RADIUS_SCALE = { sharp: 0.35, soft: 0.65, rounded: 1 } as const;

/** WCAG relative luminance of a #RRGGBB colour. */
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Below this contrast with white, brand surfaces switch to dark text. */
export const MIN_WHITE_CONTRAST = 3.4;

/**
 * Text colour on top of the brand colour. White is kept for saturated brand colours
 * (it is what people expect on a coloured button) until its contrast drops below
 * MIN_WHITE_CONTRAST; pale brands (yellow, amber, light cyan) get near-black text.
 */
export function readableOn(hex: string) {
  return contrastWithWhite(hex) >= MIN_WHITE_CONTRAST ? "#ffffff" : "#0b1020";
}

/** Contrast ratio of a colour against white — used to warn admins about pale brand colours. */
export function contrastWithWhite(hex: string) {
  return 1.05 / (luminance(hex) + 0.05);
}

export function brandingVars(b: Branding): Record<string, string> {
  return {
    "--brand": b.brandColor,
    "--brand-glow": b.accentColor,
    "--brand-fg": readableOn(b.brandColor),
    "--radius-scale": String(RADIUS_SCALE[b.cornerStyle] ?? 1),
  };
}

function monogramFavicon(b: Branding) {
  const letter = (b.productName || b.companyName || "H").trim()[0]?.toUpperCase() ?? "H";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="${b.brandColor}"/><text x="32" y="44" font-family="Arial,sans-serif" font-size="34" font-weight="700" text-anchor="middle" fill="${readableOn(b.brandColor)}">${letter}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function brandingTitle(b: Branding) {
  return `${b.productName}${b.companyName ? ` · ${b.companyName}` : ""}`;
}

export function applyBranding(b: Branding) {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(brandingVars(b))) root.style.setProperty(k, v);
  document.title = brandingTitle(b);
  let icon = document.querySelector<HTMLLinkElement>("link[rel='icon']");
  if (!icon) {
    icon = document.createElement("link");
    icon.rel = "icon";
    document.head.appendChild(icon);
  }
  icon.href = b.logoDataUrl ?? monogramFavicon(b);
}

/**
 * Inlined in <head> before hydration: re-applies the last known branding from localStorage
 * so the app paints in the organisation's colours immediately (no flash of default blue).
 */
export const brandingInitScript = `(function(){try{var b=JSON.parse(localStorage.getItem("${BRANDING_CACHE_KEY}")||"null");if(!b)return;var r=document.documentElement.style;for(var k in b.vars)r.setProperty(k,b.vars[k]);if(b.title)document.title=b.title;}catch(e){}})();`;

interface BrandingState {
  branding: Branding;
  /** true once the server's branding has arrived (not just the defaults) */
  loaded: boolean;
  /** Temporarily apply unsaved branding (Settings live preview); pass null to revert */
  preview: (b: Branding | null) => void;
  refresh: () => Promise<unknown>;
}

const BrandingContext = createContext<BrandingState | null>(null);

export function BrandingProvider({ children }: { children: ReactNode }) {
  const { data, mutate } = useApi<Branding | null>("/branding", { revalidateOnFocus: true });
  const [previewing, setPreviewing] = useState<Branding | null>(null);
  const saved: Branding = { ...DEFAULT_BRANDING, ...(data ?? {}) };
  const active = previewing ?? saved;

  useEffect(() => {
    applyBranding(active);
    if (!previewing && data) {
      try {
        localStorage.setItem(BRANDING_CACHE_KEY, JSON.stringify({ vars: brandingVars(saved), defaultTheme: saved.defaultTheme, title: brandingTitle(saved) }));
      } catch {
        /* storage full or blocked — branding still applies for this page */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(active), data]);

  const preview = useCallback((b: Branding | null) => setPreviewing(b), []);

  return <BrandingContext.Provider value={{ branding: active, loaded: !!data, preview, refresh: () => mutate() }}>{children}</BrandingContext.Provider>;
}

export function useBranding() {
  const ctx = useContext(BrandingContext);
  if (!ctx) throw new Error("useBranding must be used inside BrandingProvider");
  return ctx;
}
