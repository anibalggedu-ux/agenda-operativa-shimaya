import { env } from "cloudflare:workers";
import { createApp } from "../../src/worker/app";
import { hashPassword } from "../../src/worker/password";
import { newId } from "../../src/worker/util";
import type { Role } from "../../src/shared/types";

export const PASSWORD = "clave-de-prueba-123";
let cachedHash: Promise<string> | undefined;
const hash = () => (cachedHash ??= hashPassword(PASSWORD));

/** Reloj controlable: las pruebas de vigencia y de zona horaria fijan el "ahora". */
export class Clock {
  constructor(public t = Date.parse("2026-10-24T17:00:00.000Z")) {}
  now = () => new Date(this.t);
  set(iso: string) {
    this.t = Date.parse(iso);
  }
  advance(ms: number) {
    this.t += ms;
  }
}

const ctx = { waitUntil() {}, passThroughOnException() {}, props: {} } as unknown as ExecutionContext;

export interface Api {
  clock: Clock;
  call(method: string, path: string, opts?: CallOpts): Promise<{ status: number; body: any; headers: Headers }>;
}
export interface CallOpts {
  body?: unknown;
  cookie?: string | null;
  headers?: Record<string, string>;
  ip?: string;
  csrf?: boolean;
  db?: D1Database;
}

export function makeApi(clock = new Clock()): Api {
  const app = createApp({ now: clock.now });
  return {
    clock,
    async call(method, path, opts = {}) {
      const headers: Record<string, string> = {
        "cf-connecting-ip": opts.ip ?? "203.0.113.7",
        ...(opts.csrf === false ? {} : { "x-shimaya-csrf": "1" }),
        ...opts.headers,
      };
      if (opts.cookie) headers.cookie = opts.cookie;
      if (opts.body !== undefined) headers["content-type"] = "application/json";
      const req = new Request(`https://cupones.test${path}`, {
        method,
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      });
      const e = opts.db ? ({ ...env, DB: opts.db } as Env) : (env as Env);
      const res = await app.fetch(req, e, ctx);
      const text = await res.text();
      return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
    },
  };
}

export interface User {
  id: string;
  email: string;
  cookie: string;
}

/** Crea un usuario con rol (insert directo, como haría el procedimiento de alta) e inicia sesión. */
export async function userWithSession(api: Api, role: Role, name: string = role): Promise<User> {
  const id = newId();
  const email = `${name}-${id.slice(0, 8)}@prueba.shimaya.test`;
  await env.DB.prepare("INSERT INTO users (id, email, display_name, role, password_hash) VALUES (?, ?, ?, ?, ?)")
    .bind(id, email, `${name} ${id.slice(0, 4)}`, role, await hash())
    .run();
  const res = await api.call("POST", "/api/auth/login", { body: { email, password: PASSWORD }, ip: `198.51.100.${Math.floor(Math.random() * 250)}` });
  if (res.status !== 200) throw new Error(`login falló: ${res.status} ${JSON.stringify(res.body)}`);
  const setCookie = res.headers.get("set-cookie") ?? "";
  return { id, email, cookie: setCookie.split(";")[0]! };
}

export interface CampaignSeed {
  id: string;
  name: string;
}

export async function campaign(
  api: Api,
  o: Partial<{ startsAt: string; endsAt: string; status: "active" | "inactive"; codeLength: number }> = {},
): Promise<CampaignSeed> {
  const id = newId();
  const name = `Campaña ${id.slice(0, 8)}`;
  const base = api.clock.t;
  await env.DB.prepare(
    "INSERT INTO campaigns (id, name, description, benefit, starts_at, ends_at, status, code_length) VALUES (?, ?, 'prueba', 'Gyoza gratis', ?, ?, ?, ?)",
  )
    .bind(
      id,
      name,
      o.startsAt ?? new Date(base - 7 * 86400_000).toISOString(),
      o.endsAt ?? new Date(base + 7 * 86400_000).toISOString(),
      o.status ?? "active",
      o.codeLength ?? 8,
    )
    .run();
  return { id, name };
}

let seq = 0;
/** Código único de la longitud pedida, con ceros iniciales cuando conviene. */
export function uniqueCode(length = 8): string {
  seq += 1;
  const n = (Date.now() % 1_000_000) * 1000 + (seq % 1000);
  return String(n).padStart(length, "0").slice(-length);
}

export async function coupon(campaignId: string, o: Partial<{ code: string; status: "available" | "redeemed" | "voided"; length: number }> = {}) {
  const id = newId();
  const code = o.code ?? uniqueCode(o.length ?? 8);
  const status = o.status ?? "available";
  await env.DB.prepare(
    "INSERT INTO coupons (id, code, campaign_id, status, void_reason, voided_at) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(id, code, campaignId, status, status === "voided" ? "prueba" : null, status === "voided" ? "2026-10-01T00:00:00.000Z" : null)
    .run();
  return { id, code };
}

export const key = () => `k${newId().replace(/-/g, "")}`;

/** Inserta un canje "histórico" directamente (para pruebas de estadísticas con fechas controladas). */
export async function redemptionAt(campaignId: string, userId: string, iso: string) {
  const c = await coupon(campaignId);
  const id = newId();
  await env.DB.prepare(
    "INSERT INTO redemptions (id, coupon_id, campaign_id, redeemed_by, redeemed_at, idempotency_key) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(id, c.id, campaignId, userId, iso, key())
    .run();
  return { id, code: c.code };
}

export async function count(sql: string, ...params: unknown[]): Promise<number> {
  const r = await env.DB.prepare(sql).bind(...params).first<{ n: number }>();
  return r?.n ?? 0;
}

export const redeem = (api: Api, u: User, code: string, k = key()) =>
  api.call("POST", "/api/validador/redemptions", { cookie: u.cookie, body: { code }, headers: { "idempotency-key": k } });

export const lookup = (api: Api, u: User, code: string) => api.call("POST", "/api/validador/coupons/lookup", { cookie: u.cookie, body: { code } });
