"use server";

import Anthropic from "@anthropic-ai/sdk";
import { exigirSesion } from "@/lib/session";
import { obtenerClienteAnthropic } from "@/lib/anthropic";
import { formatearFechaLegible } from "@/lib/fechas";

export type ObservacionParaIA = {
  fecha: string;
  usuarioNombre: string;
  rol: string;
  observacion: string;
  actividad: string | null;
};

// Toma las observaciones sueltas (muchas veces escritas rápido desde el
// celular, con errores de tipeo) y les pide a Claude un resumen ejecutivo
// -- no un resumen robótico línea por línea, sino algo que suene como lo
// redactaría alguien de operaciones que ya leyó todo el historial.
//
// Nunca lanza (throw): Next.js reemplaza el mensaje de cualquier error
// lanzado desde una acción de servidor por uno genérico en producción, así
// que el mensaje real nunca llegaría a la pantalla -- se devuelve siempre
// un resultado con exito/mensaje, igual que el resto de acciones de la app.
export type ResultadoObservacionesIA = { exito: boolean; texto?: string; mensaje?: string };

export async function procesarObservacionesConIA(
  tiendaNombre: string,
  desde: string,
  hasta: string,
  observaciones: ObservacionParaIA[]
): Promise<ResultadoObservacionesIA> {
  await exigirSesion();

  if (observaciones.length === 0) {
    return { exito: false, mensaje: "No hay observaciones en este rango para procesar." };
  }

  const bloques = observaciones
    .map(
      (o) =>
        `[${formatearFechaLegible(o.fecha)}] ${o.usuarioNombre} (${o.rol}): ${o.observacion}` +
        (o.actividad ? ` — Actividad: ${o.actividad}` : "")
    )
    .join("\n");

  try {
    const respuesta = await obtenerClienteAnthropic().messages.create({
      model: "claude-opus-5",
      max_tokens: 2000,
      thinking: { type: "adaptive" },
      system:
        "Eres quien redacta el resumen ejecutivo de visitas de campo para una cadena de ramen en Perú (Shimaya). " +
        "Te pasan las observaciones sueltas que los supervisores/capacitadores escribieron a mano en el celular, " +
        "muchas veces con errores de tipeo, sin tildes o apuradas. Tu trabajo: leerlas todas juntas y escribir un " +
        "resumen ejecutivo breve (3 a 6 párrafos cortos) de cómo viene esa tienda en el rango de fechas dado. " +
        "Corrige ortografía/gramática al citar o parafrasear, pero NO inventes datos que no estén en las " +
        "observaciones. Escribe en español neutro, tono profesional pero natural y humano -- como lo redactaría " +
        "un gerente de operaciones con experiencia, no un chatbot. Evita frases robóticas o de relleno ('en " +
        "resumen', 'es importante destacar que', 'cabe mencionar', 'en conclusión'), evita empezar varias " +
        "oraciones igual, varía la estructura de las frases y su largo. Si hay patrones que se repiten (un " +
        "problema recurrente, una mejora sostenida), señálalos explícitamente con el dato que los respalda. Si " +
        "las observaciones son muy escuetas o genéricas, dilo con naturalidad en vez de rellenar con paja.",
      messages: [
        {
          role: "user",
          content: `Tienda: ${tiendaNombre}\nRango: ${formatearFechaLegible(desde)} al ${formatearFechaLegible(
            hasta
          )}\n\nObservaciones (${observaciones.length}):\n${bloques}`,
        },
      ],
    });

    const bloqueTexto = respuesta.content.find(
      (b): b is Anthropic.TextBlock => b.type === "text"
    );
    if (!bloqueTexto) return { exito: false, mensaje: "La IA no devolvió una respuesta de texto." };
    return { exito: true, texto: bloqueTexto.text.trim() };
  } catch (err: any) {
    if (err instanceof Anthropic.AuthenticationError) {
      return { exito: false, mensaje: "La API key de Anthropic no es válida." };
    }
    if (err instanceof Anthropic.RateLimitError) {
      return { exito: false, mensaje: "Se alcanzó el límite de uso de la IA por ahora, intenta en un momento." };
    }
    if (err?.message?.includes("API key")) return { exito: false, mensaje: err.message };
    console.error("Reporte de Tienda IA - error no reconocido:", err?.name, err?.status, err?.message, err?.stack);
    return { exito: false, mensaje: "No se pudo conectar con la IA. Intenta de nuevo." };
  }
}
