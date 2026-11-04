// Hash de contraseñas con PBKDF2-SHA256 (WebCrypto, estándar; no hay criptografía propia).
// Cloudflare Workers limita PBKDF2 a 100 000 iteraciones como máximo, por eso ese valor;
// el riesgo residual se compensa con límites de intentos de inicio de sesión (ver ratelimit.ts).
// Formato almacenado: pbkdf2$sha256$<iteraciones>$<sal base64>$<hash base64>

export const PBKDF2_ITERATIONS = 100_000;
const KEY_BYTES = 32;

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    key,
    KEY_BYTES * 8,
  );
  return new Uint8Array(bits);
}

function equalConstantTime(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$sha256$${PBKDF2_ITERATIONS}$${b64(salt)}$${b64(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, alg, iter, salt, hash] = stored.split("$");
  if (scheme !== "pbkdf2" || alg !== "sha256" || !iter || !salt || !hash) return false;
  const iterations = Number(iter);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 100_000) return false;
  const actual = await derive(password, unb64(salt), iterations);
  return equalConstantTime(actual, unb64(hash));
}

let dummy: Promise<string> | undefined;
/** Hash descartable para gastar el mismo tiempo cuando el correo no existe (evita enumerar cuentas por tiempo). */
export function dummyHash(): Promise<string> {
  dummy ??= hashPassword("contraseña-descartable-sin-uso");
  return dummy;
}
