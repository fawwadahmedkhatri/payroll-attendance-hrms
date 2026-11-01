import type { NextRequest } from "next/server";

/**
 * Same-origin proxy: the browser calls /api/* on the web app and this handler forwards
 * the request to the Express API. Keeps the auth cookie first-party and lets the API URL
 * be set at runtime (API_URL) in Docker / Kubernetes.
 */
export const dynamic = "force-dynamic";

const API_URL = process.env.API_URL ?? "http://localhost:4000";
const HOP_BY_HOP = ["host", "connection", "content-length", "transfer-encoding", "keep-alive", "upgrade"];

async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const target = `${API_URL}/api/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`;

  const headers = new Headers(req.headers);
  HOP_BY_HOP.forEach((h) => headers.delete(h));
  headers.set("x-forwarded-host", req.headers.get("host") ?? "");

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : await req.arrayBuffer(),
      redirect: "manual",
      cache: "no-store",
    });
  } catch {
    return Response.json({ error: "The API server is not reachable. Is it running?" }, { status: 502 });
  }

  const resHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!["content-encoding", "content-length", "transfer-encoding", "connection", "set-cookie"].includes(key)) {
      resHeaders.set(key, value);
    }
  });
  for (const cookie of upstream.headers.getSetCookie()) resHeaders.append("set-cookie", cookie);

  return new Response(upstream.status === 204 ? null : upstream.body, { status: upstream.status, headers: resHeaders });
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
