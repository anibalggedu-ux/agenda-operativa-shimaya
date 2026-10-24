import { Hono } from "hono";
import { z } from "zod";
import { MAX_IMPORT_ROWS, parseCouponCsv, type ImportRow } from "../../shared/csv";
import { limaDayEndExclusiveIso, limaDayStartIso } from "../../shared/time";
import { STATE_ORDER, type CouponState } from "../../shared/types";
import { campaignInputSchema, codeProblem, codeSchema } from "../../shared/validation";
import { auditStatement } from "../audit";
import { requireRole } from "../auth";
import { ApiError, type AppEnv, type Ctx, Q, pageParams, parse, readJson } from "../http";
import { effectiveStatusSql } from "../status";
import { newId } from "../util";
import { buildReport } from "./analytics";

export const adminRoutes = new Hono<AppEnv>();
adminRoutes.use("*", requireRole("moderador"));

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida.");
const dateRange = z.object({ from: ymd.optional(), to: ymd.optional() });
const query = (c: Ctx) => Object.fromEntries(new URL(c.req.url).searchParams);

function rangeIso(f: { from?: string; to?: string }) {
  const from = f.from ? limaDayStartIso(f.from) : null;
  const to = f.to ? limaDayEndExclusiveIso(f.to) : null;
  if ((f.from && !from) || (f.to && !to)) throw new ApiError(422, "validation", "Fecha inválida.", { fieldErrors: { from: "Fecha inválida." } });
  return { from, to };
}

async function paged<T>(db: D1Database, select: string, from: string, q: Q, order: string, page: number, pageSize: number) {
  const [count, rows] = await db.batch([
    db.prepare(`SELECT COUNT(*) AS n ${from}`).bind(...q.params),
    db.prepare(`${select} ${from} ORDER BY ${order} LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`).bind(...q.params),
  ]);
  return {
    items: (rows?.results ?? []) as T[],
    total: ((count?.results[0] as { n: number } | undefined)?.n) ?? 0,
    page,
    pageSize,
  };
}

// --- Resumen ------------------------------------------------------------------------------------
adminRoutes.get("/overview", async (c) => {
  const now = c.get("now");
  const report = await buildReport(c.env.DB, now, {});
  const contacts = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM marketing_consents").first<{ n: number }>();
  const last7 = limaDayStartIso(new Date(now.getTime() - 5 * 3600_000 - 6 * 86400_000).toISOString().slice(0, 10)) ?? "";
  const today = limaDayStartIso(new Date(now.getTime() - 5 * 3600_000).toISOString().slice(0, 10)) ?? "";
  const rows = await c.env.DB.batch([
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM redemptions WHERE redeemed_at >= ?").bind(today),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM redemptions WHERE redeemed_at >= ?").bind(last7),
  ]);
  return c.json({
    inventory: report.inventory,
    redemptionsToday: (rows[0]?.results[0] as { n: number }).n,
    redemptionsLast7Days: (rows[1]?.results[0] as { n: number }).n,
    consentedContacts: contacts?.n ?? 0,
  });
});

adminRoutes.get("/workers", async (c) => {
  const r = await c.env.DB.prepare("SELECT id, display_name AS name FROM users WHERE role = 'validador' ORDER BY display_name").all();
  return c.json({ workers: r.results });
});

// --- Canjes (historial paginado) --------------------------------------------------------------------
const redemptionFilters = dateRange.extend({
  campaignId: z.uuid().optional(),
  workerId: z.uuid().optional(),
  contact: z.enum(["con", "sin"]).optional(),
});

adminRoutes.get("/redemptions", async (c) => {
  const f = parse(redemptionFilters.extend(pageParams.shape), query(c));
  const { from, to } = rangeIso(f);
  const q = new Q();
  const where = ["1 = 1"];
  if (f.campaignId) where.push(`r.campaign_id = ${q.p(f.campaignId)}`);
  if (f.workerId) where.push(`r.redeemed_by = ${q.p(f.workerId)}`);
  if (from) where.push(`r.redeemed_at >= ${q.p(from)}`);
  if (to) where.push(`r.redeemed_at < ${q.p(to)}`);
  if (f.contact === "con") where.push("mc.id IS NOT NULL");
  if (f.contact === "sin") where.push("mc.id IS NULL");
  const data = await paged<Record<string, unknown>>(
    c.env.DB,
    `SELECT r.id, r.redeemed_at AS redeemedAt, c.code, ca.name AS campaign, u.display_name AS worker,
            cc.first_name AS firstName, cc.last_name AS lastName, cc.phone, cc.email, mc.consented_at AS consentedAt`,
    `FROM redemptions r
       JOIN coupons c ON c.id = r.coupon_id
       JOIN campaigns ca ON ca.id = r.campaign_id
       JOIN users u ON u.id = r.redeemed_by
       LEFT JOIN marketing_consents mc ON mc.redemption_id = r.id
       LEFT JOIN customer_contacts cc ON cc.id = mc.contact_id
      WHERE ${where.join(" AND ")}`,
    q,
    "r.redeemed_at DESC, r.id",
    f.page,
    f.pageSize,
  );
  return c.json(data);
});

