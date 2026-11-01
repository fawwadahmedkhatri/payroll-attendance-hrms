"use client";

import { ArrowRight, CheckCircle2, Fingerprint, Lock, Mail } from "lucide-react";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type PointerEvent } from "react";
import { BrandMark } from "@/components/BrandMark";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useBranding } from "@/lib/branding";

export default function LoginPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const { branding } = useBranding();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api<{ user: { role: string } }>("/auth/login", { body: { email, password } });
      refresh();
      router.replace(res.user.role === "EMPLOYEE" ? "/me" : "/dashboard");
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  }

  return (
    <main className="app-canvas grid min-h-screen lg:grid-cols-[1.15fr_1fr]">
      <Showcase />

      <section className="relative flex items-center justify-center p-6 sm:p-10">
        <ThemeToggle className="absolute right-5 top-5" />
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-sm"
        >
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <BrandMark size={40} />
            <span className="text-lg font-semibold text-slate-900">{branding.companyName || branding.productName}</span>
          </div>

          <h2 className="text-3xl font-semibold tracking-tight text-slate-900">Welcome back</h2>
          <p className="mt-2 text-sm text-slate-500">Sign in to continue. HR, admins and employees use the same page.</p>

          <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-600">Email</span>
              <span className="relative block">
                <Mail className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <input
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  className="h-11 w-full rounded-xl border border-line bg-surface pl-10 pr-3 text-sm text-slate-900 shadow-[inset_0_1px_2px_oklch(0_0_0/0.04)] outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
                  placeholder="you@company.com"
                />
              </span>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-600">Password</span>
              <span className="relative block">
                <Lock className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-11 w-full rounded-xl border border-line bg-surface pl-10 pr-3 text-sm text-slate-900 shadow-[inset_0_1px_2px_oklch(0_0_0/0.04)] outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
                  placeholder="••••••••"
                />
              </span>
            </label>

            {error && (
              <motion.p initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: [0, -6, 6, -3, 0] }} transition={{ duration: 0.35 }} className="rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-700" role="alert">
                {error}
              </motion.p>
            )}

            <Button type="submit" className="h-11 w-full text-[15px]" loading={loading}>
              Sign in {!loading && <ArrowRight className="h-4 w-4" />}
            </Button>
          </form>
          <p className="mt-6 text-center text-xs text-slate-400">Demo accounts are listed in the project README.</p>
        </motion.div>
      </section>
    </main>
  );
}

/**
 * Left panel: always-dark stage with a 3D scene of floating product cards.
 * The scene tilts with the pointer (springs) and each card floats at its own depth.
 */
