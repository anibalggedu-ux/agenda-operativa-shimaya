"use server";

import { supabaseServer } from "@/lib/supabase-server";
import { obtenerSesion } from "@/lib/session";
import { enviarCorreo, URL_APP } from "@/lib/email";
import { formatearFechaLegible } from "@/lib/fechas";

// ---------------------------------------------------------------------
// Checklist de rutina de visita: formulario opcional que capacitadores,
// supervisores y coordinadores pueden llenar al visitar una tienda (aparte
// del reporte normal de bitácora). La estructura (secciones/preguntas) vive
// en plantilla_checklist_visita como JSON y se edita desde Registro -- ver
// app/panel/registro/checklist-visita-admin-actions.ts. Cada tipo de
// pregunta tiene su propio formato de respuesta, pero el tipo en sí no
// cambia una vez creada la pregunta (ver esa nota en el admin).
// ---------------------------------------------------------------------

export type TipoItemChecklist = "escala_5" | "si_no" | "opciones" | "texto" | "numero";

export type ItemChecklist = {
  clave: string;
  etiqueta: string;
  tipo: TipoItemChecklist;
  opciones?: string[];
  // Puntaje 0-100 por cada opción posible -- solo para tipo "opciones". Si no
  // está definido, la pregunta es informativa y no cuenta en el puntaje final
  // (ej. "qué se visualiza" en TV no tiene una respuesta "mejor" que otra).
  puntajes?: Record<string, number>;
  // Solo para tipo "si_no": qué respuesta vale 100% -- por defecto "si" (la
  // mayoría de preguntas sí/no son "sí es bueno"), pero algo como
  // "¿Contaminación cruzada?" es al revés (no es lo bueno).
  siNoBueno?: "si" | "no";
};

export type SeccionChecklist = {
  clave: string;
  titulo: string;
  items: ItemChecklist[];
};

export type RespuestasChecklist = Record<string, Record<string, string | number | null>>;

export type ClasificacionChecklist = "Excelente" | "Bueno" | "Requiere mejora" | "Acción inmediata";

function clasificarPorcentaje(porcentaje: number): ClasificacionChecklist {
  if (porcentaje >= 90) return "Excelente";
  if (porcentaje >= 75) return "Bueno";
  if (porcentaje >= 60) return "Requiere mejora";
  return "Acción inmediata";
}

// Puntaje 0-100 de una sola respuesta, o null si el tipo de pregunta no
// puntúa (texto, número, opciones sin puntajes configurados) o si no se
// respondió. Punto único de esta regla -- lo usan tanto el puntaje general
// de un checklist como el promedio por sección en Central Analítica.
function puntajeItem(it: ItemChecklist, valor: string | number | null | undefined): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  if (it.tipo === "escala_5" && typeof valor === "number") return (valor / 5) * 100;
  if (it.tipo === "si_no") {
    const esSi = valor === "true";
    const bueno = it.siNoBueno === "no" ? !esSi : esSi;
    return bueno ? 100 : 0;
  }
  if (it.tipo === "opciones" && it.puntajes && typeof valor === "string") {
    const p = it.puntajes[valor];
    return p !== undefined ? p : null;
  }
  return null;
}