// --- Clientes que autorizaron promociones -------------------------------------------------------------
adminRoutes.get("/clients", async (c) => {
  const f = parse(dateRange.extend({ campaignId: z.uuid().optional(), workerId: z.uuid().optional() }).extend(pageParams.shape), query(c));
  const { from, to } = rangeIso(f);
  const q = new Q();
  const where = ["1 = 1"];
  if (f.campaignId) where.push(`r.campaign_id = ${q.p(f.campaignId)}`);
  if (f.workerId) where.push(`r.redeemed_by = ${q.p(f.workerId)}`);
  if (from) where.push(`mc.consented_at >= ${q.p(from)}`);
  if (to) where.push(`mc.consented_at < ${q.p(to)}`);
  return c.json(
    await paged(
      c.env.DB,
      `SELECT mc.id, cc.first_name AS firstName, cc.last_name AS lastName, cc.phone, cc.email,
              mc.consented_at AS consentedAt, mc.consent_text_version AS consentVersion,
              ca.name AS campaign, u.display_name AS worker`,
      `FROM marketing_consents mc
         JOIN customer_contacts cc ON cc.id = mc.contact_id
         JOIN redemptions r ON r.id = mc.redemption_id
         JOIN campaigns ca ON ca.id = r.campaign_id
         JOIN users u ON u.id = mc.recorded_by
        WHERE ${where.join(" AND ")}`,
      q,
      "mc.consented_at DESC, mc.id",
      f.page,
      f.pageSize,
    ),
  );
});

// --- Campañas -------------------------------------------------------------------------------------------
adminRoutes.get("/campaigns", async (c) => {
  const r = await c.env.DB.prepare(
    `SELECT ca.id, ca.name, ca.description, ca.benefit, ca.starts_at AS startsAt, ca.ends_at AS endsAt, ca.status,
            ca.code_length AS codeLength, ca.created_at AS createdAt,
            (SELECT COUNT(*) FROM coupons c WHERE c.campaign_id = ca.id) AS coupons,
            (SELECT COUNT(*) FROM coupons c WHERE c.campaign_id = ca.id AND c.status = 'redeemed') AS redeemed
       FROM campaigns ca ORDER BY ca.created_at DESC`,
  ).all();
  return c.json({ campaigns: r.results });
});

adminRoutes.post("/campaigns", async (c) => {
  const v = parse(campaignInputSchema, await readJson(c));
  const user = c.get("user");
  const t = c.get("now").toISOString();
  const id = newId();
  try {
    await c.env.DB.batch([
      c.env.DB
        .prepare(
          `INSERT INTO campaigns (id, name, description, benefit, starts_at, ends_at, status, code_length, created_by, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)`,
        )
        .bind(id, v.name, v.description, v.benefit, new Date(v.startsAt).toISOString(), new Date(v.endsAt).toISOString(), v.status, v.codeLength, user.id, t),
      auditStatement(c.env.DB, t, { actorUserId: user.id, action: "campaign_created", entityType: "campaign", entityId: id }),
    ]);
  } catch {
    throw new ApiError(409, "campaign_name_taken", "Ya existe una campaña con ese nombre.", { fieldErrors: { name: "Ya existe una campaña con ese nombre." } });
  }
  return c.json({ id }, 201);
});

