"use client";

import clsx from "clsx";
import { animate, useInView, useReducedMotion } from "motion/react";
import { useEffect, useId, useRef, useState, type PointerEvent, type ReactNode } from "react";

/**
 * 3D tilt: the card leans toward the pointer and a soft light sheen follows it.
 * Pure CSS transforms driven by custom properties — cheap, and disabled for reduced motion.
 */
export function Tilt({ children, className, max = 8 }: { children: ReactNode; className?: string; max?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  function onMove(e: PointerEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el || reduce || e.pointerType === "touch") return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    el.style.setProperty("--rx", `${(0.5 - py) * max}deg`);
    el.style.setProperty("--ry", `${(px - 0.5) * max}deg`);
    el.style.setProperty("--mx", `${px * 100}%`);
    el.style.setProperty("--my", `${py * 100}%`);
  }

  function onLeave() {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
  }

  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className={clsx("group/tilt relative [transform-style:preserve-3d] transition-transform duration-300 ease-out will-change-transform", className)}
      style={{ transform: "perspective(900px) rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg))" }}
    >
      {children}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover/tilt:opacity-100"
        style={{ background: "radial-gradient(420px circle at var(--mx, 50%) var(--my, 50%), oklch(1 0 0 / 0.14), transparent 45%)" }}
      />
    </div>
  );
}

/** Counts up to a number the first time it scrolls into view. */
export function AnimatedNumber({ value, format = (n) => Math.round(n).toLocaleString() }: { value: number; format?: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(() => format(reduce ? value : 0));
  const from = useRef(0);

  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      setDisplay(format(value));
      return;
    }
    const controls = animate(from.current, value, {
      duration: 0.9,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(format(v)),
    });
    from.current = value;
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, inView, reduce]);

  return (
    <span ref={ref} className="tabular">
      {display}
    </span>
  );
}

/** Circular progress ring with a soft glow — used for "present today" and the login scene. */
export function Ring({
  value,
  size = 120,
  stroke = 10,
  label,
  sublabel,
}: {
  value: number;
  size?: number;
  stroke?: number;
  label?: ReactNode;
  sublabel?: ReactNode;
}) {
  const id = useId().replace(/:/g, "");
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value));
  const [offset, setOffset] = useState(c);
  useEffect(() => {
    const t = setTimeout(() => setOffset(c * (1 - pct)), 60);
    return () => clearTimeout(t);
  }, [c, pct]);
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--brand-glow)" />
            <stop offset="100%" stopColor="var(--brand)" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-slate-100)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{
            transition: "stroke-dashoffset 1.1s cubic-bezier(0.22,1,0.36,1)",
            filter: "drop-shadow(0 0 6px color-mix(in oklab, var(--brand) 45%, transparent))",
          }}
        />
      </svg>
      <div className="absolute text-center">
        <div className="text-xl font-semibold text-slate-900">{label}</div>
        {sublabel && <div className="text-[11px] text-slate-500">{sublabel}</div>}
      </div>
    </div>
  );
}
