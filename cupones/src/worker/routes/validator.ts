import { Hono } from "hono";
import { z } from "zod";
import { CONSENT_TEXTS } from "../../shared/consent";
import { STATE_LABELS, type CouponState, type LookupResult } from "../../shared/types";
import { codeSchema, contactInputSchema, idempotencyKeySchema } from "../../shared/validation";
import { audit, auditStatement } from "../audit";
import { requireRole } from "../auth";
import { ApiError, type AppEnv, type Ctx, clientIp, parse, readJson, tooManyRequests } from "../http";
import { LIMITS, hit, isBlocked } from "../ratelimit";
import { effectiveStatusSql } from "../status";
import { newId } from "../util";

/** Tiempo tras el canje durante el cual quien lo hizo puede asociarle datos de contacto. */
export const CONTACT_WINDOW_MS = 30 * 60_000;

export const validatorRoutes = new Hono<AppEnv>();
validatorRoutes.use("*", requireRole("validador"));

interface CouponRow {
  id: string;
  state: CouponState;
  campaign: string;
  benefit: string;
  starts_at: string;
  ends_at: string;
}

async function findCoupon(db: D1Database, code: string, now: string): Promise<CouponRow | null> {
  return db
    .prepare(
      `SELECT c.id, ${effectiveStatusSql("?2")} AS state, ca.name AS campaign, ca.benefit, ca.starts_at, ca.ends_at
         FROM coupons c JOIN campaigns ca ON ca.id = c.campaign_id
        WHERE c.code = ?1`,
    )
    .bind(code, now)
    .first<CouponRow>();
}

/** Freno a adivinar códigos: bloquea si el usuario o la IP acumularon demasiados códigos inexistentes. */
async function assertNotGuessing(c: Ctx): Promise<void> {
  const now = c.get("now");
  const [u, ip] = [
    await isBlocked(c.env.DB, `failcode:user:${c.get("user").id}`, LIMITS.failedCodePerUser, now),
    await isBlocked(c.env.DB, `failcode:ip:${clientIp(c)}`, LIMITS.failedCodePerIp, now),
  ];
  if (!u.allowed || !ip.allowed) throw tooManyRequests(Math.max(u.retryAfterSeconds, ip.retryAfterSeconds));
}

async function recordFailedCode(c: Ctx): Promise<void> {
  const now = c.get("now");
  const [u, ip] = [
    await hit(c.env.DB, `failcode:user:${c.get("user").id}`, LIMITS.failedCodePerUser, now),
    await hit(c.env.DB, `failcode:ip:${clientIp(c)}`, LIMITS.failedCodePerIp, now),
  ];
  if (u.firstBlock || ip.firstBlock) {
    await audit(c.env.DB, now.toISOString(), { actorUserId: c.get("user").id, action: "code_guessing_blocked" });
  }
}

const codeBody = z.object({ code: z.unknown() });

async function readCode(c: Ctx): Promise<string> {
  const body = parse(codeBody, await readJson(c));
  const r = codeSchema.safeParse(body.code);
  if (!r.success) {
    await recordFailedCode(c);
    throw new ApiError(422, "invalid_code", r.error.issues[0]?.message ?? "Código inválido.");
  }
  return r.data;
}

// --- Consultar (NO consume el cupón) ---------------------------------------------------------
validatorRoutes.post("/coupons/lookup", async (c) => {
  const user = c.get("user");
  const now = c.get("now");
  const rl = await hit(c.env.DB, `lookup:user:${user.id}`, LIMITS.lookupPerUser, now);
  if (!rl.allowed) throw tooManyRequests(rl.retryAfterSeconds);
  await assertNotGuessing(c);

  const code = await readCode(c);
  const row = await findCoupon(c.env.DB, code, now.toISOString());
  if (!row) {
    await recordFailedCode(c);
    return c.json<LookupResult>({ state: "not_found", message: STATE_LABELS.not_found });
  }
  // Solo lo necesario para el canje. Jamás datos del cliente que lo usó ni quién/cuándo lo canjeó.
  return c.json<LookupResult>({
    state: row.state,
    message: STATE_LABELS[row.state],
    coupon: { campaign: row.campaign, benefit: row.benefit, validFrom: row.starts_at, validUntil: row.ends_at },
  });
});