// Solo escala_5, si_no, y opciones-con-puntajes-definidos cuentan para el
// puntaje final -- texto, número, y opciones sin puntajes configurados son
// informativos y se ignoran. Preguntas sin responder tampoco cuentan (no se
// penaliza por dejar algo en blanco en un checklist opcional).
export async function calcularPuntajeChecklist(
  secciones: SeccionChecklist[],
  respuestas: RespuestasChecklist
): Promise<{ porcentaje: number | null; clasificacion: ClasificacionChecklist | null }> {
  let suma = 0;
  let cantidad = 0;

  secciones.forEach((s) => {
    s.items.forEach((it) => {
      const puntaje = puntajeItem(it, respuestas[s.clave]?.[it.clave]);
      if (puntaje !== null) {
        suma += puntaje;
        cantidad++;
      }
    });
  });

  if (cantidad === 0) return { porcentaje: null, clasificacion: null };
  const porcentaje = Math.round(suma / cantidad);
  return { porcentaje, clasificacion: clasificarPorcentaje(porcentaje) };
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
        <p style="margin:0 0 16px;"><strong>Puntaje:</strong> ${textoPuntaje}</p>
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
  const { porcentaje, clasificacion } = await calcularPuntajeChecklist(secciones, respuestas);

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
    sesion.nombre,
    fecha
  );

  return { exito: true, id: data.id, porcentaje, clasificacion };
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
  tiendaNombre: string;
  usuarioNombre: string;
  rol: string;
  fecha: string;
  respuestas: RespuestasChecklist;
  porcentaje: number | null;
  clasificacion: ClasificacionChecklist | null;
};

export type PromedioTienda = { tiendaNombre: string; promedio: number };
export type DistribucionOpcion = { opcion: string; cantidad: number };
export type PromedioSeccion = { seccion: string; promedio: number };
export type ChecklistsPorDia = { fecha: string; cantidad: number };
export type AlertaChecklistCritica = {
  id: string;
  tiendaNombre: string;
  fecha: string;
  usuarioNombre: string;
  porcentaje: number;
};
export type PreguntaOpciones = { clave: string; etiqueta: string };

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
  preguntasOpciones: PreguntaOpciones[];
  distribucionPorPregunta: Record<string, DistribucionOpcion[]>;
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
      .select("id, tienda_id, usuario_nombre, rol, fecha, respuestas, porcentaje, clasificacion, tiendas(nombre)")
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
      let suma = 0;
      let cantidad = 0;
      s.items.forEach((it) => {
        const puntaje = puntajeItem(it, c.respuestas?.[s.clave]?.[it.clave]);
        if (puntaje !== null) {
          suma += puntaje;
          cantidad++;
        }
      });
      if (cantidad === 0) return;
      const subPuntaje = suma / cantidad;
      const actual = seccionAcum.get(s.titulo) ?? { suma: 0, n: 0 };
      seccionAcum.set(s.titulo, { suma: actual.suma + subPuntaje, n: actual.n + 1 });
    });
  });
  const promedioPorSeccion = Array.from(seccionAcum.entries())
    .map(([seccion, { suma, n }]) => ({ seccion, promedio: Math.round(suma / n) }))
    .sort((a, b) => b.promedio - a.promedio);

  // ---- Distribución por pregunta de opción múltiple: cualquier pregunta
  // tipo "opciones" (tenga o no puntajes configurados) queda disponible para
  // que Central Analítica arme una torta con la que elija el usuario. ----
  const preguntasOpciones: PreguntaOpciones[] = [];
  const distribucionPorPregunta: Record<string, DistribucionOpcion[]> = {};
  secciones.forEach((s) => {
    s.items.forEach((it) => {
      if (it.tipo !== "opciones") return;
      const clave = `${s.clave}.${it.clave}`;
      preguntasOpciones.push({ clave, etiqueta: `${s.titulo} — ${it.etiqueta}` });

      const conteo = new Map<string, number>();
      filas.forEach((c) => {
        const valor = c.respuestas?.[s.clave]?.[it.clave];
        if (!valor) return;
        conteo.set(valor, (conteo.get(valor) ?? 0) + 1);
      });
      distribucionPorPregunta[clave] = Array.from(conteo.entries()).map(([opcion, cantidad]) => ({
        opcion,
        cantidad,
      }));
    });
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
    preguntasOpciones,
    distribucionPorPregunta,
  };
}

export async function obtenerDetalleChecklistVisita(id: string): Promise<ChecklistVisitaDetalle> {
  const sesion = await obtenerSesion();
  if (!sesion) throw new Error("No autorizado.");

  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("checklists_visita")
    .select("id, usuario_nombre, rol, fecha, respuestas, porcentaje, clasificacion, tiendas(nombre)")
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
  };
}