function Showcase() {
  const reduce = useReducedMotion();
  const { branding } = useBranding();
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rotateY = useSpring(useTransform(mx, [-0.5, 0.5], [-26, -8]), { stiffness: 120, damping: 18 });
  const rotateX = useSpring(useTransform(my, [-0.5, 0.5], [22, 8]), { stiffness: 120, damping: 18 });

  function onMove(e: PointerEvent<HTMLElement>) {
    if (reduce) return;
    const r = e.currentTarget.getBoundingClientRect();
    mx.set((e.clientX - r.left) / r.width - 0.5);
    my.set((e.clientY - r.top) / r.height - 0.5);
  }

  return (
    <section
      onPointerMove={onMove}
      onPointerLeave={() => (mx.set(0), my.set(0))}
      className="relative hidden overflow-hidden bg-[oklch(0.17_0.025_264)] text-white lg:flex lg:flex-col"
    >
      {/* lighting + subtle grid */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(700px 420px at 75% 30%, color-mix(in oklab, var(--brand) 38%, transparent), transparent 70%), radial-gradient(520px 360px at 15% 85%, color-mix(in oklab, var(--brand-glow) 22%, transparent), transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "radial-gradient(ellipse at 60% 40%, black 30%, transparent 75%)",
        }}
      />

      <div className="relative z-10 flex items-center gap-2.5 p-10">
        <BrandMark size={40} onDark />
        <div>
          <p className="text-lg font-semibold leading-tight">{branding.companyName || branding.productName}</p>
          {branding.companyName && <p className="text-xs text-white/60">{branding.productName}</p>}
        </div>
      </div>

      <div className="relative z-10 flex flex-1 items-center justify-center" style={{ perspective: 1400 }}>
        <motion.div className="relative h-[380px] w-[440px]" style={{ rotateX, rotateY, transformStyle: "preserve-3d" }} initial={{ rotateX: 18, rotateY: -18 }}>
          {/* Attendance ring */}
          <GlassCard className="left-0 top-6 w-72" z={40} delay={0}>
            <p className="text-xs font-medium text-white/60">Present today</p>
            <div className="mt-3 flex items-center gap-4">
              <svg width="76" height="76" className="-rotate-90">
                <circle cx="38" cy="38" r="31" fill="none" stroke="oklch(1 0 0 / 0.12)" strokeWidth="8" />
                <circle
                  cx="38"
                  cy="38"
                  r="31"
                  fill="none"
                  stroke="var(--brand-glow)"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 31}
                  strokeDashoffset={2 * Math.PI * 31 * 0.08}
                  style={{ filter: "drop-shadow(0 0 6px var(--brand-glow))" }}
                />
              </svg>
              <div>
                <p className="text-3xl font-semibold tabular">92%</p>
                <p className="text-xs text-white/60">446 of 485 staff</p>
              </div>
            </div>
          </GlassCard>

          {/* Payslip */}
          <GlassCard className="right-0 top-0 w-56" z={90} delay={1.2}>
            <p className="text-xs font-medium text-white/60">Payslip · October</p>
            <p className="mt-2 text-2xl font-semibold tabular">₹1,36,673</p>
            <div className="mt-3 space-y-1.5 text-[11px] text-white/70">
              {[
                ["Gross earnings", "1,72,600"],
                ["Loss of pay", "−8,550"],
                ["Late deduction", "−2,850"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span>{k}</span>
                  <span className="tabular">{v}</span>
                </div>
              ))}
            </div>
          </GlassCard>

          {/* Biometric scan */}
          <GlassCard className="bottom-0 left-16 w-72" z={140} delay={2.2}>
            <div className="flex items-center gap-3">
              <div className="relative grid h-14 w-14 place-items-center overflow-hidden rounded-xl bg-white/10 ring-1 ring-white/15">
                <Fingerprint className="h-8 w-8 text-[var(--brand-glow)]" />
                <span aria-hidden className="absolute inset-x-1 h-0.5 animate-scan rounded-full bg-[var(--brand-glow)] shadow-[0_0_12px_var(--brand-glow)]" />
              </div>
              <div>
                <p className="text-sm font-semibold">Punch recorded</p>
                <p className="text-xs text-white/60">BIO1003 · 09:28 · on time</p>
              </div>
            </div>
          </GlassCard>

          {/* Notification */}
          <GlassCard className="bottom-20 right-[-28px] w-48" z={190} delay={3}>
            <div className="flex items-center gap-2 text-xs">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span>Leave approved</span>
            </div>
          </GlassCard>
        </motion.div>
      </div>

      <div className="relative z-10 p-10">
        <h1 className="max-w-md text-3xl font-semibold leading-tight tracking-tight">Attendance, leave and payroll that run themselves.</h1>
        <p className="mt-3 max-w-md text-sm text-white/60">Biometric punches flow in, late marks and leave are applied, and payslips are ready at month end — with rules you configure for any country.</p>
      </div>
    </section>
  );
}

function GlassCard({ children, className, z, delay }: { children: React.ReactNode; className: string; z: number; delay: number }) {
  return (
    <div className={`absolute ${className}`} style={{ transform: `translateZ(${z}px)`, transformStyle: "preserve-3d" }}>
      <div
        className="animate-float rounded-2xl border border-white/15 bg-white/[0.07] p-4 shadow-[inset_0_1px_0_oklch(1_0_0/0.15),0_30px_60px_-20px_oklch(0_0_0/0.6)] backdrop-blur-xl"
        style={{ animationDelay: `-${delay}s` }}
      >
        {children}
      </div>
    </div>
  );
}
