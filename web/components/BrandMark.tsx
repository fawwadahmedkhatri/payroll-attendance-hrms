"use client";

import clsx from "clsx";
import { Fingerprint } from "lucide-react";
import { useBranding } from "@/lib/branding";

/** The organisation's logo, or a brand-coloured fingerprint tile when no logo is uploaded. */
export function BrandMark({ size = 36, className, onDark }: { size?: number; className?: string; onDark?: boolean }) {
  const { branding } = useBranding();
  if (branding.logoDataUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={branding.logoDataUrl}
        alt={`${branding.companyName || branding.productName} logo`}
        width={size}
        height={size}
        className={clsx("shrink-0 rounded-xl object-contain", onDark ? "bg-white/90 p-1" : "bg-surface p-0.5 ring-1 ring-line", className)}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className={clsx(
        "grid shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-[var(--brand-fg)] shadow-[inset_0_1px_0_oklch(1_0_0/0.3),0_8px_18px_-8px_color-mix(in_oklab,var(--brand)_80%,transparent)]",
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <Fingerprint style={{ width: size * 0.55, height: size * 0.55 }} />
    </span>
  );
}
