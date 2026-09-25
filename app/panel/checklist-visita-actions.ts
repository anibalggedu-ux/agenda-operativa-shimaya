"use server";

import { cargarFotosEvidencia } from "@/lib/evidencias";
import type { FotoEvidencia } from "@/lib/evidencias-constantes";
import { supabaseServer } from "@/lib/supabase-server";
import { obtenerSesion } from "@/lib/session";
import { enviarCorreo, URL_APP } from "@/lib/email";
import { formatearFechaLegible } from "@/lib/fechas";
import {
  AREAS_CHECKLIST,
  calcularPuntaje,
  puntajeSeccion,
  textoPuntajesArea,
  type AreaChecklist,
  type ClasificacionChecklist,
  type PuntajesArea,
  type RespuestasChecklist,
  type SeccionChecklist,
} from "@/lib/checklist-puntaje";

// ---------------------------------------------------------------------
// Checklist de rutina de visita: formulario opcional que capacitadores,
// supervisores y coordinadores pueden llenar al visitar una tienda (aparte
// del reporte normal de bitácora). La estructura (secciones/preguntas) vive
// en plantilla_checklist_visita como JSON y se edita desde Registro -- ver
// app/panel/registro/checklist-visita-admin-actions.ts. Cada tipo de
// pregunta tiene su propio formato de respuesta, pero el tipo en sí no
// cambia una vez creada la pregunta (ver esa nota en el admin).
// ---------------------------------------------------------------------

export type {
  TipoItemChecklist,
  ItemChecklist,
  SeccionChecklist,
  RespuestasChecklist,
  ClasificacionChecklist,
  AreaChecklist,
  PuntajesArea,
} from "@/lib/checklist-puntaje";

// Nota final ponderada por área -- ver lib/checklist-puntaje.ts.
export async function calcularPuntajeChecklist(
  secciones: SeccionChecklist[],
  respuestas: RespuestasChecklist
): Promise<{ porcentaje: number | null; clasificacion: ClasificacionChecklist | null; areas: PuntajesArea | null }> {
  return calcularPuntaje(secciones, respuestas);
}

async function exigirRolConChecklist() {
  const sesion = await obtenerSesion();
  if (
    !sesion ||
    (sesion.rol !== "capacitador" && sesion.rol !== "supervisor" && sesion.rol !== "coordinador")
  ) {
    throw new Error("No autorizado.");
  }
  return sesion;
}

export async function obtenerPlantillaChecklistVisita(): Promise<SeccionChecklist[]> {
  const sesion = await obtenerSesion();
  if (!sesion) throw new Error("No autorizado.");

  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("plantilla_checklist_visita")
    .select("secciones")
    .eq("id", "principal")
    .maybeSingle();

  if (error) throw new Error("No se pudo cargar el checklist.");
  return (data?.secciones as unknown as SeccionChecklist[]) ?? [];
}

export type ResultadoChecklist = {
  exito: boolean;
  mensaje?: string;
  id?: string;
  porcentaje?: number | null;
  clasificacion?: ClasificacionChecklist | null;
  areas?: PuntajesArea | null;
};

const ENLACE_CHECKLIST = (id: string) => `${URL_APP}/panel/supervisor?seccion=analitica&checklist=${id}`;

