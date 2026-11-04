// Bitácora append-only. REGLA: `details` solo lleva identificadores internos, conteos y
// motivos de negocio. Nunca contraseñas, tokens, códigos de cupón ni datos personales.

export interface AuditEntry {
  actorUserId: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  details?: Record<string, string | number | boolean | null>;
}

export function auditStatement(db: D1Database, at: string, e: AuditEntry): D1PreparedStatement {
  return db
    .prepare(
      "INSERT INTO audit_logs (at, actor_user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(at, e.actorUserId, e.action, e.entityType ?? null, e.entityId ?? null, e.details ? JSON.stringify(e.details) : null);
}

export async function audit(db: D1Database, at: string, e: AuditEntry): Promise<void> {
  await auditStatement(db, at, e).run();
}
