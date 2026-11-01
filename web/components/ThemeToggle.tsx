"use client";

import clsx from "clsx";
import { Monitor, Moon, Sun } from "lucide-react";
import { motion } from "motion/react";
import { useId } from "react";
import { useTheme, type ThemePreference } from "@/lib/theme";

const OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

/** Segmented Light / Dark / System switch with a sliding thumb. */
export function ThemeToggle({ className }: { className?: string }) {
  const { preference, setPreference } = useTheme();
  const group = useId();
  return (
    <div role="radiogroup" aria-label="Colour theme" className={clsx("inline-flex rounded-xl border border-line bg-surface-2 p-0.5", className)}>
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = preference === value;
        return (
          <button
            key={value}
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setPreference(value)}
            className={clsx("relative grid h-7 w-8 place-items-center rounded-[10px] transition-colors", active ? "text-slate-900" : "text-slate-500 hover:text-slate-800")}
          >
            {active && (
              <motion.span
                layoutId={`theme-${group}`}
                className="absolute inset-0 rounded-[10px] bg-surface shadow-[0_1px_2px_oklch(0_0_0/0.12),inset_0_1px_0_oklch(1_0_0/0.08)] ring-1 ring-line"
                transition={{ type: "spring", stiffness: 500, damping: 36 }}
              />
            )}
            <Icon className="relative h-3.5 w-3.5" />
          </button>
        );
      })}
    </div>
  );
}