adminRoutes.patch("/campaigns/:id", async (c) => {
  const id = parse(z.object({ id: z.uuid() }), { id: c.req.param("id") }).id;
  const v = parse(campaignInputSchema, await readJson(c));
  const db = c.env.DB;
  const current = await db.prepare("SELECT code_length AS codeLength FROM campaigns WHERE id = ?").bind(id).first<{ codeLength: number }>();
  if (!current) throw new ApiError(404, "not_found", "No encontramos esa campaña.");
  if (current.codeLength !== v.codeLength) {
    const has = await db.prepare("SELECT 1 AS x FROM coupons WHERE campaign_id = ? LIMIT 1").bind(id).first();
    if (has) {
      throw new ApiError(409, "code_length_locked", "No se puede cambiar la longitud del código porque la campaña ya tiene cupones.", {
        fieldErrors: { codeLength: "Ya hay cupones con la longitud actual." },
      });
    }
  }
  const user = c.get("user");
  const t = c.get("now").toISOString();
  try {
    await db.batch([
      db
        .prepare(
          `UPDATE campaigns SET name = ?2, description = ?3, benefit = ?4, starts_at = ?5, ends_at = ?6, status = ?7, code_length = ?8, updated_at = ?9
            WHERE id = ?1`,
        )
        .bind(id, v.name, v.description, v.benefit, new Date(v.startsAt).toISOString(), new Date(v.endsAt).toISOString(), v.status, v.codeLength, t),
      auditStatement(db, t, { actorUserId: user.id, action: "campaign_updated", entityType: "campaign", entityId: id, details: { status: v.status } }),
    ]);
  } catch {
    throw new ApiError(409, "campaign_name_taken", "Ya existe una campaña con ese nombre.", { fieldErrors: { name: "Ya existe una campaña con ese nombre." } });
  }
  return c.json({ ok: true });
});

// --- Cupones --------------------------------------------------------------------------------------------
// Búsqueda por POST: el código de un cupón nunca viaja en la URL.
const couponSearch = z
  .object({
    campaignId: z.uuid().optional(),
    state: z.enum(STATE_ORDER as [CouponState, ...CouponState[]]).optional(),
    code: z.string().trim().regex(/^\d{1,16}$/, "Solo números.").optional(),
  })
  .extend(pageParams.shape);

adminRoutes.post("/coupons/search", async (c) => {
  const f = parse(couponSearch, await readJson(c));
  const q = new Q();
  const nowP = q.p(c.get("now").toISOString());
  const eff = effectiveStatusSql(nowP);
  const where = ["1 = 1"];
  if (f.campaignId) where.push(`c.campaign_id = ${q.p(f.campaignId)}`);
  if (f.state) where.push(`(${eff}) = ${q.p(f.state)}`);
  if (f.code) where.push(`c.code LIKE ${q.p(`${f.code}%`)}`);
  return c.json(
    await paged(
      c.env.DB,
      `SELECT c.id, c.code, ca.name AS campaign, ${eff} AS state, c.created_at AS createdAt,
              c.void_reason AS voidReason, c.voided_at AS voidedAt, r.redeemed_at AS redeemedAt`,
      `FROM coupons c JOIN campaigns ca ON ca.id = c.campaign_id LEFT JOIN redemptions r ON r.coupon_id = c.id
        WHERE ${where.join(" AND ")}`,
      q,
      "c.created_at DESC, c.id",
      f.page,
      f.pageSize,
    ),
  );
});

adminRoutes.post("/coupons", async (c) => {
  const v = parse(z.object({ campaignId: z.uuid(), code: codeSchema }).strict(), await readJson(c));
  const db = c.env.DB;
  const campaign = await db.prepare("SELECT code_length AS codeLength FROM campaigns WHERE id = ?").bind(v.campaignId).first<{ codeLength: number }>();
  if (!campaign) throw new ApiError(404, "not_found", "No encontramos esa campaña.");
  const problem = codeProblem(v.code, campaign.codeLength);
  if (problem) throw new ApiError(422, "validation", problem, { fieldErrors: { code: problem } });
  const user = c.get("user");
  const t = c.get("now").toISOString();
  const id = newId();
  try {
    await db.batch([
      db
        .prepare("INSERT INTO coupons (id, code, campaign_id, created_by, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)")
        .bind(id, v.code, v.campaignId, user.id, t),
      auditStatement(db, t, { actorUserId: user.id, action: "coupon_created", entityType: "coupon", entityId: id }),
    ]);
  } catch {
    throw new ApiError(409, "code_exists", "Ese código ya existe. Los códigos son únicos en toda la aplicación.", {
      fieldErrors: { code: "Ese código ya existe." },
    });
  }
  return c.json({ id }, 201);
});

