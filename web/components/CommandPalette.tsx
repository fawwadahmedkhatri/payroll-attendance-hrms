"use client";

import clsx from "clsx";
import { CornerDownLeft, Search, User } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { qs, useApi, type Paged } from "@/lib/api";

export interface PaletteItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  group: string;
}

/** ⌘K / Ctrl+K quick navigation: jump to any screen or search employees by name or code. */
export function CommandPalette({ open, onClose, items, canSearchEmployees }: { open: boolean; onClose: () => void; items: PaletteItem[]; canSearchEmployees: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounced = useDebounced(query, 200);

  const { data: people } = useApi<Paged<any>>(
    open && canSearchEmployees && debounced.trim().length >= 2 ? `/employees${qs({ search: debounced, pageSize: 5, status: "ALL" })}` : null,
  );

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pages = items.filter((i) => !q || i.label.toLowerCase().includes(q));
    const employees: PaletteItem[] = (people?.items ?? []).map((e) => ({
      href: `/employees/${e.id}`,
      label: `${e.firstName} ${e.lastName} · ${e.employeeCode}`,
      icon: User,
      group: "Employees",
    }));
    return [...pages, ...employees];
  }, [items, query, people]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
    }
  }, [open]);
  useEffect(() => setActive(0), [query]);

  function go(item: PaletteItem | undefined) {
    if (!item) return;
    onClose();
    router.push(item.href);
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      go(results[active]);
    } else if (e.key === "Escape") {
      onClose();
    }
  }

  let lastGroup = "";
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-start justify-center bg-[oklch(0.15_0.02_262/0.45)] p-4 pt-[12vh] backdrop-blur-sm"
          onMouseDown={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <motion.div
            onMouseDown={(e) => e.stopPropagation()}
            className="floating w-full max-w-xl overflow-hidden rounded-2xl border border-line"
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 450, damping: 34 }}
            role="dialog"
            aria-label="Command palette"
          >
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                ref={inputRef}
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKey}
                placeholder={canSearchEmployees ? "Jump to a page or search employees…" : "Jump to a page…"}
                className="h-12 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                aria-label="Search"
              />
              <kbd className="rounded-md border border-line px-1.5 py-0.5 text-[10px] text-slate-500">ESC</kbd>
            </div>
            <ul className="max-h-[50vh] overflow-y-auto p-2" role="listbox">
              {results.length === 0 && <li className="px-3 py-8 text-center text-sm text-slate-500">No matches</li>}
              {results.map((item, i) => {
                const header = item.group !== lastGroup ? item.group : null;
                lastGroup = item.group;
                return (
                  <li key={`${item.group}-${item.href}`}>
                    {header && <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{header}</p>}
                    <button
                      role="option"
                      aria-selected={i === active}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => go(item)}
                      className={clsx(
                        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors",
                        i === active ? "bg-brand-50 text-brand-700" : "text-slate-700",
                      )}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span className="flex-1 truncate">{item.label}</span>
                      {i === active && <CornerDownLeft className="h-3.5 w-3.5 opacity-60" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function useDebounced<T>(value: T, delay: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}
