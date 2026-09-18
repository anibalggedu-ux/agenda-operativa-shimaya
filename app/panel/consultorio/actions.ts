"use server";

import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { obtenerClienteAnthropic } from "@/lib/anthropic";
import { obtenerSesion, tieneBitacora } from "@/lib/session";
import { obtenerTiendasClasificadas } from "../supervisor/actions";
import { obtenerMisPuntos } from "../puntos-actions";
import { obtenerMisKilometros } from "../kilometros-actions";
import { obtenerResumenPersonal, obtenerResumenOperativo } from "../resumen-dia-actions";
import { obtenerDashboardGerente, obtenerMapaOperativoHoy } from "../gerente/actions";
import { hoyPeru, sumarDias } from "@/lib/fechas";

export type MensajeConsultorio = { rol: "user" | "assistant"; texto: string };

const SISTEMA_BASE = `Eres el "Consultorio IA" de Agenda Operativa Shimaya, la app interna que usa el equipo de
una cadena de ramen en Perú para coordinar rutas, marcar asistencia con GPS (llegada/salida a tiendas y a
eventos), enviar reportes de visita, pedir cambios de descanso/permisos/vacaciones, y ver su desempeño (puntos,
medallas, racha de puntualidad, kilómetros recorridos). Respondes dudas de cómo funciona el sistema y, cuando
tienes una herramienta para ello, consultas los datos reales de quien pregunta para responder con números
concretos en vez de generalidades. Habla en español de Perú, tono cercano y directo, como alguien del equipo de
sistemas ayudando a un colega -- nada de relleno corporativo ni de sonar a manual de usuario. Si no sabes algo o
no tienes cómo averiguarlo, dilo con naturalidad en vez de inventar una respuesta. Sé breve: la mayoría de
respuestas caben en un par de párrafos cortos.`;

// Cada herramienta envuelve una acción de servidor que YA existe en la app y
// que ya resuelve todo por la sesión activa (nunca recibe un usuarioId del
// modelo) -- así el Consultorio nunca puede terminar mostrando datos de otra
// persona, y toda la lógica de negocio vive en un solo lugar (la acción
// original), no duplicada acá.
function construirHerramientas(rol: string) {
  const herramientas: any[] = [];

  if (tieneBitacora(rol as any)) {
    herramientas.push(
      betaZodTool({
        name: "mis_tiendas_de_hoy",
        description:
          "Tiendas asignadas a quien pregunta (hoy, mañana, y pendientes recientes): si ya reportó, si marcó llegada, y el tiempo estimado de viaje.",
        inputSchema: z.object({}),
        run: async () => {
          const { tiendas, diaDescansoFijo } = await obtenerTiendasClasificadas();
          return JSON.stringify({
            diaDescansoFijo,
            tiendas: tiendas.map((t) => ({
              tienda: t.tiendaNombre,
              fecha: t.fechaPlanificada,
              urgencia: t.urgencia,
              reportado: !!t.reporteId,
              marcoLlegada: !!t.horaLlegada,
              etaMinutos: t.etaMinutos,
              etaKm: t.etaKm,
            })),
          });
        },
      })
    );
  }

  herramientas.push(
    betaZodTool({
      name: "mis_puntos_y_racha",
      description: "Puntos acumulados, medallas y racha actual de puntualidad de quien pregunta.",
      inputSchema: z.object({}),
      run: async () => JSON.stringify(await obtenerMisPuntos()),
    })
  );

  if (tieneBitacora(rol as any)) {
    herramientas.push(
      betaZodTool({
        name: "mis_kilometros",
        description: "Kilómetros recorridos por quien pregunta en un rango de fechas (por defecto, los últimos 30 días).",
        inputSchema: z.object({
          desde: z.string().optional().describe("Fecha inicial YYYY-MM-DD, opcional"),
          hasta: z.string().optional().describe("Fecha final YYYY-MM-DD, opcional"),
        }),
        run: async ({ desde, hasta }) => {
          const hoy = hoyPeru();
          return JSON.stringify(await obtenerMisKilometros(desde || sumarDias(hoy, -30), hasta || hoy));
        },
      })
    );
  }

  if (rol === "supervisor" || rol === "capacitador") {
    herramientas.push(
      betaZodTool({
        name: "mi_resumen_de_puntualidad",
        description: "Estado de puntualidad, alertas activas y próximo evento (descanso, aniversario) de quien pregunta.",
        inputSchema: z.object({}),
        run: async () => JSON.stringify(await obtenerResumenPersonal()),
      })
    );
  }

  if (rol === "coordinador" || rol === "gerente") {
    herramientas.push(
      betaZodTool({
        name: "resumen_operativo_del_equipo",
        description: "Resumen operativo del equipo completo: alertas de puntualidad, tiendas críticas sin visitar, comunicados recientes.",
        inputSchema: z.object({}),
        run: async () => JSON.stringify(await obtenerResumenOperativo()),
      }),
      betaZodTool({
        name: "mapa_operativo_ahora",
        description: "Quién está en qué tienda en este momento, según las marcaciones de hoy.",
        inputSchema: z.object({}),
        run: async () => JSON.stringify(await obtenerMapaOperativoHoy()),
      })
    );
  }

  if (rol === "gerente") {
    herramientas.push(
      betaZodTool({
        name: "dashboard_gerencial",
        description: "KPIs generales de la operación completa (dashboard del gerente).",
        inputSchema: z.object({}),
        run: async () => JSON.stringify(await obtenerDashboardGerente()),
      })
    );
  }

  return herramientas;
}

