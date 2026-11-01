"use client";

import { ArrowUpRight, CalendarCheck, Clock, Cpu, UserCheck, UserX, Users, Wallet } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Ring } from "@/components/motion";
import { Button, Card, Skeleton, StatCard, StatusBadge } from "@/components/ui";
import { useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { compactMoney, formatDate, money } from "@/lib/format";

interface Dashboard {
  today: string;
  headcount: number;
  todayStats: { present: number; late: number; absent: number; onLeave: number; notPunched: number; isOffDay: boolean };
  pendingLeaves: number;
  attendanceTrend: { date: string; present: number; absent: number; onLeave: number; late: number }[];
  departments: { name: string; employees: number }[];
  payrollTrend: { label: string; status: string; gross: number; deductions: number; net: number; employees: number }[];
}

// Chart colours come from CSS variables so they follow the theme and the organisation's brand
const C = {
  brand: "var(--brand)",
  glow: "var(--brand-glow)",
  present: "var(--color-emerald-500)",
  absent: "var(--color-rose-500)",
  late: "var(--color-amber-500)",
  grid: "var(--border)",
  axis: "var(--color-slate-500)",
};

const tooltipStyle = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  boxShadow: "var(--shadow-floating)",
  fontSize: 12,
  color: "var(--color-slate-900)",
};

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default function DashboardView() {
  const { me, currency } = useAuth();
  const { data } = useApi<Dashboard>("/reports/dashboard", { refreshInterval: 60_000 });

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 animate-rise">
        <div>
          <p className="text-sm text-slate-500">{data ? formatDate(data.today) : " "}</p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-slate-900 sm:text-[28px]">
            {greeting()}, {me?.employee?.firstName ?? "there"}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/attendance">
            <Button variant="secondary">
              <Cpu className="h-4 w-4" /> Attendance
            </Button>
          </Link>
          <Link href="/leave">
            <Button variant="secondary">
              <CalendarCheck className="h-4 w-4" /> Review leave
              {data && data.pendingLeaves > 0 && <span className="rounded-full bg-brand-600 px-1.5 text-[10px] font-semibold text-[var(--brand-fg)]">{data.pendingLeaves}</span>}
            </Button>
          </Link>
          <Link href="/payroll">
            <Button>
              <Wallet className="h-4 w-4" /> Run payroll
            </Button>
          </Link>
        </div>
      </div>

      {!data ? (
        <DashboardSkeleton />
      ) : (
        <Content data={data} currency={currency} />
      )}
    </>
  );
}

