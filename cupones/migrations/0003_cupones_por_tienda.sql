-- Cupones por tienda: cada tienda tiene su propio juego de códigos (el 0001 de Minka y el 0001 de
-- El Polo son cupones distintos, cada uno canjeable una sola vez).
--
-- `coupons.code` dejaba de poder ser UNIQUE a nivel global, y SQLite no permite quitar esa
-- restricción: se reconstruye la tabla. Se copia a una tabla temporal, se borra `coupons`, se
-- crea con el esquema nuevo y se reinsertan las filas con el mismo nombre de tabla, que es lo que
-- permite que `defer_foreign_keys` cuadre con los canjes que apuntan a los cupones. Los cupones que ya
-- existen quedan con store_id NULL = "sin tienda" (valen en cualquier tienda, como hasta ahora).
-- Unicidad nueva: un código por tienda y campaña (así cada campaña nueva puede volver a usar el 1 al 1000).
-- Además cada tienda puede pertenecer a una zona/sector, para medir las campañas por zona.

ALTER TABLE stores ADD COLUMN zone TEXT CHECK (zone IS NULL OR length(zone) BETWEEN 1 AND 60);

PRAGMA defer_foreign_keys = on;

-- Estos triggers de `redemptions` nombran a `coupons`: se recrean al final, idénticos.
DROP TRIGGER redemptions_exige_cupon_disponible;
DROP TRIGGER redemptions_marca_cupon;

CREATE TABLE coupons_copia AS SELECT * FROM coupons;

DROP TABLE coupons;

CREATE TABLE coupons (
  id              TEXT PRIMARY KEY,
  code            TEXT NOT NULL
                  CHECK (length(code) BETWEEN 4 AND 16 AND code NOT GLOB '*[^0-9]*'),
  campaign_id     TEXT NOT NULL REFERENCES campaigns (id),
  store_id        TEXT REFERENCES stores (id),
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

INSERT INTO coupons
  (id, code, campaign_id, store_id, status, void_reason, voided_at, voided_by, import_batch_id, created_by, created_at, updated_at)
SELECT id, code, campaign_id, NULL, status, void_reason, voided_at, voided_by, import_batch_id, created_by, created_at, updated_at
  FROM coupons_copia;

DROP TABLE coupons_copia;

CREATE UNIQUE INDEX uq_coupons_tienda_campana_codigo ON coupons (COALESCE(store_id, ''), campaign_id, code);
CREATE INDEX idx_coupons_code ON coupons (code);
CREATE INDEX idx_coupons_campaign_status ON coupons (campaign_id, status);
CREATE INDEX idx_coupons_created ON coupons (created_at);
CREATE INDEX idx_coupons_store ON coupons (store_id);

CREATE TRIGGER coupons_estado_inmutable
BEFORE UPDATE OF status ON coupons
WHEN OLD.status <> 'available' AND NEW.status <> OLD.status
BEGIN
  SELECT RAISE(ABORT, 'estado_de_cupon_inmutable');
END;

CREATE TRIGGER coupons_datos_inmutables
BEFORE UPDATE OF code, campaign_id, store_id ON coupons
BEGIN
  SELECT RAISE(ABORT, 'cupon_inmutable');
END;

CREATE TRIGGER coupons_sin_borrado
BEFORE DELETE ON coupons
WHEN OLD.status <> 'available'
BEGIN
  SELECT RAISE(ABORT, 'cupon_no_borrable');
END;

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
