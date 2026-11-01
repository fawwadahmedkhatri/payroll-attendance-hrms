"use client";

import clsx from "clsx";
import { AlertTriangle, Check, ImagePlus, Monitor, Moon, RotateCcw, Sun, Trash2, Users } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { BrandMark } from "@/components/BrandMark";
import { Badge, Button, Card, Field, Input, StatCard, useToast } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { contrastWithWhite, DEFAULT_BRANDING, MIN_WHITE_CONTRAST, readableOn, useBranding, type Branding } from "@/lib/branding";

const PRESETS: { name: string; brand: string; accent: string }[] = [
  { name: "Ocean", brand: "#3a5ce0", accent: "#36b3e6" },
  { name: "Emerald", brand: "#059669", accent: "#34d399" },
  { name: "Teal", brand: "#0d9488", accent: "#38bdf8" },
  { name: "Violet", brand: "#7c3aed", accent: "#22d3ee" },
  { name: "Crimson", brand: "#dc2626", accent: "#fb923c" },
  { name: "Rose", brand: "#e11d48", accent: "#f472b6" },
  { name: "Amber", brand: "#f59e0b", accent: "#f97316" },
  { name: "Graphite", brand: "#334155", accent: "#94a3b8" },
];

const MAX_LOGO_BYTES = 300 * 1024;
const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