adminRoutes.post("/coupons/:id/void", async (c) => {
  const id = parse(z.object({ id: z.uuid() }), { id: c.req.param("id") }).id;
  const { reason } = parse(z.object({ reason: z.string().trim().min(3, "Indica el motivo de la anulación.").max(300) }).strict(), await readJson(c));
  const db = c.env.DB;
  const user = c.get("user");
  const t = c.get("now").toISOString();
  // Condicional atómico: solo se anula si sigue 'available' (un cupón canjeado jamás se revierte).
  const res = await db.batch([
    db
      .prepare(
        `UPDATE coupons SET status = 'voided', void_reason = ?2, voided_at = ?3, voided_by = ?4, updated_at = ?3
          WHERE id = ?1 AND status = 'available'`,
      )
      .bind(id, reason, t, user.id),
    db
      .prepare(
        `INSERT INTO audit_logs (at, actor_user_id, action, entity_type, entity_id, details)
         SELECT ?2, ?3, 'coupon_voided', 'coupon', ?1, ?4
          WHERE EXISTS (SELECT 1 FROM coupons WHERE id = ?1 AND status = 'voided' AND voided_at = ?2 AND voided_by = ?3)`,
      )
      .bind(id, t, user.id, JSON.stringify({ reason })),
  ]);
  if ((res[0]?.meta.changes ?? 0) === 0) {
    const row = await db.prepare("SELECT status FROM coupons WHERE id = ?").bind(id).first<{ status: string }>();
    if (!row) throw new ApiError(404, "not_found", "No encontramos ese cupón.");
    throw new ApiError(
      409,
      "not_voidable",
      row.status === "redeemed" ? "No se puede anular un cupón que ya fue canjeado." : "Ese cupón ya estaba anulado.",
    );
  }
  return c.json({ ok: true });
});

// --- Importación CSV ------------------------------------------------------------------------------------
const importBody = z
  .object({
    campaignId: z.uuid(),
    csv: z.string().min(1, "Pega o carga el contenido del CSV.").max(400_000),
    mode: z.enum(["todo_o_nada", "parcial"]).default("todo_o_nada"),
  })
  .strict();

const MAX_STORED_ERRORS = 200;

interface Analysis {
  campaignId: string;
  rows: (ImportRow & { error: string | null })[];
  total: number;
  validCodes: string[];
  errors: { rowNumber: number; code: string; error: string }[];
}

async function analyzeImport(db: D1Database, campaignId: string, csv: string): Promise<Analysis> {
  const campaign = await db.prepare("SELECT code_length AS codeLength FROM campaigns WHERE id = ?").bind(campaignId).first<{ codeLength: number }>();
  if (!campaign) throw new ApiError(404, "not_found", "No encontramos esa campaña.");
  const { rows, tooManyRows } = parseCouponCsv(csv, campaign.codeLength);
  if (tooManyRows) {
    throw new ApiError(422, "too_many_rows", `El archivo supera el máximo de ${MAX_IMPORT_ROWS} filas por importación. Divídelo en varios.`);
  }
  if (rows.length === 0) throw new ApiError(422, "empty_file", "El archivo no tiene códigos.");
  // Duplicados contra la base de datos (nunca se sobrescribe un cupón existente).
  const candidates = rows.filter((r) => !r.error).map((r) => r.code);
  const existing = new Set<string>();
  if (candidates.length > 0) {
    const r = await db
      .prepare("SELECT code FROM coupons WHERE code IN (SELECT value FROM json_each(?1))")
      .bind(JSON.stringify(candidates))
      .all<{ code: string }>();
    for (const row of r.results) existing.add(row.code);
  }
  for (const r of rows) if (!r.error && existing.has(r.code)) r.error = "Ese código ya existe en la base de datos.";
  return {
    campaignId,
    rows,
    total: rows.length,
    validCodes: rows.filter((r) => !r.error).map((r) => r.code),
    errors: rows.filter((r) => r.error).map((r) => ({ rowNumber: r.rowNumber, code: r.code, error: r.error! })),
  };
}

const summarize = (a: Analysis) => ({
  total: a.total,
  valid: a.validCodes.length,
  invalid: a.errors.length,
  errors: a.errors.slice(0, 100),
  errorsTruncated: a.errors.length > 100,
});

adminRoutes.post("/imports/preview", async (c) => {
  const b = parse(importBody, await readJson(c));
  return c.json(summarize(await analyzeImport(c.env.DB, b.campaignId, b.csv)));
});

