import { supabaseServer } from "./supabase-server";
import { horaPeru, horaPeruDesdeEpoch } from "./fechas";

// Ventana de gracia para marcaciones hechas sin señal (ej. sótanos de
// centros comerciales) -- pasado esto, se usa la hora real del servidor en
// vez de la reclamada por el celular, para no abrir la puerta a marcar
// "más temprano" de mentira alterando el reloj del teléfono.
const LIMITE_OFFLINE_MS = 20 * 60 * 1000;

// Resuelve qué hora usar para una marcación: la capturada en el celular (si
// llegó dentro de la ventana de gracia) o la hora real del servidor. Cuando
// se acepta la hora capturada, deja constancia en el Historial de cambios de
// Registro para que quede visible que esa marcación se sincronizó offline.
export async function resolverHoraMarcacion(
  supabase: ReturnType<typeof supabaseServer>,
  sesion: { id: string; nombre: string },
  horaCapturadaMs: number | undefined,
  etiquetaAccion: string
): Promise<string> {
  if (!horaCapturadaMs) return horaPeru();

  const desfaseMs = Date.now() - horaCapturadaMs;
  if (desfaseMs < 0 || desfaseMs > LIMITE_OFFLINE_MS) {
    return horaPeru();
  }

  const hora = horaPeruDesdeEpoch(horaCapturadaMs);
  try {
    await supabase.from("auditoria_cambios").insert({
      usuario_id: sesion.id,
      usuario_nombre: sesion.nombre,
      accion: `Marcó ${etiquetaAccion} sin conexión`,
      detalle: `Hora capturada en el celular: ${hora} — sincronizado ${Math.round(desfaseMs / 1000)}s después.`,
    });
  } catch (error) {
    console.error("No se pudo registrar la marcación offline en la bitácora:", error);
  }
  return hora;
}
