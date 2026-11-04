-- Shimaya Cupones — esquema inicial.
-- Convenciones:
--  * Todas las marcas de tiempo son texto ISO-8601 en UTC con milisegundos y sufijo Z
--    (p. ej. 2026-10-24T22:30:00.000Z). Ese formato ordena igual como texto que como fecha.
--    La zona America/Lima solo se aplica al mostrar (ver src/shared/time.ts).
--  * Los códigos de cupón son TEXT para conservar ceros iniciales.
--  * D1 aplica las claves foráneas por defecto.

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name  TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('validador', 'moderador', 'analista')),
  password_hash TEXT NOT NULL,
  active        INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_login_at TEXT
);

-- El id de la sesión es el SHA-256 del token que vive en la cookie: un volcado de la
-- base no permite suplantar sesiones.
CREATE TABLE sessions (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at   TEXT NOT NULL,
  expires_at   TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions (user_id);
CREATE INDEX idx_sessions_expires ON sessions (expires_at);

CREATE TABLE campaigns (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  description TEXT NOT NULL DEFAULT '',
  benefit     TEXT NOT NULL,
  -- Vigencia: starts_at inclusivo, ends_at EXCLUSIVO (instante en que deja de valer).
  starts_at   TEXT NOT NULL,
  ends_at     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  code_length INTEGER NOT NULL DEFAULT 8 CHECK (code_length BETWEEN 4 AND 16),
  created_by  TEXT REFERENCES users (id),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (ends_at > starts_at)
);

CREATE TABLE import_batches (
  id            TEXT PRIMARY KEY,
  campaign_id   TEXT NOT NULL REFERENCES campaigns (id),
  uploaded_by   TEXT NOT NULL REFERENCES users (id),
  mode          TEXT NOT NULL CHECK (mode IN ('todo_o_nada', 'parcial')),
  total_rows    INTEGER NOT NULL,
  imported_rows INTEGER NOT NULL,
  rejected_rows INTEGER NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE TABLE import_errors (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id   TEXT NOT NULL REFERENCES import_batches (id),
  row_number INTEGER NOT NULL,
  code       TEXT,
  message    TEXT NOT NULL
);
CREATE INDEX idx_import_errors_batch ON import_errors (batch_id);

-- Estado ALMACENADO del cupón: solo available | redeemed | voided.
-- El estado EFECTIVO (vencido, campaña no disponible…) se calcula con la vigencia de la
-- campaña; ver src/worker/status.ts.
CREATE TABLE coupons (
  id              TEXT PRIMARY KEY,
  code            TEXT NOT NULL UNIQUE
                  CHECK (length(code) BETWEEN 4 AND 16 AND code NOT GLOB '*[^0-9]*'),
  campaign_id     TEXT NOT NULL REFERENCES campaigns (id),
  status          TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'redeemed', 'voided')),
  void_reason     TEXT,
  voided_at       TEXT,
  voided_by       TEXT REFERENCES users (id),
  import_batch_id TEXT REFERENCES import_batches (id),
  created_by      TEXT REFERENCES users (id),
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK ((status = 'voided') = (void_reason IS NOT NULL AND voided_at IS NOT NULL))
);
CREATE INDEX idx_coupons_campaign_status ON coupons (campaign_id, status);
CREATE INDEX idx_coupons_created ON coupons (created_at);

CREATE TABLE redemptions (
  id              TEXT PRIMARY KEY,
  -- UNIQUE: un cupón solo se canjea una vez, garantizado por la base de datos.
  coupon_id       TEXT NOT NULL UNIQUE REFERENCES coupons (id),
  campaign_id     TEXT NOT NULL REFERENCES campaigns (id),
  redeemed_by     TEXT NOT NULL REFERENCES users (id),
  redeemed_at     TEXT NOT NULL,
  -- Un reintento del mismo envío (misma clave) nunca crea un segundo canje.
  idempotency_key TEXT NOT NULL,
  UNIQUE (redeemed_by, idempotency_key)
);
CREATE INDEX idx_redemptions_at ON redemptions (redeemed_at);
CREATE INDEX idx_redemptions_campaign_at ON redemptions (campaign_id, redeemed_at);
CREATE INDEX idx_redemptions_worker_at ON redemptions (redeemed_by, redeemed_at);

