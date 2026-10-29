import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const tmpDir = join(root, "scripts", ".tmp");
// Se invoca wrangler con el propio Node: en Windows execFileSync("npx") falla (ENOENT/EINVAL) sin shell.
const wranglerBin = join(root, "node_modules", "wrangler", "bin", "wrangler.js");

export type Target = "--local" | "--remote";

/** Ejecuta SQL en D1 vía wrangler (sin shell). El archivo temporal se borra siempre y está en .gitignore. */
export function runSql(target: Target, sql: string): string {
  mkdirSync(tmpDir, { recursive: true });
  const file = join(tmpDir, `sql-${process.pid}-${Date.now()}.sql`);
  writeFileSync(file, sql, { mode: 0o600 });
  try {
    return execFileSync(process.execPath, [wranglerBin, "d1", "execute", "DB", target, "--file", file, "--json"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
    });
  } finally {
    rmSync(file, { force: true });
  }
}

export function querySql(target: Target, sql: string): unknown[] {
  mkdirSync(tmpDir, { recursive: true });
  const out = execFileSync(process.execPath, [wranglerBin, "d1", "execute", "DB", target, "--command", sql, "--json"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  const parsed = JSON.parse(out.slice(out.indexOf("[")));
  return parsed[0]?.results ?? [];
}

export const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