// Next.js oculta el mensaje real de cualquier error que se lance (throw)
// desde una acción de servidor cuando corre en producción (lo reemplaza por
// un genérico "An error occurred..." para no arriesgar filtrar detalles
// internos) -- por eso esta función NUNCA lanza, siempre devuelve un
// resultado con exito/mensaje, igual que el resto de acciones de la app que
// necesitan mostrarle un mensaje de error puntual a quien la usa.
export type ResultadoConsultorioIA = { exito: boolean; texto?: string; mensaje?: string };

export async function preguntarConsultorioIA(
  pregunta: string,
  historial: MensajeConsultorio[]
): Promise<ResultadoConsultorioIA> {
  const sesion = await obtenerSesion();
  if (!sesion) return { exito: false, mensaje: "No autorizado." };

  const preguntaLimpia = pregunta.trim();
  if (!preguntaLimpia) return { exito: false, mensaje: "Escribe una pregunta." };

  // Solo se manda lo último de la conversación -- alcanza para que las
  // respuestas de seguimiento tengan sentido, sin que cada mensaje nuevo
  // pague por reenviar un historial larguísimo.
  const historialAcotado = historial.slice(-12);

  const mensajes: Anthropic.Beta.BetaMessageParam[] = [
    ...historialAcotado.map((m) => ({ role: m.rol, content: m.texto })),
    { role: "user" as const, content: preguntaLimpia },
  ];

  try {
    const finalMessage = await obtenerClienteAnthropic().beta.messages.toolRunner({
      model: "claude-opus-5",
      max_tokens: 2000,
      system: `${SISTEMA_BASE}\n\nQuien pregunta: ${sesion.nombre}, rol ${sesion.rol}.`,
      tools: construirHerramientas(sesion.rol),
      messages: mensajes,
    });

    const bloqueTexto = finalMessage.content.find(
      (b): b is Anthropic.Beta.BetaTextBlock => b.type === "text"
    );
    return {
      exito: true,
      texto: bloqueTexto?.text.trim() || "No pude generar una respuesta esta vez. Intenta de nuevo.",
    };
  } catch (err: any) {
    if (err instanceof Anthropic.AuthenticationError) {
      return { exito: false, mensaje: "La API key de Anthropic no es válida." };
    }
    if (err instanceof Anthropic.RateLimitError) {
      return { exito: false, mensaje: "Se alcanzó el límite de uso de la IA por ahora, intenta en un momento." };
    }
    if (err?.message?.includes("API key")) return { exito: false, mensaje: err.message };
    return { exito: false, mensaje: "No se pudo conectar con la IA. Intenta de nuevo." };
  }
}
