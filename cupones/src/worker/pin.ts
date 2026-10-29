// PIN de tienda: 6 dígitos al azar (WebCrypto, sin sesgo de módulo). Se guarda con el mismo
// hash que las contraseñas; la protección contra adivinarlo es el límite de intentos
// por tienda y por IP (ver ratelimit.ts), no el tamaño del PIN.

export const PIN_LENGTH = 6;

export function generatePin(): string {
  const limit = 4_294_967_296 - (4_294_967_296 % 10 ** PIN_LENGTH);
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0]! < limit) return String(buf[0]! % 10 ** PIN_LENGTH).padStart(PIN_LENGTH, "0");
  }
}

export const isPinFormat = (s: string) => new RegExp(`^\\d{${PIN_LENGTH}}$`).test(s);
