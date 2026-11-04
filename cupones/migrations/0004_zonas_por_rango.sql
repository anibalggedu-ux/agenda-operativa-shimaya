-- Zonas por rango de número de cupón, por campaña (ej. del 1 al 200 "Comercios menores", del 201 al 400
-- "Oficinas"). La zona de un cupón NO se guarda en el cupón: se calcula con su número (0001 = 1), así que
-- cambiar un rango se aplica de inmediato a todos los cupones de esa campaña, en todas las tiendas.
-- (La columna stores.zone creada en 0003 queda sin uso: la app ya no la lee ni la escribe.)
CREATE TABLE campaign_zones (
  id          TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns (id),
  name        TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  from_number INTEGER NOT NULL CHECK (from_number >= 0),
  to_number   INTEGER NOT NULL,
  UNIQUE (campaign_id, name),
  CHECK (from_number <= to_number)
);
CREATE INDEX idx_campaign_zones_campaign ON campaign_zones (campaign_id);

-- Defensa en profundidad: dos zonas de una misma campaña no pueden cruzarse.
CREATE TRIGGER campaign_zones_sin_cruce
BEFORE INSERT ON campaign_zones
WHEN EXISTS (
  SELECT 1 FROM campaign_zones z
   WHERE z.campaign_id = NEW.campaign_id AND NEW.from_number <= z.to_number AND NEW.to_number >= z.from_number
)
BEGIN
  SELECT RAISE(ABORT, 'zonas_cruzadas');
END;