-- Datos personales: viven SOLO aquí y en marketing_consents; las consultas analíticas
-- nunca los tocan. No se fusionan personas por teléfono/correo compartido: cada
-- registro con consentimiento crea su propio contacto (ver docs/ROLES_Y_PERMISOS.md).
CREATE TABLE customer_contacts (
  id         TEXT PRIMARY KEY,
  first_name TEXT,
  last_name  TEXT,
  phone      TEXT,
  email      TEXT,
  created_at TEXT NOT NULL,
  CHECK (phone IS NOT NULL OR email IS NOT NULL)
);

CREATE TABLE marketing_consents (
  id                  TEXT PRIMARY KEY,
  contact_id          TEXT NOT NULL REFERENCES customer_contacts (id),
  -- UNIQUE: un canje registra como máximo un contacto promocional (idempotencia).
  redemption_id       TEXT NOT NULL UNIQUE REFERENCES redemptions (id),
  consent_text_version TEXT NOT NULL,
  consent_text        TEXT NOT NULL,
  consented_at        TEXT NOT NULL,
  recorded_by         TEXT NOT NULL REFERENCES users (id)
);
CREATE INDEX idx_consents_contact ON marketing_consents (contact_id);
CREATE INDEX idx_consents_at ON marketing_consents (consented_at);

-- Bitácora append-only. details NUNCA lleva contraseñas, tokens, códigos de cupón ni
-- datos personales: solo identificadores internos y conteos.
CREATE TABLE audit_logs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  at            TEXT NOT NULL,
  actor_user_id TEXT REFERENCES users (id),
  action        TEXT NOT NULL,
  entity_type   TEXT,
  entity_id     TEXT,
  details       TEXT CHECK (details IS NULL OR json_valid(details))
);
CREATE INDEX idx_audit_at ON audit_logs (at);
CREATE INDEX idx_audit_action_at ON audit_logs (action, at);
CREATE INDEX idx_audit_actor_at ON audit_logs (actor_user_id, at);

-- Contadores de ventana fija para límites de intentos.
CREATE TABLE rate_limits (
  key          TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL
);

-- ---------------------------------------------------------------------------
-- Guardas a nivel de base de datos (defensa en profundidad: valen aunque algún
-- código futuro intente saltarse las reglas de la aplicación).
-- ---------------------------------------------------------------------------

-- Un cupón canjeado o anulado nunca vuelve a "available" ni cambia a otro estado.
CREATE TRIGGER coupons_estado_inmutable
BEFORE UPDATE OF status ON coupons
WHEN OLD.status <> 'available' AND NEW.status <> OLD.status
BEGIN
  SELECT RAISE(ABORT, 'estado_de_cupon_inmutable');
END;

CREATE TRIGGER coupons_datos_inmutables
BEFORE UPDATE OF code, campaign_id ON coupons
BEGIN
  SELECT RAISE(ABORT, 'cupon_inmutable');
END;

CREATE TRIGGER coupons_sin_borrado
BEFORE DELETE ON coupons
WHEN OLD.status <> 'available'
BEGIN
  SELECT RAISE(ABORT, 'cupon_no_borrable');
END;

-- Solo se puede canjear un cupón disponible; al insertar el canje, el cambio de estado
-- ocurre dentro de la misma sentencia (atómico con la creación del canje).
CREATE TRIGGER redemptions_exige_cupon_disponible
BEFORE INSERT ON redemptions
WHEN (SELECT status FROM coupons WHERE id = NEW.coupon_id) <> 'available'
BEGIN
  SELECT RAISE(ABORT, 'cupon_no_disponible');
END;

CREATE TRIGGER redemptions_marca_cupon
AFTER INSERT ON redemptions
BEGIN
  UPDATE coupons
     SET status = 'redeemed', updated_at = NEW.redeemed_at
   WHERE id = NEW.coupon_id AND status = 'available';
END;

CREATE TRIGGER redemptions_sin_update
BEFORE UPDATE ON redemptions
BEGIN
  SELECT RAISE(ABORT, 'canje_inmutable');
END;

CREATE TRIGGER redemptions_sin_borrado
BEFORE DELETE ON redemptions
BEGIN
  SELECT RAISE(ABORT, 'canje_inmutable');
END;

CREATE TRIGGER consents_sin_update
BEFORE UPDATE ON marketing_consents
BEGIN
  SELECT RAISE(ABORT, 'consentimiento_inmutable');
END;

CREATE TRIGGER audit_sin_update
BEFORE UPDATE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'auditoria_inmutable');
END;

CREATE TRIGGER audit_sin_borrado
BEFORE DELETE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'auditoria_inmutable');
END;
