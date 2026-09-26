// Preferencias visuales de la app "Noche", guardadas por celular (no por
// cuenta) — mismo patrón que lib/sonido.ts para sonido y vibración.
const CLAVE_SIN_BRASAS = "shimaya_sin_brasas";

function leerPreferencia(clave: string): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(clave) === "1";
  } catch {
    return false;
  }
}

function guardarPreferencia(clave: string, valor: boolean): void {
  try {
    if (valor) window.localStorage.setItem(clave, "1");
    else window.localStorage.removeItem(clave);
  } catch {
    // Sin almacenamiento (modo privado): la preferencia dura solo esta visita.
  }
}

// Activadas por defecto. Se apagan solas si el celular pide "reducir
// movimiento" (ver componente Brasas), sin necesidad de tocar esta preferencia.
export function brasasActivadas(): boolean {
  return !leerPreferencia(CLAVE_SIN_BRASAS);
}

export function cambiarBrasas(activadas: boolean): void {
  guardarPreferencia(CLAVE_SIN_BRASAS, !activadas);
}
