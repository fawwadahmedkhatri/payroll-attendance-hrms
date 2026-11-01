"use client";

import clsx from "clsx";
import {
  BarChart3,
  CalendarCheck,
  CalendarDays,
  ChevronsLeft,
  FileSpreadsheet,
  Fingerprint,
  LayoutDashboard,
  LogOut,
  Menu,
  Receipt,
  Search,
  Settings,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BrandMark } from "@/components/BrandMark";
import { CommandPalette, type PaletteItem } from "@/components/CommandPalette";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useBranding } from "@/lib/branding";

const HR_NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/employees", label: "Employees", icon: Users },
  { href: "/attendance", label: "Attendance", icon: Fingerprint },
  { href: "/attendance/import", label: "Import Attendance", icon: FileSpreadsheet },
  { href: "/leave", label: "Leave Requests", icon: CalendarCheck },
  { href: "/payroll", label: "Payroll", icon: Wallet },
  { href: "/reports", label: "Reports", icon: BarChart3 },
];

const SELF_NAV = [
  { href: "/me", label: "My Dashboard", icon: LayoutDashboard },
  { href: "/me/attendance", label: "My Attendance", icon: CalendarDays },
  { href: "/me/leave", label: "My Leave", icon: CalendarCheck },
  { href: "/me/payslips", label: "My Payslips", icon: Receipt },
];

const COLLAPSE_KEY = "hrms-sidebar-collapsed";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { me, loading, isHR, isAdmin } = useAuth();
  const { branding } = useBranding();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    if (!loading && !me) router.replace("/login");
  }, [loading, me, router]);
  useEffect(() => {
    // Employees cannot open HR screens (the API enforces this too)
    if (me && !isHR && !pathname.startsWith("/me") && !pathname.startsWith("/payslips")) router.replace("/me");
  }, [me, isHR, pathname, router]);
  useEffect(() => setMobileOpen(false), [pathname]);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (loading || !me) return <Spinner />;

  function toggleCollapsed() {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !c;
    });
  }

  async function logout() {
    await api("/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const sections = [
    ...(isHR ? [{ title: "HR & Admin", items: [...HR_NAV, ...(isAdmin ? [{ href: "/settings", label: "Settings", icon: Settings }] : [])] }] : []),
    ...(me.employee ? [{ title: isHR ? "Self service" : "Menu", items: SELF_NAV }] : []),
  ];
  const allItems = sections.flatMap((s) => s.items);
  // The most specific matching menu entry is highlighted
  const activeItem = allItems.filter((i) => pathname === i.href || pathname.startsWith(i.href + "/")).sort((a, b) => b.href.length - a.href.length)[0];
  const paletteItems: PaletteItem[] = sections.flatMap((s) => s.items.map((i) => ({ ...i, group: s.title })));

  const name = me.employee ? `${me.employee.firstName} ${me.employee.lastName}` : me.email;
  const initials = me.employee ? `${me.employee.firstName[0]}${me.employee.lastName[0]}` : me.email[0].toUpperCase();
  const company = branding.companyName || me.company?.companyName || branding.productName;

  const sidebar = (isCompact: boolean) => (
    <div className="flex h-full flex-col">
      <div className={clsx("flex h-16 items-center gap-2.5 px-4", isCompact && "justify-center px-0")}>
        <BrandMark size={36} />
        {!isCompact && (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{company}</p>
            <p className="truncate text-[11px] text-slate-500">{branding.productName}</p>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-3" aria-label="Main">
        {sections.map((s) => (
          <div key={s.title}>
            {!isCompact && <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{s.title}</p>}
            <ul className="space-y-0.5">
              {s.items.map((item) => {
                const active = activeItem?.href === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      title={isCompact ? item.label : undefined}
                      aria-current={active ? "page" : undefined}
                      className={clsx(
                        "relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                        isCompact && "justify-center px-0",
                        active ? "text-brand-700" : "text-slate-600 hover:bg-slate-100/70 hover:text-slate-900",
                      )}
                    >
                      {active && (
                        <motion.span
                          layoutId={isCompact ? "nav-compact" : "nav-full"}
                          className="absolute inset-0 rounded-xl bg-brand-50 ring-1 ring-inset ring-brand-200/60"
                          transition={{ type: "spring", stiffness: 480, damping: 36 }}
                        />
                      )}
                      <item.icon className="relative h-[18px] w-[18px] shrink-0" />
                      {!isCompact && <span className="relative truncate">{item.label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className={clsx("border-t border-line p-3", isCompact && "px-2")}>
        <div className={clsx("flex items-center gap-3 rounded-xl p-2", isCompact && "justify-center")}>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-slate-200 to-slate-300 text-xs font-semibold text-slate-700 ring-2 ring-surface">
            {initials}
          </span>
          {!isCompact && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900">{name}</p>
              <p className="truncate text-[11px] text-slate-500">{me.role}</p>
            </div>
          )}
          {!isCompact && (
            <button onClick={logout} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600" aria-label="Sign out" title="Sign out">
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
        {isCompact && (
          <button onClick={logout} className="mx-auto mt-1 grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Sign out" title="Sign out">
            <LogOut className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="app-canvas min-h-screen lg:flex">
      {/* Desktop sidebar */}
      <aside
        className={clsx(
          "no-print glass sticky top-0 hidden h-screen shrink-0 border-r border-line transition-[width] duration-300 ease-out lg:block",
          collapsed ? "w-[76px]" : "w-64",
        )}
      >
        {sidebar(collapsed)}
        <button
          onClick={toggleCollapsed}
          className="absolute -right-3 top-20 grid h-6 w-6 place-items-center rounded-full border border-line bg-surface text-slate-500 shadow-sm transition hover:text-slate-900"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <ChevronsLeft className={clsx("h-3.5 w-3.5 transition-transform", collapsed && "rotate-180")} />
        </button>
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-[oklch(0.15_0.02_262/0.45)] backdrop-blur-sm lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              className="fixed inset-y-0 left-0 z-50 w-72 border-r border-line bg-surface lg:hidden"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 38 }}
            >
              <button onClick={() => setMobileOpen(false)} className="absolute right-3 top-4 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Close menu">
                <X className="h-4 w-4" />
              </button>
              {sidebar(false)}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="min-w-0 flex-1">
        <header className="no-print glass sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line px-4 sm:px-6 lg:px-8">
          <button onClick={() => setMobileOpen(true)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <p className="truncate text-sm font-medium text-slate-500">
            <span className="hidden sm:inline">{company} / </span>
            <span className="text-slate-900">{activeItem?.label ?? "Details"}</span>
          </p>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setPaletteOpen(true)}
              className="flex h-9 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm text-slate-500 shadow-[0_1px_2px_oklch(0_0_0/0.04)] transition hover:border-slate-300 hover:text-slate-800"
              aria-label="Search"
            >
              <Search className="h-4 w-4" />
              <span className="hidden md:inline">Search…</span>
              <kbd className="hidden rounded-md border border-line px-1.5 text-[10px] md:inline">Ctrl K</kbd>
            </button>
            <ThemeToggle />
          </div>
        </header>

        <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
          <motion.div key={pathname} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>
            {children}
          </motion.div>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} items={paletteItems} canSearchEmployees={isHR} />
    </div>
  );
}
