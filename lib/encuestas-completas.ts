// Encuestas completas: varias preguntas que se responden pantalla por
// pantalla (a diferencia de las encuestas rápidas de Anuncios, ver
// lib/encuestas.ts). Las preguntas viven como JSON en encuestas.preguntas y
// cada respuesta es una fila en encuesta_respuestas con un arreglo alineado
// a esas preguntas. Este archivo no importa nada del servidor: lo usan
// tanto las acciones como el editor del coordinador.

export type TipoPregunta = "caritas" | "unica" | "multiple" | "texto";

export type Pregunta = {
  tipo: TipoPregunta;
  texto: string;
  // Solo para "unica" y "multiple".
  opciones?: string[];
  obligatoria: boolean;
};

// caritas: 1..5 · unica: índice · multiple: índices · texto: string.
// null = pregunta opcional sin responder.
export type Respuesta = number | number[] | string | null;

export const TIPOS_PREGUNTA: { tipo: TipoPregunta; etiqueta: string }[] = [
  { tipo: "caritas", etiqueta: "😀 Caritas del 1 al 5" },
  { tipo: "unica", etiqueta: "Una opción" },
  { tipo: "multiple", etiqueta: "Varias opciones" },
  { tipo: "texto", etiqueta: "Texto libre" },
];

export const CARITAS = [
  { valor: 1, emoji: "😣", etiqueta: "Muy mal" },
  { valor: 2, emoji: "🙁", etiqueta: "Mal" },
  { valor: 3, emoji: "😐", etiqueta: "Normal" },
  { valor: 4, emoji: "🙂", etiqueta: "Bien" },
  { valor: 5, emoji: "😄", etiqueta: "Muy bien" },
];

export const MAX_PREGUNTAS = 10;
export const MAX_OPCIONES_PREGUNTA = 8;
export const MAX_LARGO_TITULO = 120;
export const MAX_LARGO_DESCRIPCION = 300;
export const MAX_LARGO_TEXTO_PREGUNTA = 200;
export const MAX_LARGO_OPCION_PREGUNTA = 80;
export const MAX_LARGO_RESPUESTA_TEXTO = 500;
export const MAX_PUNTOS_ENCUESTA = 100;

export function tieneOpciones(tipo: TipoPregunta): boolean {
  return tipo === "unica" || tipo === "multiple";
}

// Limpia y valida las preguntas que arma el coordinador. Devuelve el
// mensaje de error o las preguntas listas para guardar.
export function validarPreguntas(entrada: unknown): { error: string } | { preguntas: Pregunta[] } {
  if (!Array.isArray(entrada) || entrada.length === 0) {
    return { error: "Agrega al menos una pregunta." };
  }
  if (entrada.length > MAX_PREGUNTAS) {
    return { error: `La encuesta puede tener hasta ${MAX_PREGUNTAS} preguntas.` };
  }

  const preguntas: Pregunta[] = [];
  for (let i = 0; i < entrada.length; i++) {
    const p = entrada[i] as Partial<Pregunta> | null;
    const n = i + 1;
    if (!p || !TIPOS_PREGUNTA.some((t) => t.tipo === p.tipo)) {
      return { error: `La pregunta ${n} no tiene un tipo válido.` };
    }
    const tipo = p.tipo as TipoPregunta;
    const texto = String(p.texto ?? "").trim();
    if (!texto) return { error: `Escribe el texto de la pregunta ${n}.` };
    if (texto.length > MAX_LARGO_TEXTO_PREGUNTA) {
      return { error: `La pregunta ${n} puede tener hasta ${MAX_LARGO_TEXTO_PREGUNTA} caracteres.` };
    }

    const pregunta: Pregunta = { tipo, texto, obligatoria: p.obligatoria !== false };
    if (tieneOpciones(tipo)) {
      const opciones = (Array.isArray(p.opciones) ? p.opciones : [])
        .map((o) => String(o ?? "").trim())
        .filter(Boolean);
      if (opciones.length < 2 || opciones.length > MAX_OPCIONES_PREGUNTA) {
        return { error: `La pregunta ${n} necesita entre 2 y ${MAX_OPCIONES_PREGUNTA} opciones.` };
      }
      if (opciones.some((o) => o.length > MAX_LARGO_OPCION_PREGUNTA)) {
        return { error: `Las opciones de la pregunta ${n} pueden tener hasta ${MAX_LARGO_OPCION_PREGUNTA} caracteres.` };
      }
      if (new Set(opciones.map((o) => o.toLowerCase())).size !== opciones.length) {
        return { error: `La pregunta ${n} tiene dos opciones iguales.` };
      }
      pregunta.opciones = opciones;
    }
    preguntas.push(pregunta);
  }
  return { preguntas };
}

// ¿Esta respuesta es válida para esta pregunta? null solo si es opcional.
export function respuestaValida(pregunta: Pregunta, r: unknown): r is Respuesta {
  if (r === null || r === undefined || r === "" || (Array.isArray(r) && r.length === 0)) {
    return !pregunta.obligatoria;
  }
  const numOpciones = pregunta.opciones?.length ?? 0;
  switch (pregunta.tipo) {
    case "caritas":
      return Number.isInteger(r) && (r as number) >= 1 && (r as number) <= 5;
    case "unica":
      return Number.isInteger(r) && (r as number) >= 0 && (r as number) < numOpciones;
    case "multiple":
      return (
        Array.isArray(r) &&
        new Set(r).size === r.length &&
        r.every((o) => Number.isInteger(o) && o >= 0 && o < numOpciones)
      );
    case "texto":
      return typeof r === "string" && r.trim().length > 0 && r.length <= MAX_LARGO_RESPUESTA_TEXTO;
  }
}

// Normaliza las respuestas vacías a null antes de guardar.
export function normalizarRespuesta(r: Respuesta | undefined): Respuesta {
  if (r === undefined || r === "" || (Array.isArray(r) && r.length === 0)) return null;
  if (typeof r === "string") return r.trim() || null;
  return r;
}

export function estaRespondida(r: Respuesta | undefined): boolean {
  return normalizarRespuesta(r) !== null;
}