export function BrandingTab() {
  const toast = useToast();
  const { branding: active, loaded, preview, refresh } = useBranding();
  const [form, setForm] = useState<Branding | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const savedRef = useRef<Branding | null>(null);

  // Start from the saved branding once it has loaded
  useEffect(() => {
    if (loaded && !form) {
      savedRef.current = active;
      setForm(active);
    }
  }, [loaded, active, form]);

  // Live preview: the whole app re-themes as the admin edits; reverted when leaving the tab
  useEffect(() => {
    if (form) preview(form);
  }, [form, preview]);
  useEffect(() => () => preview(null), [preview]);

  if (!form) return null;
  const dirty = JSON.stringify(form) !== JSON.stringify(savedRef.current);
  const set = <K extends keyof Branding>(k: K, v: Branding[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const lowContrast = contrastWithWhite(form.brandColor) < MIN_WHITE_CONTRAST;

  function onLogo(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!LOGO_TYPES.includes(file.type)) return toast("Use a PNG, JPEG, WebP or SVG image", "error");
    if (file.size > MAX_LOGO_BYTES) return toast("Logo must be under 300 KB", "error");
    const reader = new FileReader();
    reader.onload = () => set("logoDataUrl", String(reader.result));
    reader.readAsDataURL(file);
  }

  async function save() {
    if (!form) return;
    setSaving(true);
    try {
      const saved = await api<Branding>("/settings/branding", {
        method: "PUT",
        body: {
          productName: form.productName,
          brandColor: form.brandColor,
          accentColor: form.accentColor,
          logoDataUrl: form.logoDataUrl,
          defaultTheme: form.defaultTheme,
          cornerStyle: form.cornerStyle,
        },
      });
      const next = { ...form, ...saved };
      savedRef.current = next;
      await refresh();
      preview(null);
      setForm(next);
      toast("Branding saved — everyone sees it on their next page load");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        <Card title="Identity">
          <div className="grid gap-5 sm:grid-cols-[auto_1fr]">
            <div className="flex flex-col items-center gap-2">
              <BrandMark size={88} className="!rounded-2xl" />
              <div className="flex gap-1">
                <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
                  <ImagePlus className="h-3.5 w-3.5" /> {form.logoDataUrl ? "Replace" : "Upload logo"}
                </Button>
                {form.logoDataUrl && (
                  <Button size="sm" variant="ghost" onClick={() => set("logoDataUrl", null)} aria-label="Remove logo">
                    <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                  </Button>
                )}
              </div>
              <input ref={fileRef} type="file" accept={LOGO_TYPES.join(",")} className="hidden" onChange={onLogo} />
              <p className="text-center text-[11px] text-slate-400">
                PNG, JPEG, WebP or SVG · max 300 KB
                <br />
                Square works best
              </p>
            </div>
            <div className="space-y-4">
              <Field label="Product name" hint="Shown in the sidebar, browser tab and login page">
                <Input value={form.productName} maxLength={40} onChange={(e) => set("productName", e.target.value)} />
              </Field>
              <Field label="Company name" hint="Edit on the Company & rules tab">
                <Input value={form.companyName} disabled />
              </Field>
            </div>
          </div>
        </Card>

        <Card title="Colours">
          <p className="mb-3 text-sm text-slate-500">Pick a preset or your own colours. The full shade range, charts, buttons and focus rings are derived automatically.</p>
          <div className="mb-5 grid grid-cols-4 gap-2 sm:grid-cols-8">
            {PRESETS.map((p) => {
              const selected = p.brand === form.brandColor && p.accent === form.accentColor;
              return (
                <button
                  key={p.name}
                  onClick={() => setForm({ ...form, brandColor: p.brand, accentColor: p.accent })}
                  className={clsx("rounded-xl border p-1.5 text-center transition hover:-translate-y-0.5", selected ? "border-brand-500 ring-2 ring-brand-200" : "border-line")}
                  aria-pressed={selected}
                  title={p.name}
                >
                  <span className="relative block h-9 rounded-lg" style={{ background: `linear-gradient(135deg, ${p.brand} 55%, ${p.accent})` }}>
                    {selected && <Check className="absolute inset-0 m-auto h-4 w-4" style={{ color: readableOn(p.brand) }} />}
                  </span>
                  <span className="mt-1 block text-[11px] text-slate-500">{p.name}</span>
                </button>
              );
            })}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <ColorField label="Brand colour" hint="Buttons, links, active navigation" value={form.brandColor} onChange={(v) => set("brandColor", v)} />
            <ColorField label="Accent colour" hint="Glows, chart highlights, gradients" value={form.accentColor} onChange={(v) => set("accentColor", v)} />
          </div>
          {lowContrast && (
            <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              This is a light colour, so buttons will use dark text to stay readable. Brand-coloured links on white may be hard to read — consider a deeper shade.
            </p>
          )}
        </Card>

        <Card title="Appearance">
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-medium text-slate-600">Default theme</p>
              <Segmented
                value={form.defaultTheme}
                onChange={(v) => set("defaultTheme", v)}
                options={[
                  { value: "light", label: "Light", icon: Sun },
                  { value: "dark", label: "Dark", icon: Moon },
                  { value: "system", label: "System", icon: Monitor },
                ]}
              />
              <p className="mt-2 text-xs text-slate-400">Used until each person picks their own theme.</p>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-slate-600">Corner style</p>
              <Segmented
                value={form.cornerStyle}
                onChange={(v) => set("cornerStyle", v)}
                options={[
                  { value: "sharp", label: "Sharp" },
                  { value: "soft", label: "Soft" },
                  { value: "rounded", label: "Rounded" },
                ]}
              />
              <p className="mt-2 text-xs text-slate-400">Applies to cards, buttons, inputs and dialogs.</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="space-y-4 xl:sticky xl:top-24 xl:self-start">
        <Card title="Live preview" actions={dirty ? <Badge tone="amber" dot>Unsaved</Badge> : <Badge tone="green" dot>Saved</Badge>}>
          <p className="mb-4 text-xs text-slate-500">The whole app is previewing your changes right now. Nothing is saved until you click Save.</p>
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 p-3">
              <BrandMark size={36} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{form.companyName || form.productName}</p>
                <p className="truncate text-[11px] text-slate-500">{form.productName}</p>
              </div>
            </div>
            <StatCard label="Active employees" value={485} icon={<Users className="h-4 w-4" />} tone="violet" hint="10 departments" />
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm">Primary action</Button>
              <Button size="sm" variant="secondary">
                Secondary
              </Button>
              <span className="text-sm font-medium text-brand-700 underline-offset-2 hover:underline">A link</span>
            </div>
            <Input placeholder="Focus me to see the ring" aria-label="Preview input" />
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full w-2/3 rounded-full bg-gradient-to-r from-brand-500 to-[var(--brand-glow)]" />
            </div>
          </div>
        </Card>
        <div className="flex gap-2">
          <Button className="flex-1" onClick={save} loading={saving} disabled={!dirty}>
            Save branding
          </Button>
          <Button variant="secondary" disabled={!dirty} onClick={() => setForm(savedRef.current)} title="Discard unsaved changes">
            Discard
          </Button>
          <Button
            variant="ghost"
            onClick={() => setForm({ ...DEFAULT_BRANDING, companyName: form.companyName })}
            title="Back to the default look (not saved until you click Save)"
            aria-label="Reset to default branding"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function ColorField({ label, hint, value, onChange }: { label: string; hint: string; value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <Field label={label} hint={hint}>
      <div className="flex gap-2">
        <span className="relative h-10 w-12 shrink-0 cursor-pointer overflow-hidden rounded-xl border border-line" style={{ background: value }}>
          <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label={`${label} picker`} />
        </span>
        <Input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) onChange(e.target.value.toLowerCase());
          }}
          className="flex-1 font-mono uppercase"
          maxLength={7}
          aria-label={`${label} hex value`}
        />
      </div>
    </Field>
  );
}

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; icon?: typeof Sun }[] }) {
  return (
    <div role="radiogroup" className="inline-flex rounded-xl border border-line bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition",
            value === o.value ? "bg-surface text-slate-900 shadow-sm ring-1 ring-line" : "text-slate-500 hover:text-slate-800",
          )}
        >
          {o.icon && <o.icon className="h-3.5 w-3.5" />}
          {o.label}
        </button>
      ))}
    </div>
  );
}