// Avisa al/a los supervisor(es) encargado(s) fijo(s) de la tienda (tabla
// tiendas_permanentes) que se llenó un checklist -- igual que ya se hace con
// las observaciones de tiendas fijas. Si el mismo encargado fue quien llenó
// el checklist, no se le avisa a sí mismo. Nunca debe romper el guardado si
// falla el correo.
async function notificarEncargadoChecklist(
  tiendaId: string,
  usuarioIdQueLleno: string,
  checklistId: string,
  porcentaje: number | null,
  clasificacion: ClasificacionChecklist | null,
  areas: PuntajesArea | null,
  usuarioNombre: string,
  fecha: string
): Promise<void> {
  try {
    const supabase = supabaseServer();
    const { data: tienda } = await supabase.from("tiendas").select("nombre").eq("id", tiendaId).maybeSingle();

    const { data: fijas } = await supabase
      .from("tiendas_permanentes")
      .select("usuarios(id, nombre, email, activo)")
      .eq("tienda_id", tiendaId);

    const encargados = (fijas ?? [])
      .map((f: any) => f.usuarios)
      .filter((u: any) => u && u.activo && u.id !== usuarioIdQueLleno);

    if (encargados.length === 0) return;

    const correos = encargados.map((u: any) => u.email).filter((e: string | null): e is string => !!e);
    if (correos.length === 0) return;

    const tiendaNombre = tienda?.nombre ?? "—";
    const textoPuntaje =
      porcentaje !== null ? `${porcentaje}% (${clasificacion})` : "sin puntaje calculable";

    await enviarCorreo({
      para: correos,
      tituloEmoji: "📋",
      asunto: `Nuevo checklist de rutina en ${tiendaNombre} — ${textoPuntaje}`,
      cuerpoHtml: `
        <p><strong>${usuarioNombre}</strong> llenó el checklist de rutina de visita en tu tienda fija
        <strong>${tiendaNombre}</strong> el ${formatearFechaLegible(fecha)}.</p>
        <p style="margin:0 0 16px;"><strong>Puntaje:</strong> ${textoPuntaje}${
          textoPuntajesArea(areas) ? `<br>${textoPuntajesArea(areas)}` : ""
        }</p>
        <p style="margin:0 0 16px;">
          <a href="${ENLACE_CHECKLIST(checklistId)}" style="color:#e23744; font-weight:700;">Ver los resultados completos →</a>
        </p>
      `,
    });
  } catch (error) {
    console.error("No se pudo notificar el checklist al encargado:", error);
  }
}

export async function guardarChecklistVisita(
  tiendaId: string,
  fecha: string,
  respuestas: RespuestasChecklist
): Promise<ResultadoChecklist> {
  const sesion = await exigirRolConChecklist();

  if (!tiendaId || !fecha) {
    return { exito: false, mensaje: "Selecciona la tienda y la fecha." };
  }

  const secciones = await obtenerPlantillaChecklistVisita();
  const { porcentaje, clasificacion, areas } = calcularPuntaje(secciones, respuestas);

  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("checklists_visita")
    .insert({
      tienda_id: tiendaId,
      usuario_id: sesion.id,
      usuario_nombre: sesion.nombre,
      rol: sesion.rol,
      fecha,
      respuestas,
      porcentaje,
      clasificacion,
      puntajes_area: areas,
    })
    .select("id")
    .single();

  if (error || !data) return { exito: false, mensaje: "No se pudo guardar el checklist." };

  await notificarEncargadoChecklist(
    tiendaId,
    sesion.id,
    data.id,
    porcentaje,
    clasificacion,
    areas,
    sesion.nombre,
    fecha
  );

  return { exito: true, id: data.id, porcentaje, clasificacion, areas };
}

export type ChecklistVisitaResumen = {
  id: string;
  tiendaId: string;
  tiendaNombre: string;
  usuarioNombre: string;
  rol: string;
  fecha: string;
  porcentaje: number | null;
  clasificacion: ClasificacionChecklist | null;
};

export async function obtenerChecklistsVisita(
  desde: string,
  hasta: string
): Promise<ChecklistVisitaResumen[]> {
  const sesion = await obtenerSesion();
  if (!sesion) throw new Error("No autorizado.");

  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("checklists_visita")
    .select("id, tienda_id, usuario_nombre, rol, fecha, porcentaje, clasificacion, tiendas(nombre)")
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha", { ascending: false });

  if (error) throw new Error("No se pudo cargar los checklists.");

  return (data ?? []).map((c: any) => ({
    id: c.id,
    tiendaId: c.tienda_id,
    tiendaNombre: c.tiendas?.nombre ?? "—",
    usuarioNombre: c.usuario_nombre,
    rol: c.rol,
    fecha: c.fecha,
    porcentaje: c.porcentaje,
    clasificacion: c.clasificacion,
  }));
}

