import { Hono } from "hono";
import { z } from "zod";
import { limaDayEndExclusiveIso, limaDayStartIso } from "../../shared/time";
import { STATE_ORDER, type CouponState } from "../../shared/types";
import { requireRole } from "../auth";
import { type AppEnv, Q, parse } from "../http";
import { effectiveStatusSql } from "../status";

// SOLO agregados. Ninguna consulta de este archivo selecciona nombres, contactos, códigos de
// cupón, ids de canje/cliente ni al trabajador que canjeó: esos datos nunca salen de la base hacia
// estas respuestas (no se "ocultan" después en el navegador). Los analistas solo tienen acceso a esta ruta.

export const analyticsRoutes = new Hono<AppEnv>();
analyticsRoutes.use("*", requireRole("analista", "moderador"));

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const reportFilters = z
  .object({ from: ymd.optional(), to: ymd.optional(), campaignId: z.uuid().optional() })
  .refine((v) => !v.from || limaDayStartIso(v.from), { message: "Fecha 'desde' inválida.", path: ["from"] })
  .refine((v) => !v.to || limaDayEndExclusiveIso(v.to), { message: "Fecha 'hasta' inválida.", path: ["to"] })
  .refine((v) => !v.from || !v.to || v.from <= v.to, { message: "'Desde' no puede ser posterior a 'hasta'.", path: ["from"] });

export type ReportFilters = z.infer<typeof reportFilters>;

analyticsRoutes.get("/campaigns", async (c) => {
  const r = await c.env.DB.prepare("SELECT id, name FROM campaigns ORDER BY created_at DESC").all<{ id: string; name: string }>();
  return c.json({ campaigns: r.results });
});

export interface Report {
  filters: { from: string | null; to: string | null; campaignId: string | null };
  inventory: Record<CouponState, number> & { issued: number; redemptionRate: number | null };
  redemptionsInRange: number;
  byDay: { date: string; count: number }[];
  byWeek: { weekStart: string; count: number }[];
  byMonth: { month: string; count: number }[];
  byHour: { hour: number; count: number }[];
  byCampaign: { campaignId: string; name: string; issued: number; redeemed: number; redemptionRate: number | null }[];
}

export async function buildReport(db: D1Database, now: Date, f: ReportFilters): Promise<Report> {
  const fromIso = f.from ? limaDayStartIso(f.from) : null;
  const toIso = f.to ? limaDayEndExclusiveIso(f.to) : null;

  // Cohorte de inventario: cupones EMITIDOS (created_at) dentro del rango y de la campaña.
  // Cada consulta arma sus propios parámetros: D1 rechaza bindings que el SQL no usa.
  const invFrom = (q: Q) => {
    const where = ["1 = 1"];
    if (f.campaignId) where.push(`c.campaign_id = ${q.p(f.campaignId)}`);
    if (fromIso) where.push(`c.created_at >= ${q.p(fromIso)}`);
    if (toIso) where.push(`c.created_at < ${q.p(toIso)}`);
    return `FROM coupons c JOIN campaigns ca ON ca.id = c.campaign_id WHERE ${where.join(" AND ")}`;
  };
  const stateQ = new Q();
  const nowP = stateQ.p(now.toISOString());
  const stateSql = `SELECT ${effectiveStatusSql(nowP)} AS k, COUNT(*) AS n ${invFrom(stateQ)} GROUP BY k`;
  const campQ = new Q();
  const campSql = `SELECT ca.id AS campaignId, ca.name, COUNT(*) AS issued, SUM(CASE WHEN c.status = 'redeemed' THEN 1 ELSE 0 END) AS redeemed
           ${invFrom(campQ)} GROUP BY ca.id, ca.name ORDER BY issued DESC, ca.name`;

  // Actividad: canjes realizados (redeemed_at) dentro del rango y de la campaña.
  const act = new Q();
  const actWhere = ["1 = 1"];
  if (f.campaignId) actWhere.push(`r.campaign_id = ${act.p(f.campaignId)}`);
  if (fromIso) actWhere.push(`r.redeemed_at >= ${act.p(fromIso)}`);
  if (toIso) actWhere.push(`r.redeemed_at < ${act.p(toIso)}`);
  const actFrom = `FROM redemptions r WHERE ${actWhere.join(" AND ")}`;
  const lima = "r.redeemed_at, '-5 hours'";

  const [byState, byCampaign, total, day, week, month, hour] = await db.batch([
    db.prepare(stateSql).bind(...stateQ.params),
    db.prepare(campSql).bind(...campQ.params),
    db.prepare(`SELECT COUNT(*) AS n ${actFrom}`).bind(...act.params),
    db.prepare(`SELECT strftime('%Y-%m-%d', ${lima}) AS k, COUNT(*) AS n ${actFrom} GROUP BY k ORDER BY k`).bind(...act.params),
    db
      .prepare(`SELECT date(${lima}, '-6 days', 'weekday 1') AS k, COUNT(*) AS n ${actFrom} GROUP BY k ORDER BY k`)
      .bind(...act.params),
    db.prepare(`SELECT strftime('%Y-%m', ${lima}) AS k, COUNT(*) AS n ${actFrom} GROUP BY k ORDER BY k`).bind(...act.params),
    db.prepare(`SELECT strftime('%H', ${lima}) AS k, COUNT(*) AS n ${actFrom} GROUP BY k`).bind(...act.params),
  ]);

  const counts = Object.fromEntries(STATE_ORDER.map((s) => [s, 0])) as Record<CouponState, number>;
  for (const r of (byState?.results ?? []) as { k: CouponState; n: number }[]) counts[r.k] = r.n;
  const issued = STATE_ORDER.reduce((sum, s) => sum + counts[s], 0);

  const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0 }));
  for (const r of (hour?.results ?? []) as { k: string; n: number }[]) hours[Number(r.k)]!.count = r.n;

  const rate = (redeemed: number, total: number) => (total > 0 ? redeemed / total : null);
  return {
    filters: { from: f.from ?? null, to: f.to ?? null, campaignId: f.campaignId ?? null },
    inventory: { ...counts, issued, redemptionRate: rate(counts.redeemed, issued) },
    redemptionsInRange: ((total?.results[0] as { n: number } | undefined)?.n) ?? 0,
    byDay: ((day?.results ?? []) as { k: string; n: number }[]).map((r) => ({ date: r.k, count: r.n })),
    byWeek: ((week?.results ?? []) as { k: string; n: number }[]).map((r) => ({ weekStart: r.k, count: r.n })),
    byMonth: ((month?.results ?? []) as { k: string; n: number }[]).map((r) => ({ month: r.k, count: r.n })),
    byHour: hours,
    byCampaign: ((byCampaign?.results ?? []) as { campaignId: string; name: string; issued: number; redeemed: number }[]).map((r) => ({
      ...r,
      redemptionRate: rate(r.redeemed, r.issued),
    })),
  };
}

analyticsRoutes.get("/report", async (c) => {
  const filters = parse(reportFilters, Object.fromEntries(new URL(c.req.url).searchParams));
  return c.json(await buildReport(c.env.DB, c.get("now"), filters));
});
