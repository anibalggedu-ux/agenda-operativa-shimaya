"use server";

import { supabaseServer } from "@/lib/supabase-server";
import { exigirCoordinador, obtenerSesion } from "@/lib/session";
import { formatearFechaLegible, hoyPeru, sumarDias } from "@/lib/fechas";
import { enviarCorreo, URL_APP } from "@/lib/email";
import { encuestaCerrada, estaEnPublicoEncuesta } from "@/lib/encuestas";
import {
  CARITAS,
  MAX_LARGO_DESCRIPCION,
  MAX_LARGO_TITULO,
  MAX_PUNTOS_ENCUESTA,
  normalizarRespuesta,
  respuestaValida,
  validarPreguntas,
  type Pregunta,
  type Respuesta,
} from "@/lib/encuestas-completas";

export type ResultadoAccion = { exito: boolean; mensaje?: string };

// Las preguntas se validan al guardar (validarPreguntas), así que al leer se
// confía en su forma.
function leerPreguntas(json: unknown): Pregunta[] {
  return Array.isArray(json) ? (json as Pregunta[]) : [];
}

function leerRespuestas(json: unknown): Respuesta[] {
  return Array.isArray(json) ? (json as Respuesta[]) : [];
}

// ---------------------------------------------------------------------
// Para quien responde (supervisores y capacitadores)
// ---------------------------------------------------------------------

export type EncuestaPendiente = {
  id: string;
  titulo: string;
  descripcion: string | null;
  preguntas: Pregunta[];
  anonima: boolean;
  puntos: number;
  cierra: string | null;
};

// Encuestas abiertas, dirigidas a esta persona y que todavía no respondió.
export async function obtenerEncuestasPendientes(): Promise<EncuestaPendiente[]> {
  const sesion = await obtenerSesion();
  if (!sesion) throw new Error("No autorizado.");

  const supabase = supabaseServer();
  const hoy = hoyPeru();

  const [{ data: encuestas, error }, { data: mias }] = await Promise.all([
    supabase
      .from("encuestas")
      .select("id, titulo, descripcion, preguntas, anonima, puntos, cierra, usuarios_destino")
      .or(`cierra.is.null,cierra.gte.${hoy}`)
      .order("created_at", { ascending: true }),
    supabase.from("encuesta_respuestas").select("encuesta_id").eq("usuario_id", sesion.id),
  ]);

  if (error) throw new Error("No se pudo cargar las encuestas.");

  const respondidas = new Set((mias ?? []).map((r) => r.encuesta_id));
  return (encuestas ?? [])
    .filter((e) => !respondidas.has(e.id) && estaEnPublicoEncuesta(sesion, e.usuarios_destino))
    .map((e) => ({
      id: e.id,
      titulo: e.titulo,
      descripcion: e.descripcion,
      preguntas: leerPreguntas(e.preguntas),
      anonima: e.anonima,
      puntos: e.puntos,
      cierra: e.cierra,
    }));
}

export async function responderEncuesta(
  encuestaId: string,
  respuestasEntrada: Respuesta[]
): Promise<ResultadoAccion & { puntos?: number }> {
  const sesion = await obtenerSesion();
  if (!sesion) return { exito: false, mensaje: "No autorizado." };

  const supabase = supabaseServer();
  const { data: e, error } = await supabase
    .from("encuestas")
    .select("id, preguntas, puntos, cierra, usuarios_destino")
    .eq("id", encuestaId)
    .maybeSingle();

  if (error || !e) return { exito: false, mensaje: "La encuesta ya no existe." };
  if (encuestaCerrada(e.cierra, hoyPeru())) return { exito: false, mensaje: "La encuesta ya cerró." };
  if (!estaEnPublicoEncuesta(sesion, e.usuarios_destino)) {
    return { exito: false, mensaje: "Esta encuesta no es para ti." };
  }

  const preguntas = leerPreguntas(e.preguntas);
  if (!Array.isArray(respuestasEntrada) || respuestasEntrada.length !== preguntas.length) {
    return { exito: false, mensaje: "Faltan respuestas. Vuelve a abrir la encuesta." };
  }
  const respuestas = respuestasEntrada.map((r) => normalizarRespuesta(r));
  const invalida = preguntas.findIndex((p, i) => !respuestaValida(p, respuestas[i]));
  if (invalida >= 0) {
    return { exito: false, mensaje: `Revisa la pregunta ${invalida + 1}.` };
  }

  const { error: errorInsert } = await supabase.from("encuesta_respuestas").insert({
    encuesta_id: e.id,
    usuario_id: sesion.id,
    respuestas,
    puntos_ganados: e.puntos,
  });

  if (errorInsert) {
    // 23505 = unique(encuesta_id, usuario_id): ya había respondido (ej. doble toque).
    if (errorInsert.code === "23505") return { exito: false, mensaje: "Ya respondiste esta encuesta." };
    return { exito: false, mensaje: "No se pudo enviar tus respuestas. Intenta de nuevo." };
  }

  return { exito: true, puntos: e.puntos };
}

