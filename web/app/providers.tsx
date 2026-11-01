"use client";

import { MotionConfig } from "motion/react";
import { useEffect } from "react";
import { ToastProvider } from "@/components/ui";
import { AuthProvider } from "@/lib/auth";
import { BrandingProvider, useBranding } from "@/lib/branding";
import { ThemeProvider, useTheme } from "@/lib/theme";

/** Applies the organisation's default theme for users who have not chosen their own. */
function OrgThemeSync() {
  const { branding, loaded } = useBranding();
  const { setOrgDefault } = useTheme();
  useEffect(() => {
    if (loaded) setOrgDefault(branding.defaultTheme);
  }, [loaded, branding.defaultTheme, setOrgDefault]);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <BrandingProvider>
      <ThemeProvider>
        <OrgThemeSync />
        {/* Respect the OS "reduce motion" setting for every animation */}
        <MotionConfig reducedMotion="user">
          <ToastProvider>
            <AuthProvider>{children}</AuthProvider>
          </ToastProvider>
        </MotionConfig>
      </ThemeProvider>
    </BrandingProvider>
  );
}
