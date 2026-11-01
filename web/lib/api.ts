import useSWR, { type SWRConfiguration } from "swr";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  form?: FormData;
}

export async function api<T = any>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? (opts.body !== undefined || opts.form ? "POST" : "GET"),
    headers: opts.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
    credentials: "same-origin",
  });
  if (res.status === 204) return undefined as T;
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json() : await res.text();
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined" && !window.location.pathname.startsWith("/login") && path !== "/auth/me") {
      window.location.href = "/login";
    }
    const message = isJson && data?.error ? data.error : `Request failed (${res.status})`;
    throw new ApiError(message, res.status, isJson ? data?.details : undefined);
  }
  return data as T;
}

export function useApi<T = any>(path: string | null, config?: SWRConfiguration) {
  return useSWR<T>(path, (p: string) => api<T>(p), { revalidateOnFocus: false, ...config });
}

/** Build a query string, skipping empty values. */
export function qs(params: Record<string, string | number | boolean | null | undefined>) {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") search.set(k, String(v));
  }
  const s = search.toString();
  return s ? `?${s}` : "";
}

/** Open a file endpoint (CSV / PDF / XLSX) — the browser handles the download. */
export function openFile(path: string) {
  window.open(`/api${path}`, "_blank");
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const details = err.details;
    if (Array.isArray(details) && details.length > 0 && typeof details[0] === "object" && details[0] && "message" in details[0]) {
      const parts = (details as { path?: string; message: string }[]).map((d) => (d.path ? `${d.path}: ${d.message}` : d.message));
      return `${err.message} — ${parts.join("; ")}`;
    }
    return err.message;
  }
  return err instanceof Error ? err.message : "Something went wrong";
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
