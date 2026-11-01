"use client";

import clsx from "clsx";
import { CheckCircle2, ChevronLeft, ChevronRight, Inbox, Loader2, X, XCircle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/format";
import { AnimatedNumber, Tilt } from "./motion";

// ───────────── Buttons & inputs ─────────────

type Variant = "primary" | "secondary" | "danger" | "ghost" | "success";

export function Button({
  variant = "primary",
  size = "md",
  loading,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md"; loading?: boolean }) {
  return (
    <button
      className={clsx(
        "relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium [&_svg]:shrink-0 transition-[background,box-shadow,transform,color] duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50",
        size === "sm" ? "h-8 px-3 text-xs" : "h-10 px-4 text-sm",
        variant === "primary" &&
          "bg-brand-600 text-[var(--brand-fg)] shadow-[inset_0_1px_0_oklch(1_0_0/0.25),0_1px_2px_oklch(0_0_0/0.15),0_6px_16px_-6px_color-mix(in_oklab,var(--brand)_65%,transparent)] hover:bg-brand-700 hover:shadow-[inset_0_1px_0_oklch(1_0_0/0.25),0_1px_2px_oklch(0_0_0/0.15),0_10px_24px_-8px_color-mix(in_oklab,var(--brand)_75%,transparent)] dark:hover:bg-brand-500",
        variant === "success" && "bg-emerald-600 text-white shadow-[inset_0_1px_0_oklch(1_0_0/0.25),0_6px_16px_-8px_oklch(0.6_0.15_160/0.7)] hover:bg-emerald-500",
        variant === "danger" && "bg-rose-600 text-white shadow-[inset_0_1px_0_oklch(1_0_0/0.25),0_6px_16px_-8px_oklch(0.6_0.2_20/0.7)] hover:bg-rose-500",
        variant === "secondary" && "border border-line bg-surface text-slate-700 shadow-[0_1px_2px_oklch(0_0_0/0.05)] hover:border-slate-300 hover:bg-surface-2",
        variant === "ghost" && "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

const inputClass =
  "rounded-xl border border-line bg-surface px-3 py-2 text-sm text-slate-900 shadow-[inset_0_1px_2px_oklch(0_0_0/0.04)] outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-500 focus:ring-4 focus:ring-brand-100 disabled:bg-slate-50 disabled:text-slate-500";

/** Full width unless the caller sets its own width (w-52, min-w-60, …). */
const width = (className?: string) => (/(^|\s)(w-|min-w-|max-w-|flex-1)/.test(className ?? "") ? "" : "w-full");

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={clsx(inputClass, width(className), "h-10", className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={clsx(inputClass, width(className), className)} rows={3} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={clsx(inputClass, width(className), "h-10 pr-8", className)} {...props}>
      {children}
    </select>
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={clsx("block", className)}>
      <span className="mb-1.5 block text-xs font-medium text-slate-600">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

export function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
      <input type="checkbox" className="h-4 w-4 rounded border-line accent-[var(--brand)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

// ───────────── Layout pieces ─────────────

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 animate-rise">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({
  title,
  actions,
  children,
  className,
  padded = true,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section className={clsx("elevated animate-rise overflow-hidden rounded-2xl border border-line", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          {actions}
        </header>
      )}
      <div className={padded ? "p-5" : ""}>{children}</div>
    </section>
  );
}

const statTones = {
  slate: "from-slate-400 to-slate-600",
  green: "from-emerald-400 to-emerald-600",
  red: "from-rose-400 to-rose-600",
  amber: "from-amber-400 to-amber-600",
  blue: "from-sky-400 to-sky-600",
  violet: "from-brand-400 to-brand-600",
};

/** KPI tile: tilts in 3D toward the pointer; numeric values count up. */
export function StatCard({
  label,
  value,
  hint,
  tone = "slate",
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: keyof typeof statTones;
  icon?: ReactNode;
}) {
  return (
    <Tilt className="h-full rounded-2xl">
      <div className="elevated relative h-full overflow-hidden rounded-2xl border border-line p-5">
        <div
          aria-hidden
          className={clsx("pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br opacity-[0.12] blur-2xl", statTones[tone])}
        />
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-medium text-slate-500">{label}</p>
          {icon && (
            <span
              className={clsx(
                "grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white shadow-[inset_0_1px_0_oklch(1_0_0/0.35),0_6px_14px_-6px_oklch(0_0_0/0.35)] [transform:translateZ(24px)]",
                statTones[tone],
              )}
            >
              {icon}
            </span>
          )}
        </div>
        <p className="mt-3 text-[28px] font-semibold leading-none tracking-tight text-slate-900 [transform:translateZ(16px)]">
          {typeof value === "number" ? <AnimatedNumber value={value} /> : value}
        </p>
        {hint && <p className="mt-2 text-xs text-slate-500">{hint}</p>}
      </div>
    </Tilt>
  );
}

const badgeTones = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  red: "bg-rose-50 text-rose-700 ring-rose-600/20",
  amber: "bg-amber-50 text-amber-700 ring-amber-600/20",
  blue: "bg-sky-50 text-sky-700 ring-sky-600/20",
  gray: "bg-slate-50 text-slate-600 ring-slate-500/20",
  violet: "bg-violet-50 text-violet-700 ring-violet-600/20",
};
const dotTones = { green: "bg-emerald-500", red: "bg-rose-500", amber: "bg-amber-500", blue: "bg-sky-500", gray: "bg-slate-400", violet: "bg-violet-500" };

export function Badge({ tone = "gray", children, dot }: { tone?: keyof typeof badgeTones; children: ReactNode; dot?: boolean }) {
  return (
    <span className={clsx("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", badgeTones[tone])}>
      {dot && <span className={clsx("h-1.5 w-1.5 rounded-full", dotTones[tone])} />}
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={STATUS_TONE[status] ?? "gray"} dot>
      {STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500" role="status">
      <Loader2 className="h-5 w-5 animate-spin text-brand-600" /> {label}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("skeleton rounded-lg", className)} />;
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center text-sm text-slate-500">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400">
        <Inbox className="h-5 w-5" />
      </span>
      <div className="max-w-sm">{children}</div>
    </div>
  );
}

// ───────────── Table ─────────────

export interface Column<T> {
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
}

export function Table<T>({
  columns,
  rows,
  rowKey,
  empty = "No records found",
  onRowClick,
}: {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string | number;
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
}) {
  if (rows && rows.length === 0) return <Empty>{empty}</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-line bg-surface-2/60">
            {columns.map((c, i) => (
              <th key={i} className={clsx("whitespace-nowrap px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500", c.className)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {!rows
            ? Array.from({ length: 6 }).map((_, r) => (
                <tr key={r}>
                  {columns.map((_, i) => (
                    <td key={i} className="px-4 py-3.5">
                      <Skeleton className={clsx("h-3.5", i === 0 ? "w-24" : i === 1 ? "w-36" : "w-16")} />
                    </td>
                  ))}
                </tr>
              ))
            : rows.map((row, idx) => (
                <tr
                  key={rowKey(row)}
                  style={{ ["--i" as string]: idx }}
                  className={clsx("row-in transition-colors hover:bg-brand-50/60", onRowClick && "cursor-pointer")}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map((c, i) => (
                    <td key={i} className={clsx("whitespace-nowrap px-4 py-3 text-slate-700", c.className)}>
                      {c.cell(row)}
                    </td>
                  ))}
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({ page, totalPages, total, onPage }: { page: number; totalPages: number; total: number; onPage: (p: number) => void }) {
  if (totalPages <= 1) return <p className="border-t border-line px-4 py-3 text-xs text-slate-500">{total} record(s)</p>;
  return (
    <div className="flex items-center justify-between border-t border-line px-4 py-3 text-xs text-slate-500">
      <span className="tabular">
        {total.toLocaleString()} records · page {page} of {totalPages}
      </span>
      <div className="flex gap-1.5">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft className="h-3.5 w-3.5" /> Prev
        </Button>
        <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria-label="Next page">
          Next <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ───────────── Modal ─────────────

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[oklch(0.15_0.02_262/0.45)] p-4 pt-[8vh] backdrop-blur-sm"
          onMouseDown={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <motion.div
            className={clsx("floating w-full rounded-2xl border border-line", wide ? "max-w-3xl" : "max-w-lg")}
            onMouseDown={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={{ opacity: 0, y: 18, scale: 0.97, rotateX: 8 }}
            animate={{ opacity: 1, y: 0, scale: 1, rotateX: 0 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            style={{ transformPerspective: 1000 }}
          >
            <header className="flex items-center justify-between border-b border-line px-5 py-3.5">
              <h3 id={titleId} className="font-semibold text-slate-900">
                {title}
              </h3>
              <button className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" onClick={onClose} aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="max-h-[70vh] overflow-y-auto p-5">{children}</div>
            {footer && <footer className="flex justify-end gap-2 border-t border-line bg-surface-2/60 px-5 py-3">{footer}</footer>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ───────────── Toasts ─────────────

interface Toast {
  id: number;
  message: string;
  tone: "success" | "error";
}

const ToastContext = createContext<(message: string, tone?: Toast["tone"]) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, tone: Toast["tone"] = "success") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 7000 : 3500);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2" aria-live="polite">
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, transition: { duration: 0.18 } }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              className="floating pointer-events-auto flex items-start gap-3 rounded-xl border border-line px-4 py-3 text-sm text-slate-800"
            >
              {t.tone === "success" ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              ) : (
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
              )}
              <span>{t.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

// ───────────── Tabs ─────────────

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const group = useId();
  return (
    <div className="mb-5 flex gap-1 overflow-x-auto border-b border-line" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={clsx(
            "relative whitespace-nowrap px-3.5 py-2.5 text-sm font-medium transition-colors",
            value === t.value ? "text-brand-700" : "text-slate-500 hover:text-slate-800",
          )}
        >
          {t.label}
          {value === t.value && (
            <motion.span layoutId={`tab-${group}`} className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-600" transition={{ type: "spring", stiffness: 500, damping: 38 }} />
          )}
        </button>
      ))}
    </div>
  );
}