adminRoutes.post("/imports/confirm", async (c) => {
  const b = parse(importBody, await readJson(c));
  const db = c.env.DB;
  const user = c.get("user");
  const t = c.get("now").toISOString();
  // El servidor vuelve a validar todo: no confía en la vista previa que armó el navegador.
  const a = await analyzeImport(db, b.campaignId, b.csv);
  const batchId = newId();
  const rejectAll = b.mode === "todo_o_nada" && a.errors.length > 0;
  const toInsert = rejectAll ? [] : a.validCodes;
  const stored = a.errors.slice(0, MAX_STORED_ERRORS).map((e) => ({ r: e.rowNumber, c: e.code.slice(0, 32), m: e.error.slice(0, 120) }));

  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO import_batches (id, campaign_id, uploaded_by, mode, total_rows, imported_rows, rejected_rows, created_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
        )
        .bind(batchId, b.campaignId, user.id, b.mode, a.total, toInsert.length, a.total - toInsert.length, t),
      db
        .prepare(
          `INSERT INTO import_errors (batch_id, row_number, code, message)
           SELECT ?1, json_extract(value, '$.r'), json_extract(value, '$.c'), json_extract(value, '$.m') FROM json_each(?2)`,
        )
        .bind(batchId, JSON.stringify(stored)),
      db
        .prepare(
          `INSERT INTO coupons (id, code, campaign_id, status, import_batch_id, created_by, created_at, updated_at)
           SELECT lower(hex(randomblob(16))), value, ?1, 'available', ?2, ?3, ?4, ?4 FROM json_each(?5)`,
        )
        .bind(b.campaignId, batchId, user.id, t, JSON.stringify(toInsert)),
      auditStatement(db, t, {
        actorUserId: user.id,
        action: rejectAll ? "import_rejected" : "import_completed",
        entityType: "import_batch",
        entityId: batchId,
        details: { mode: b.mode, total: a.total, imported: toInsert.length, rejected: a.total - toInsert.length },
      }),
    ]);
  } catch {
    // Otro usuario creó un código del archivo entre la vista previa y la confirmación: no se escribió nada.
    throw new ApiError(409, "import_conflict", "Algunos códigos cambiaron mientras confirmabas. No se importó nada; vuelve a generar la vista previa.");
  }

  if (rejectAll) {
    throw new ApiError(422, "import_rejected", "El archivo tiene errores y el modo 'todo o nada' no importó ningún cupón.", {
      batchId,
      ...summarize(a),
      imported: 0,
    });
  }
  return c.json({ batchId, imported: toInsert.length, ...summarize(a) }, 201);
});

adminRoutes.get("/imports", async (c) => {
  const f = parse(z.object(pageParams.shape), query(c));
  const q = new Q();
  return c.json(
    await paged(
      c.env.DB,
      `SELECT b.id, b.created_at AS createdAt, b.mode, b.total_rows AS total, b.imported_rows AS imported, b.rejected_rows AS rejected,
              ca.name AS campaign, u.display_name AS uploadedBy`,
      "FROM import_batches b JOIN campaigns ca ON ca.id = b.campaign_id JOIN users u ON u.id = b.uploaded_by",
      q,
      "b.created_at DESC, b.id",
      f.page,
      f.pageSize,
    ),
  );
});

adminRoutes.get("/imports/:id/errors", async (c) => {
  const id = parse(z.object({ id: z.string().regex(/^[0-9a-f-]{32,36}$/) }), { id: c.req.param("id") }).id;
  const r = await c.env.DB.prepare("SELECT row_number AS rowNumber, code, message FROM import_errors WHERE batch_id = ? ORDER BY row_number").bind(id).all();
  return c.json({ errors: r.results });
});

// --- Auditoría ------------------------------------------------------------------------------------------
adminRoutes.get("/audit", async (c) => {
  const f = parse(dateRange.extend({ action: z.string().max(60).optional(), actorId: z.uuid().optional() }).extend(pageParams.shape), query(c));
  const { from, to } = rangeIso(f);
  const q = new Q();
  const where = ["1 = 1"];
  if (f.action) where.push(`a.action = ${q.p(f.action)}`);
  if (f.actorId) where.push(`a.actor_user_id = ${q.p(f.actorId)}`);
  if (from) where.push(`a.at >= ${q.p(from)}`);
  if (to) where.push(`a.at < ${q.p(to)}`);
  const data = await paged<Record<string, unknown> & { details: string | null }>(
    c.env.DB,
    `SELECT a.id, a.at, a.action, a.entity_type AS entityType, a.entity_id AS entityId, a.details, u.display_name AS actor`,
    `FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_user_id WHERE ${where.join(" AND ")}`,
    q,
    "a.id DESC",
    f.page,
    f.pageSize,
  );
  return c.json({ ...data, items: data.items.map((i) => ({ ...i, details: i.details ? JSON.parse(i.details) : null })) });
});

adminRoutes.get("/audit/actions", async (c) => {
  const r = await c.env.DB.prepare("SELECT DISTINCT action FROM audit_logs ORDER BY action").all<{ action: string }>();
  return c.json({ actions: r.results.map((x) => x.action) });
});