export type ChecklistVisitaDetalle = {
  id: string;
  fotos: FotoEvidencia[];
  tiendaNombre: string;
  usuarioNombre: string;
  rol: string;
  fecha: string;
  respuestas: RespuestasChecklist;
  porcentaje: number | null;
  clasificacion: ClasificacionChecklist | null;
  // null en checklists guardados antes de la nota por áreas.
  areas: PuntajesArea | null;
};

export type PromedioTienda = { tiendaNombre: string; promedio: number };
export type PromedioSeccion = { seccion: string; promedio: number };
export type PromedioArea = { area: AreaChecklist; nombre: string; peso: number; promedio: number };
export type ChecklistsPorDia = { fecha: string; cantidad: number };
export type AlertaChecklistCritica = {
  id: string;
  tiendaNombre: string;
  fecha: string;
  usuarioNombre: string;
  porcentaje: number;
};

export type AgregadosChecklistVisita = {
  resumen: ChecklistVisitaResumen[];
  totalChecklists: number;
  promedioGeneral: number | null;
  totalAccionInmediata: number;
  tiendaLider: PromedioTienda | null;
  alertasCriticas: AlertaChecklistCritica[];
  checklistsPorDia: ChecklistsPorDia[];
  promedioGeneralPorTienda: PromedioTienda[];
  promedioPorSeccion: PromedioSeccion[];
  promedioPorArea: PromedioArea[];
};