// ---------------------------------------------------------------------
// Para el coordinador
// ---------------------------------------------------------------------

export type ResultadoPregunta =
  | {
      tipo: "caritas";
      texto: string;
      // Cantidad por valor 1..5 (índice 0 = valor 1).
      conteos: number[];
      promedio: number | null;
      respuestas: number;
      nombresPorOpcion: string[][] | null;
    }
  | {
      tipo: "unica" | "multiple";
      texto: string;
      opciones: string[];
      conteos: number[];
      respuestas: number;
      nombresPorOpcion: string[][] | null;
    }
  | {
      tipo: "texto";
      texto: string;
      respuestas: number;
      comentarios: { texto: string; nombre: string | null }[];
    };

export type ResultadosEncuestaCompleta = {
  id: string;
  titulo: string;
  descripcion: string | null;
  anonima: boolean;
  puntos: number;
  cierra: string | null;
  cerrada: boolean;
  autor: string | null;
  creada: string;
  usuariosDestino: string[] | null;
  respondieron: number;
  publico: number;
  pendientes: string[];
  preguntas: ResultadoPregunta[];
};

function nombreDe(nombrePorId: Map<string, string>, id: string): string {
  return nombrePorId.get(id) ?? "Ex colaborador";
}

export async function obtenerResultadosEncuestas(): Promise<ResultadosEncuestaCompleta[]> {
  await exigirCoordinador();
  const supabase = supabaseServer();
  const hoy = hoyPeru();

  const [{ data: encuestas, error }, { data: respuestas, error: errorResp }, { data: usuarios }] =
    await Promise.all([
      supabase
        .from("encuestas")
        .select("id, titulo, descripcion, preguntas, anonima, puntos, cierra, usuarios_destino, autor, created_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("encuesta_respuestas")
        .select("encuesta_id, usuario_id, respuestas")
        .not("encuesta_id", "is", null),
      supabase.from("usuarios").select("id, nombre, rol, activo").order("nombre"),
    ]);

  if (error || errorResp) throw new Error("No se pudo cargar las encuestas.");

  const nombrePorId = new Map((usuarios ?? []).map((u) => [u.id, u.nombre]));
  const activos = (usuarios ?? []).filter((u) => u.activo);

  return (encuestas ?? []).map((e) => {
    const preguntas = leerPreguntas(e.preguntas);
    const deEsta = (respuestas ?? []).filter((r) => r.encuesta_id === e.id);
    const quienes = new Set(deEsta.map((r) => r.usuario_id));
    const publico = activos.filter((u) => estaEnPublicoEncuesta(u, e.usuarios_destino));

    const resultados: ResultadoPregunta[] = preguntas.map((p, i) => {
      const valores = deEsta
        .map((r) => ({ usuarioId: r.usuario_id, valor: leerRespuestas(r.respuestas)[i] ?? null }))
        .filter((v) => v.valor !== null);

      if (p.tipo === "texto") {
        return {
          tipo: "texto",
          texto: p.texto,
          respuestas: valores.length,
          comentarios: valores.map((v) => ({
            texto: String(v.valor),
            nombre: e.anonima ? null : nombreDe(nombrePorId, v.usuarioId),
          })),
        };
      }

      const numOpciones = p.tipo === "caritas" ? CARITAS.length : p.opciones?.length ?? 0;
      const conteos = Array.from({ length: numOpciones }, () => 0);
      const nombres: string[][] = Array.from({ length: numOpciones }, () => []);
      valores.forEach((v) => {
        const elegidas = Array.isArray(v.valor) ? v.valor : [v.valor as number];
        elegidas.forEach((o) => {
          const idx = p.tipo === "caritas" ? o - 1 : o;
          if (idx < 0 || idx >= numOpciones) return;
          conteos[idx] += 1;
          nombres[idx].push(nombreDe(nombrePorId, v.usuarioId));
        });
      });

      if (p.tipo === "caritas") {
        const suma = conteos.reduce((acc, c, idx) => acc + c * (idx + 1), 0);
        return {
          tipo: "caritas",
          texto: p.texto,
          conteos,
          promedio: valores.length > 0 ? Math.round((suma / valores.length) * 10) / 10 : null,
          respuestas: valores.length,
          nombresPorOpcion: e.anonima ? null : nombres,
        };
      }
      return {
        tipo: p.tipo,
        texto: p.texto,
        opciones: p.opciones ?? [],
        conteos,
        respuestas: valores.length,
        nombresPorOpcion: e.anonima ? null : nombres,
      };
    });

    return {
      id: e.id,
      titulo: e.titulo,
      descripcion: e.descripcion,
      anonima: e.anonima,
      puntos: e.puntos,
      cierra: e.cierra,
      cerrada: encuestaCerrada(e.cierra, hoy),
      autor: e.autor,
      creada: e.created_at,
      usuariosDestino: e.usuarios_destino,
      respondieron: quienes.size,
      publico: publico.length,
      pendientes: publico.filter((u) => !quienes.has(u.id)).map((u) => u.nombre),
      preguntas: resultados,
    };
  });
}

function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function crearEncuestaCompleta(
  _prevState: ResultadoAccion,
  formData: FormData
): Promise<ResultadoAccion> {
  const sesion = await exigirCoordinador();

  const titulo = String(formData.get("titulo") || "").trim();
  const descripcion = String(formData.get("descripcion") || "").trim();
  const anonima = formData.get("anonima") === "on";
  const puntos = Number(formData.get("puntos") || 0);
  const cierra = String(formData.get("cierra") || "").trim();
  const usuariosDestino = formData.getAll("usuariosDestino").map(String).filter(Boolean);
  const hoy = hoyPeru();

  if (!titulo) return { exito: false, mensaje: "Ponle un título a la encuesta." };
  if (titulo.length > MAX_LARGO_TITULO) {
    return { exito: false, mensaje: `El título puede tener hasta ${MAX_LARGO_TITULO} caracteres.` };
  }
  if (descripcion.length > MAX_LARGO_DESCRIPCION) {
    return { exito: false, mensaje: `La descripción puede tener hasta ${MAX_LARGO_DESCRIPCION} caracteres.` };
  }
  if (!Number.isInteger(puntos) || puntos < 0 || puntos > MAX_PUNTOS_ENCUESTA) {
    return { exito: false, mensaje: `Los puntos deben ser un número entero de 0 a ${MAX_PUNTOS_ENCUESTA}.` };
  }
  if (cierra && (!/^\d{4}-\d{2}-\d{2}$/.test(cierra) || cierra < hoy)) {
    return { exito: false, mensaje: "La fecha de cierre no puede ser anterior a hoy." };
  }

  let preguntasEntrada: unknown;
  try {
    preguntasEntrada = JSON.parse(String(formData.get("preguntas") || "[]"));
  } catch {
    return { exito: false, mensaje: "No se pudieron leer las preguntas." };
  }
  const validacion = validarPreguntas(preguntasEntrada);
  if ("error" in validacion) return { exito: false, mensaje: validacion.error };

  const supabase = supabaseServer();
  const { error } = await supabase.from("encuestas").insert({
    titulo,
    descripcion: descripcion || null,
    preguntas: validacion.preguntas,
    anonima,
    puntos,
    cierra: cierra || null,
    usuarios_destino: usuariosDestino.length > 0 ? usuariosDestino : null,
    autor: sesion.nombre,
  });

  if (error) return { exito: false, mensaje: "No se pudo publicar la encuesta." };

  // Aviso por correo, igual que los anuncios. Un fallo aquí no deshace la
  // encuesta ya publicada.
  try {
    let consulta = supabase.from("usuarios").select("email").eq("activo", true).not("email", "is", null);
    consulta =
      usuariosDestino.length > 0 ? consulta.in("id", usuariosDestino) : consulta.in("rol", ["supervisor", "capacitador"]);
    const [{ data: destinatarios }, { data: yo }] = await Promise.all([
      consulta,
      supabase.from("usuarios").select("email").eq("id", sesion.id).maybeSingle(),
    ]);
    const correos = (destinatarios ?? []).map((u) => u.email).filter((c): c is string => !!c);
    if (correos.length > 0) {
      const n = validacion.preguntas.length;
      await enviarCorreo({
        para: [],
        cco: correos,
        tituloEmoji: "📝",
        asunto: `Nueva encuesta: ${titulo}`,
        responderA: yo?.email ? { nombre: sesion.nombre, email: yo.email } : null,
        cuerpoHtml: `
          <p><strong>${escaparHtml(titulo)}</strong></p>
          ${descripcion ? `<p>${escaparHtml(descripcion)}</p>` : ""}
          <p>${n} ${n === 1 ? "pregunta" : "preguntas"}${puntos > 0 ? ` · Ganas <strong>${puntos} puntos</strong> al responder` : ""}${
            anonima ? " · Es anónima" : ""
          }.</p>
          ${cierra ? `<p>Puedes responder hasta el <strong>${formatearFechaLegible(cierra)}</strong>.</p>` : ""}
          <p><a href="${URL_APP}" style="color:#e23744;">Responde en la Agenda Operativa</a>: aparece al inicio de tu panel.</p>
          <p style="color:#8b8d92; font-size:12px;">Publicado por ${escaparHtml(sesion.nombre)}.</p>
        `,
      });
    }
  } catch (err) {
    console.error("No se pudo enviar el aviso de la encuesta:", err);
  }

  return { exito: true, mensaje: "Encuesta publicada correctamente." };
}

// El cierre es "último día para responder", así que cerrar hoy = ayer.
export async function cerrarEncuestaCompleta(id: string): Promise<ResultadoAccion> {
  await exigirCoordinador();
  const supabase = supabaseServer();
  const { error } = await supabase
    .from("encuestas")
    .update({ cierra: sumarDias(hoyPeru(), -1) })
    .eq("id", id);
  if (error) return { exito: false, mensaje: "No se pudo cerrar la encuesta." };
  return { exito: true };
}

// Las respuestas quedan con encuesta_id = null (on delete set null): se
// pierden las respuestas de la vista, pero no los puntos ya ganados.
export async function eliminarEncuestaCompleta(id: string): Promise<ResultadoAccion> {
  await exigirCoordinador();
  const supabase = supabaseServer();
  const { error } = await supabase.from("encuestas").delete().eq("id", id);
  if (error) return { exito: false, mensaje: "No se pudo eliminar la encuesta." };
  return { exito: true };
}

function celdaCsv(valor: string): string {
  // Excel en español usa ";" como separador. Se neutralizan las fórmulas
  // (=, +, -, @) para que un comentario no se ejecute al abrir el archivo.
  const seguro = /^[=+\-@]/.test(valor) ? `'${valor}` : valor;
  return /[";\n\r]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
}

// Una fila por persona y una columna por pregunta. Si es anónima, no va la
// columna de nombre y las filas se mezclan para no delatar el orden.
export async function exportarEncuestaCsv(
  id: string
): Promise<{ exito: boolean; mensaje?: string; nombreArchivo?: string; contenido?: string }> {
  await exigirCoordinador();
  const supabase = supabaseServer();

  const [{ data: e }, { data: respuestas }, { data: usuarios }] = await Promise.all([
    supabase.from("encuestas").select("titulo, preguntas, anonima").eq("id", id).maybeSingle(),
    supabase.from("encuesta_respuestas").select("usuario_id, respuestas, created_at").eq("encuesta_id", id),
    supabase.from("usuarios").select("id, nombre, rol"),
  ]);
  if (!e) return { exito: false, mensaje: "La encuesta ya no existe." };

  const preguntas = leerPreguntas(e.preguntas);
  const usuarioPorId = new Map((usuarios ?? []).map((u) => [u.id, u]));

  const encabezado = [
    ...(e.anonima ? [] : ["Nombre", "Rol", "Fecha"]),
    ...preguntas.map((p, i) => `${i + 1}. ${p.texto}`),
  ];

  let filas = (respuestas ?? []).map((r) => {
    const valores = leerRespuestas(r.respuestas);
    const u = usuarioPorId.get(r.usuario_id);
    const celdas = preguntas.map((p, i) => {
      const v = valores[i];
      if (v === null || v === undefined) return "";
      if (p.tipo === "caritas") {
        const c = CARITAS.find((x) => x.valor === v);
        return c ? `${v} - ${c.etiqueta}` : String(v);
      }
      if (p.tipo === "unica") return p.opciones?.[v as number] ?? "";
      if (p.tipo === "multiple") return (v as number[]).map((o) => p.opciones?.[o] ?? "").join(" | ");
      return String(v);
    });
    return e.anonima ? celdas : [u?.nombre ?? "Ex colaborador", u?.rol ?? "", r.created_at.slice(0, 10), ...celdas];
  });

  if (e.anonima) {
    for (let i = filas.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [filas[i], filas[j]] = [filas[j], filas[i]];
    }
  }

  const contenido =
    "﻿" + [encabezado, ...filas].map((fila) => fila.map((c) => celdaCsv(c)).join(";")).join("\r\n");
  const nombreArchivo = `encuesta-${e.titulo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)}.csv`;

  return { exito: true, nombreArchivo, contenido };
}
