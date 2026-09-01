import { createHash } from "crypto";

// FIX COMPATIBILIDAD: esto replica EXACTO el hashPassword() del Apps Script
// original (SHA-256, salida en hexadecimal minúscula). Es intencional que no
// sea bcrypt/argon2 (que serían más seguros) — así los hashes ya guardados
// en USUARIOS (migrados desde Google Sheets) siguen siendo válidos sin que
// nadie tenga que resetear su contraseña el día de la migración.
export function hashPassword(clave: string): string {
  return createHash("sha256").update(clave, "utf8").digest("hex");
}