export async function obtenerAgregadosChecklistVisita(
  desde: string,
  hasta: string
): Promise<AgregadosChecklistVisita> {
  const sesion = await obtenerSesion();
  if (!sesion) throw new Error("No autorizado.");

  const supabase = supabaseServer();
  const [{ data, error }, secciones] = await Promise.all([
    supabase
      .from("checklists_visita")
      .select("id, tienda_id, usuario_nombre, rol, fecha, respuestas, porcentaje, clasificacion, puntajes_area, tiendas(nombre)")
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha", { ascending: false }),
    obtenerPlantillaChecklistVisita(),
  ]);

  if (error) throw new Error("No se pudo cargar los checklists.");
  const filas = (data ?? []) as any[];

  const resumen: ChecklistVisitaResumen[] = filas.map((c) => ({
    id: c.id,
    tiendaId: c.tienda_id,
    tiendaNombre: c.tiendas?.nombre ?? "—",
    usuarioNombre: c.usuario_nombre,
    rol: c.rol,
    fecha: c.fecha,
    porcentaje: c.porcentaje,
    clasificacion: c.clasificacion,
  }));

  // ---- KPIs ----
  const conPuntaje = filas.filter((c) => c.porcentaje !== null && c.porcentaje !== undefined);
  const promedioGeneral =
    conPuntaje.length === 0
      ? null
      : Math.round(conPuntaje.reduce((s, c) => s + c.porcentaje, 0) / conPuntaje.length);
  const totalAccionInmediata = filas.filter((c) => c.clasificacion === "Acción inmediata").length;

  // ---- Promedio general por tienda (para el gráfico y la tienda líder) ----
  const generalPorTienda = new Map<string, { suma: number; n: number }>();
  filas.forEach((c) => {
    if (c.porcentaje === null || c.porcentaje === undefined) return;
    const nombre = c.tiendas?.nombre ?? "—";
    const actual = generalPorTienda.get(nombre) ?? { suma: 0, n: 0 };
    generalPorTienda.set(nombre, { suma: actual.suma + c.porcentaje, n: actual.n + 1 });
  });
  const promedioGeneralPorTienda = Array.from(generalPorTienda.entries())
    .map(([tiendaNombre, { suma, n }]) => ({
      tiendaNombre,
      promedio: Math.round(suma / n),
    }))
    .sort((a, b) => b.promedio - a.promedio);
  const tiendaLider = promedioGeneralPorTienda[0] ?? null;

  // ---- Alertas críticas: checklists en "Acción inmediata" ----
  const alertasCriticas: AlertaChecklistCritica[] = filas
    .filter((c) => c.clasificacion === "Acción inmediata")
    .map((c) => ({
      id: c.id,
      tiendaNombre: c.tiendas?.nombre ?? "—",
      fecha: c.fecha,
      usuarioNombre: c.usuario_nombre,
      porcentaje: c.porcentaje,
    }))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));

  // ---- Checklists por día (actividad) ----
  const porDiaMap = new Map<string, number>();
  filas.forEach((c) => porDiaMap.set(c.fecha, (porDiaMap.get(c.fecha) ?? 0) + 1));
  const checklistsPorDia = Array.from(porDiaMap.entries())
    .map(([fecha, cantidad]) => ({ fecha, cantidad }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  // ---- Promedio por sección: para cada checklist se calcula su propio
  // sub-puntaje de esa sección (si respondió algo puntuable ahí), y luego se
  // promedian esos sub-puntajes entre checklists -- mismo criterio que el
  // puntaje general (cada checklist pesa igual, no cada pregunta suelta). ----
  const seccionAcum = new Map<string, { suma: number; n: number }>();
  filas.forEach((c) => {
    secciones.forEach((s) => {
      const subPuntaje = puntajeSeccion(s, c.respuestas);
      if (subPuntaje === null) return;
      const actual = seccionAcum.get(s.titulo) ?? { suma: 0, n: 0 };
      seccionAcum.set(s.titulo, { suma: actual.suma + subPuntaje, n: actual.n + 1 });
    });
  });
  const promedioPorSeccion = Array.from(seccionAcum.entries())
    .map(([seccion, { suma, n }]) => ({ seccion, promedio: Math.round(suma / n) }))
    .sort((a, b) => b.promedio - a.promedio);

  // ---- Promedio por área: de la nota por área guardada en cada checklist
  // (solo los guardados desde que existe la nota por áreas). ----
  const promedioPorArea: PromedioArea[] = AREAS_CHECKLIST.flatMap((a) => {
    const notas = filas
      .map((c) => (c.puntajes_area as PuntajesArea | null)?.[a.clave])
      .filter((n): n is number => typeof n === "number");
    if (notas.length === 0) return [];
    return [
      {
        area: a.clave,
        nombre: a.nombre,
        peso: a.peso,
        promedio: Math.round(notas.reduce((x, y) => x + y, 0) / notas.length),
      },
    ];
  });

  return {
    resumen,
    totalChecklists: filas.length,
    promedioGeneral,
    totalAccionInmediata,
    tiendaLider,
    alertasCriticas,
    checklistsPorDia,
    promedioGeneralPorTienda,
    promedioPorSeccion,
    promedioPorArea,
  };
}

export async function obtenerDetalleChecklistVisita(id: string): Promise<ChecklistVisitaDetalle> {
  const sesion = await obtenerSesion();
  if (!sesion) throw new Error("No autorizado.");

  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("checklists_visita")
    .select("id, usuario_nombre, rol, fecha, respuestas, porcentaje, clasificacion, puntajes_area, tiendas(nombre)")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) throw new Error("No se pudo cargar el checklist.");

  return {
    id: data.id,
    tiendaNombre: (data as any).tiendas?.nombre ?? "—",
    usuarioNombre: data.usuario_nombre,
    rol: data.rol,
    fecha: data.fecha,
    respuestas: data.respuestas as unknown as RespuestasChecklist,
    porcentaje: data.porcentaje,
    clasificacion: data.clasificacion as ClasificacionChecklist | null,
    areas: ((data as any).puntajes_area as PuntajesArea | null) ?? null,
    fotos: await cargarFotosEvidencia(supabase, "checklist", data.id),
  };
}
