import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// Encuestas rápidas dentro de Anuncios: un comunicado es encuesta cuando
// comunicados.encuesta_opciones no es null. Cada voto es una fila en
// encuesta_votos con el índice de la opción elegida (varias filas por
// persona si la encuesta permite marcar varias opciones).

export const MIN_OPCIONES_ENCUESTA = 2;
export const MAX_OPCIONES_ENCUESTA = 8;
export const MAX_LARGO_OPCION = 80;
export const MAX_LARGO_PREGUNTA = 300;

// Mismo público por defecto que el correo de un anuncio nuevo: con
// destinatarios elegidos, solo ellos; si no, supervisores y capacitadores.
export function estaEnPublicoEncuesta(
  usuario: { id: string; rol: string },
  usuariosDestino: string[] | null
): boolean {
  if (usuariosDestino && usuariosDestino.length > 0) return usuariosDestino.includes(usuario.id);
  return usuario.rol === "supervisor" || usuario.rol === "capacitador";
}

// encuesta_cierra es el último día en que se puede votar (hora Perú).
export function encuestaCerrada(cierra: string | null, hoy: string): boolean {
  return !!cierra && cierra < hoy;
}

export type VotoEncuesta = { comunicado_id: string; usuario_id: string; opcion: number };

export async function cargarVotosEncuestas(
  supabase: SupabaseClient<Database>,
  comunicadoIds: string[]
): Promise<VotoEncuesta[]> {
  if (comunicadoIds.length === 0) return [];
  const { data, error } = await supabase
    .from("encuesta_votos")
    .select("comunicado_id, usuario_id, opcion")
    .in("comunicado_id", comunicadoIds);
  if (error) throw new Error("No se pudo cargar los votos de las encuestas.");
  return data ?? [];
}

export type ConteoEncuesta = {
  // Votos por opción, en el mismo orden que las opciones.
  conteos: number[];
  // Personas distintas que votaron (con opción múltiple no es la suma de conteos).
  votantes: number;
  votantesIds: Set<string>;
};

export function contarVotos(numOpciones: number, votos: VotoEncuesta[]): ConteoEncuesta {
  const conteos = Array.from({ length: numOpciones }, () => 0);
  const votantesIds = new Set<string>();
  votos.forEach((v) => {
    if (v.opcion >= 0 && v.opcion < numOpciones) conteos[v.opcion] += 1;
    votantesIds.add(v.usuario_id);
  });
  return { conteos, votantes: votantesIds.size, votantesIds };
}