// --- Confirmar canje (consume el cupón; atómico e idempotente) ----------------------------------
interface RedemptionView {
  id: string;
  redeemed_at: string;
  campaign: string;
  benefit: string;
  code: string;
}

async function findByKey(db: D1Database, userId: string, key: string): Promise<RedemptionView | null> {
  return db
    .prepare(
      `SELECT r.id, r.redeemed_at, ca.name AS campaign, ca.benefit, c.code
         FROM redemptions r JOIN coupons c ON c.id = r.coupon_id JOIN campaigns ca ON ca.id = r.campaign_id
        WHERE r.redeemed_by = ? AND r.idempotency_key = ?`,
    )
    .bind(userId, key)
    .first<RedemptionView>();
}

function redeemedResponse(c: Ctx, r: RedemptionView, replayed: boolean) {
  return c.json(
    {
      replayed,
      redemption: { id: r.id, redeemedAt: r.redeemed_at, campaign: r.campaign, benefit: r.benefit },
      message: "Cupón canjeado correctamente",
    },
    replayed ? 200 : 201,
  );
}

validatorRoutes.post("/redemptions", async (c) => {
  const user = c.get("user");
  const now = c.get("now");
  const db = c.env.DB;

  const key = parse(z.object({ key: idempotencyKeySchema }), { key: c.req.header("idempotency-key") }).key;
  const rl = await hit(db, `redeem:user:${user.id}`, LIMITS.redeemPerUser, now);
  if (!rl.allowed) throw tooManyRequests(rl.retryAfterSeconds);
  await assertNotGuessing(c);
  const code = await readCode(c);

  // Reintento de un envío ya procesado: devuelve el mismo resultado, sin crear otro canje.
  const prior = await findByKey(db, user.id, key);
  if (prior) {
    if (prior.code !== code) {
      throw new ApiError(422, "idempotency_key_reused", "Esa clave de reintento ya se usó con otro cupón.");
    }
    return redeemedResponse(c, prior, true);
  }

  const id = newId();
  const t = now.toISOString();
  // Una sola sentencia condicional: el INSERT solo produce fila si, EN ESE MOMENTO, el cupón está
  // disponible y su campaña vigente y activa. El trigger `redemptions_marca_cupon` pasa el cupón a
  // 'redeemed' dentro de la misma sentencia, y UNIQUE(coupon_id) impide un segundo canje aunque dos
  // solicitudes lleguen a la vez. El batch de D1 corre como una transacción (todo o nada).
  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO redemptions (id, coupon_id, campaign_id, redeemed_by, redeemed_at, idempotency_key)
           SELECT ?1, c.id, c.campaign_id, ?2, ?3, ?4
             FROM coupons c JOIN campaigns ca ON ca.id = c.campaign_id
            WHERE c.code = ?5 AND ${effectiveStatusSql("?3")} = 'available'`,
        )
        .bind(id, user.id, t, key, code),
      db
        .prepare(
          `INSERT INTO audit_logs (at, actor_user_id, action, entity_type, entity_id)
           SELECT ?1, ?2, 'coupon_redeemed', 'redemption', ?3 WHERE EXISTS (SELECT 1 FROM redemptions WHERE id = ?3)`,
        )
        .bind(t, user.id, id),
    ]);
  } catch (err) {
    // Violación de UNIQUE (otro canje ganó la carrera, o doble envío con la misma clave): se reevalúa abajo.
    console.warn("redeem_conflict", err instanceof Error ? err.message.slice(0, 120) : "unknown");
  }

  // No se confía en contadores de filas (D1 cuenta también lo que tocan los triggers): se comprueba
  // qué quedó guardado para ESTA clave. Si el id es el nuestro, el canje lo hicimos nosotros; si es
  // otro, un envío concurrente con la misma clave se adelantó (se trata como reintento).
  const stored = await findByKey(db, user.id, key);
  if (stored && stored.code === code) return redeemedResponse(c, stored, stored.id !== id);

  // No se canjeó: el cupón no existe o no está disponible. Se informa el motivo real.
  const row = await findCoupon(db, code, t);
  if (!row) {
    await recordFailedCode(c);
    throw new ApiError(404, "not_found", STATE_LABELS.not_found, { state: "not_found" });
  }
  throw new ApiError(409, "coupon_unavailable", row.state === "available" ? "No se pudo canjear. Intenta de nuevo." : STATE_LABELS[row.state], {
    state: row.state,
  });
});

// --- Registro opcional de contacto (paso posterior e independiente del canje) ------------------------
validatorRoutes.post("/redemptions/:id/contact", async (c) => {
  const user = c.get("user");
  const now = c.get("now");
  const db = c.env.DB;
  const redemptionId = parse(z.object({ id: z.uuid() }), { id: c.req.param("id") }).id;

  const input = parse(contactInputSchema, await readJson(c));
  if (!input.consent) {
    throw new ApiError(422, "consent_required", "Para guardar los datos necesitamos que el cliente acepte recibir promociones.", {
      fieldErrors: { consent: "Marca la casilla de consentimiento para continuar." },
    });
  }
  const consentText = CONSENT_TEXTS[input.consentTextVersion];
  if (!consentText) throw new ApiError(422, "consent_version_unknown", "La versión del texto de consentimiento no es válida.");
  if (!input.phone && !input.email) {
    throw new ApiError(422, "contact_required", "Ingresa al menos un teléfono o un correo.", {
      fieldErrors: { contact: "Ingresa al menos un teléfono o un correo." },
    });
  }

  // Solo quien hizo el canje, y poco después de hacerlo. Si no es suyo, se responde igual que si no existiera.
  const red = await db
    .prepare("SELECT redeemed_by, redeemed_at FROM redemptions WHERE id = ?")
    .bind(redemptionId)
    .first<{ redeemed_by: string; redeemed_at: string }>();
  if (!red || red.redeemed_by !== user.id) throw new ApiError(404, "not_found", "No encontramos ese canje.");
  if (now.getTime() - Date.parse(red.redeemed_at) > CONTACT_WINDOW_MS) {
    throw new ApiError(403, "contact_window_closed", "Pasó el tiempo para registrar datos de este canje.");
  }

  const already = () => db.prepare("SELECT id FROM marketing_consents WHERE redemption_id = ?").bind(redemptionId).first();
  if (await already()) return c.json({ saved: true, alreadyRegistered: true });

  const t = now.toISOString();
  const contactId = newId();
  try {
    await db.batch([
      db
        .prepare("INSERT INTO customer_contacts (id, first_name, last_name, phone, email, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(contactId, input.firstName, input.lastName, input.phone, input.email, t),
      db
        .prepare(
          `INSERT INTO marketing_consents (id, contact_id, redemption_id, consent_text_version, consent_text, consented_at, recorded_by)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(newId(), contactId, redemptionId, input.consentTextVersion, consentText, t, user.id),
      auditStatement(db, t, {
        actorUserId: user.id,
        action: "contact_registered",
        entityType: "redemption",
        entityId: redemptionId,
        details: { consent_text_version: input.consentTextVersion },
      }),
    ]);
  } catch (err) {
    // Doble envío concurrente: la restricción UNIQUE(redemption_id) ya dejó un registro.
    if (await already().catch(() => null)) return c.json({ saved: true, alreadyRegistered: true });
    console.error("contact_save_failed", err instanceof Error ? err.message.slice(0, 120) : "unknown");
    throw new ApiError(500, "contact_save_failed", "No pudimos guardar los datos. El canje ya quedó registrado; puedes reintentar u omitir.");
  }
  return c.json({ saved: true, alreadyRegistered: false }, 201);
});