function Content({ data, currency }: { data: Dashboard; currency: string }) {
  const t = data.todayStats;
  const expected = Math.max(1, data.headcount - t.onLeave);
  const lastRun = data.payrollTrend[data.payrollTrend.length - 1];
  const maxDept = Math.max(1, ...data.departments.map((d) => d.employees));

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Active employees" value={data.headcount} icon={<Users className="h-4 w-4" />} tone="violet" hint={`${data.departments.length} departments`} />
        <StatCard label="Present today" value={t.present} hint={t.isOffDay ? "Weekly off / holiday" : `${t.notPunched} not punched in yet`} icon={<UserCheck className="h-4 w-4" />} tone="green" />
        <StatCard label="Late today" value={t.late} hint={t.present ? `${Math.round((t.late / t.present) * 100)}% of arrivals` : "No arrivals yet"} icon={<Clock className="h-4 w-4" />} tone="amber" />
        <StatCard label="On leave · absent" value={`${t.onLeave} · ${t.absent}`} hint={`${data.pendingLeaves} leave requests pending`} icon={<UserX className="h-4 w-4" />} tone="red" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card
          title="Attendance — last 14 days"
          className="xl:col-span-2"
          actions={
            <div className="flex gap-3 text-xs text-slate-500">
              <Legend color={C.present} label="Present" />
              <Legend color={C.late} label="Late" />
              <Legend color={C.absent} label="Absent" />
            </div>
          }
        >
          <div className="h-72">
            <ResponsiveContainer>
              <AreaChart
                // Weekly offs and holidays have no attendance; leave them out so the trend is not distorted
                data={data.attendanceTrend.filter((d) => d.present + d.absent + d.onLeave > 0).map((d) => ({ ...d, label: d.date.slice(5) }))}
                margin={{ left: -18, right: 6, top: 6 }}
              >
                <defs>
                  <Gradient id="gPresent" color={C.present} />
                  <Gradient id="gLate" color={C.late} />
                  <Gradient id="gAbsent" color={C.absent} />
                </defs>
                <CartesianGrid stroke={C.grid} strokeDasharray="3 6" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.axis }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: C.axis }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: C.grid }} />
                <Area type="monotone" dataKey="present" name="Present" stroke={C.present} strokeWidth={2} fill="url(#gPresent)" animationDuration={900} />
                <Area type="monotone" dataKey="late" name="Late" stroke={C.late} strokeWidth={2} fill="url(#gLate)" animationDuration={900} />
                <Area type="monotone" dataKey="absent" name="Absent" stroke={C.absent} strokeWidth={2} fill="url(#gAbsent)" animationDuration={900} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Today">
          <div className="flex flex-col items-center py-2">
            <Ring value={t.isOffDay ? 0 : t.present / expected} size={168} stroke={14} label={t.isOffDay ? "Off" : `${Math.round((t.present / expected) * 100)}%`} sublabel="present" />
            <div className="mt-5 grid w-full grid-cols-3 gap-2 text-center">
              {[
                ["Present", t.present, "text-emerald-700"],
                ["Late", t.late, "text-amber-700"],
                ["Absent", t.absent, "text-rose-700"],
              ].map(([label, value, color]) => (
                <div key={label as string} className="rounded-xl bg-surface-2 px-2 py-2.5 ring-1 ring-inset ring-line">
                  <p className={`text-lg font-semibold tabular ${color}`}>{value}</p>
                  <p className="text-[11px] text-slate-500">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card
          title="Payroll trend"
          className="xl:col-span-2"
          actions={
            <Link href="/payroll" className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline">
              All runs <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          }
        >
          {data.payrollTrend.length === 0 ? (
            <p className="py-16 text-center text-sm text-slate-500">No payroll has been processed yet.</p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer>
                <AreaChart data={data.payrollTrend} margin={{ left: 0, right: 6, top: 6 }}>
                  <defs>
                    <Gradient id="gGross" color={C.brand} />
                    <Gradient id="gNet" color={C.glow} />
                  </defs>
                  <CartesianGrid stroke={C.grid} strokeDasharray="3 6" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.axis }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: C.axis }} axisLine={false} tickLine={false} tickFormatter={(v) => compactMoney(v, currency)} width={64} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => money(Number(v), currency)} />
                  <Area type="monotone" dataKey="gross" name="Gross" stroke={C.brand} strokeWidth={2.5} fill="url(#gGross)" />
                  <Area type="monotone" dataKey="net" name="Net pay" stroke={C.glow} strokeWidth={2.5} fill="url(#gNet)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card title="Latest payroll">
          {lastRun ? (
            <div>
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500">{lastRun.label}</p>
                <StatusBadge status={lastRun.status} />
              </div>
              <p className="mt-3 text-3xl font-semibold tracking-tight tabular text-slate-900">{money(lastRun.net, currency)}</p>
              <p className="text-xs text-slate-500">net pay to {lastRun.employees} employees</p>
              <div className="mt-5 space-y-3 text-sm">
                <Bar label="Gross" value={lastRun.gross} max={lastRun.gross} color="bg-brand-500" currency={currency} />
                <Bar label="Deductions" value={lastRun.deductions} max={lastRun.gross} color="bg-rose-500" currency={currency} />
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">No payroll yet.</p>
          )}
        </Card>
      </div>

      <Card title="Headcount by department" className="mt-6">
        <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {data.departments.map((d, i) => (
            <li key={d.name}>
              <div className="mb-1.5 flex justify-between text-sm">
                <span className="text-slate-600">{d.name}</span>
                <span className="font-medium tabular text-slate-900">{d.employees}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-brand-500 to-[var(--brand-glow)]"
                  initial={{ width: 0 }}
                  animate={{ width: `${(d.employees / maxDept) * 100}%` }}
                  transition={{ duration: 0.8, delay: 0.1 + i * 0.04, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

function Gradient({ id, color }: { id: string; color: string }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={color} stopOpacity={0.32} />
      <stop offset="100%" stopColor={color} stopOpacity={0} />
    </linearGradient>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function Bar({ label, value, max, color, currency }: { label: string; value: number; max: number; color: string; currency: string }) {
  return (
    <div>
      <div className="mb-1 flex justify-between">
        <span className="text-slate-500">{label}</span>
        <span className="font-medium tabular text-slate-800">{money(value, currency)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
        <motion.div className={`h-full rounded-full ${color}`} initial={{ width: 0 }} animate={{ width: `${(value / max) * 100}%` }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} />
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading dashboard">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[124px] rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <Skeleton className="h-[360px] rounded-2xl xl:col-span-2" />
        <Skeleton className="h-[360px] rounded-2xl" />
      </div>
    </div>
  );
}
