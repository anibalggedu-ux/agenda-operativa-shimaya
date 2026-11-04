-- Acceso de líderes de tienda con PIN propio de la tienda (sin correo ni contraseña personal).
-- Cada tienda tiene además una fila en `users` (rol validador, nombre = nombre de la tienda):
-- así sesiones, canjes, historial y auditoría siguen funcionando igual y cada canje queda
-- asociado a la tienda. El PIN solo se guarda con hash (PBKDF2, igual que las contraseñas);
-- se muestra una única vez al crearlo o regenerarlo.
CREATE TABLE stores (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL UNIQUE COLLATE NOCASE,
  user_id        TEXT NOT NULL UNIQUE REFERENCES users (id),
  pin_hash       TEXT NOT NULL,
  pin_updated_at TEXT NOT NULL,
  active         INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at     TEXT NOT NULL
);
