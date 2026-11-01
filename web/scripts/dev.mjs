// Development launcher: starts `next dev --turbopack`, then compiles every page in the
// background so the first click on each page is instant instead of waiting for a compile.
// (Production builds are pre-compiled and don't need this.)
import { spawn } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const PORT = process.env.PORT ?? "3000";
const appDir = join(process.cwd(), "app");

// Static routes from every app/.../page.tsx (route groups like "(app)" removed, dynamic [id] pages skipped)
function findRoutes(dir) {
  const routes = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "api" || name.startsWith("[")) continue;
      routes.push(...findRoutes(full));
    } else if (name === "page.tsx") {
      const route = "/" + relative(appDir, dir).split(sep).filter((s) => s && !s.startsWith("(")).join("/");
      routes.push(route);
    }
  }
  return routes;
}

async function warm(routes) {
  const started = Date.now();
  for (const route of routes) {
    try {
      await fetch(`http://localhost:${PORT}${route}`, { redirect: "manual" });
    } catch {
      /* server restarting — skip */
    }
  }
  // Compile the API proxy route too
  await fetch(`http://localhost:${PORT}/api/branding`).catch(() => {});
  console.log(`\n  ✓ Pre-compiled ${routes.length} pages in ${((Date.now() - started) / 1000).toFixed(1)}s — page switches are now instant\n`);
}

const child = spawn("npx", ["next", "dev", "--turbopack", "-p", PORT], { stdio: ["inherit", "pipe", "inherit"], shell: true });
let warmed = false;
child.stdout.on("data", (chunk) => {
  process.stdout.write(chunk);
  if (!warmed && /Ready in/.test(chunk.toString())) {
    warmed = true;
    warm(findRoutes(appDir));
  }
});
child.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
