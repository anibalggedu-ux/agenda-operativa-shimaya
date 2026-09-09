"use server";

import { supabaseServer } from "@/lib/supabase-server";
import { obtenerSesion } from "@/lib/session";
import { tieneAccesoAuditoria } from "@/lib/permisos";

async function exigirSesion() {
  const sesion = await obtenerSesion();
  if (!sesion) throw new Error("No autorizado.");
  return sesion;
}

async function exigirPuedeAuditar() {
  const sesion = await exigirSesion();
  const permitido = await tieneAccesoAuditoria(sesion.id);
  if (!permitido) throw new Error("No autorizado.");
  return sesion;
}

export type ItemFormulario = { id: string; categoria: string; item: string };

export async function obtenerPlantillaParaFormulario(): Promise<ItemFormulario[]> {
  await exigirSesion();
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("plantilla_auditoria_items")
    .select("id, categoria, item")
    .order("categoria")
    .order("orden");

  if (error) throw new Error("No se pudo cargar el checklist.");
  return data ?? [];
}

export type TiendaBasicaAuditoria = { id: string; nombre: string };

export async function obtenerTiendasAuditoria(): Promise<TiendaBasicaAuditoria[]> {
  await exigirSesion();
  const supabase = supabaseServer();

  const { data, error } = await supabase.from("tiendas").select("id, nombre").order("nombre");
  if (error) throw new Error("No se pudo cargar las tiendas.");
  return data ?? [];
}

const ALERTAS_VALIDAS = [
  "Riesgo sanitario",
  "Falta grave de protocolo",
  "Equipos inoperativos",
  "Falta de personal crítico",
  "Incumplimiento reiterativo de estándares",
  "Reclamos recurrentes sin solución",
];

// Se clasifica por porcentaje (no por puntaje crudo) porque la plantilla es
// editable — si mañana hay más o menos ítems, el puntaje máximo cambia, pero
// el porcentaje y sus bandas siguen siendo válidos sin tocar nada.
function clasificar(porcentaje: number): string {
  if (porcentaje >= 90) return "Excelente";
  if (porcentaje >= 75) return "Bueno";
  if (porcentaje >= 60) return "Requiere mejora";
  return "Acción inmediata";
}

export type ResultadoAuditoria = { exito: boolean; mensaje?: string };

const FILAS_COMPROMISOS = 5;

export async function crearAuditoria(
  _prevState: ResultadoAuditoria,
  formData: FormData
): Promise<ResultadoAuditoria> {
  const sesion = await exigirPuedeAuditar();
  const supabase = supabaseServer();

  const tiendaId = String(formData.get("tiendaId") || "");
  const fecha = String(formData.get("fecha") || "");
  const lider = String(formData.get("lider") || "").trim();

  if (!tiendaId || !fecha) {
    return { exito: false, mensaje: "Selecciona la sede y la fecha." };
  }

  const { data: plantilla, error: errorPlantilla } = await supabase
    .from("plantilla_auditoria_items")
    .select("id, categoria, item")
    .order("categoria")
    .order("orden");

  if (errorPlantilla || !plantilla || plantilla.length === 0) {
    return { exito: false, mensaje: "No se pudo cargar el checklist." };
  }

  const items: { categoria: string; item: string; puntaje: number }[] = [];
  for (const p of plantilla) {
    const valor = formData.get(`item_${p.id}`);
    if (valor === null) {
      return { exito: false, mensaje: `Falta calificar: "${p.item}".` };
    }
    items.push({ categoria: p.categoria, item: p.item, puntaje: Number(valor) });
  }

  const categorias = Array.from(new Set(plantilla.map((p) => p.categoria)));
  const observaciones: Record<string, string> = {};
  categorias.forEach((cat, i) => {
    const texto = String(formData.get(`obs_${i}`) || "").trim();
    if (texto) observaciones[cat] = texto;
  });

  const compromisos: { accion: string; responsable: string; fecha: string }[] = [];
  for (let i = 0; i < FILAS_COMPROMISOS; i++) {
    const accion = String(formData.get(`compromiso_accion_${i}`) || "").trim();
    const responsable = String(formData.get(`compromiso_responsable_${i}`) || "").trim();
    const fechaCompromiso = String(formData.get(`compromiso_fecha_${i}`) || "").trim();
    if (accion || responsable || fechaCompromiso) {
      compromisos.push({ accion, responsable, fecha: fechaCompromiso });
    }
  }

  const alertas = formData
    .getAll("alertas")
    .map(String)
    .filter((a) => ALERTAS_VALIDAS.includes(a));

  const puntajeTotal = items.reduce((s, it) => s + it.puntaje, 0);
  const puntajeMaximo = items.length * 2;
  const porcentaje = puntajeMaximo > 0 ? Math.round((puntajeTotal / puntajeMaximo) * 100) : 0;
  const clasificacion = clasificar(porcentaje);

  const { error } = await supabase.from("auditorias").insert({
    tienda_id: tiendaId,
    fecha,
    lider: lider || null,
    supervisor_id: sesion.id,
    supervisor_nombre: sesion.nombre,
    items,
    observaciones,
    fortalezas: String(formData.get("fortalezas") || "").trim() || null,
    oportunidades: String(formData.get("oportunidades") || "").trim() || null,
    compromisos,
    alertas,
    puntaje_total: puntajeTotal,
    puntaje_maximo: puntajeMaximo,
    porcentaje,
    clasificacion,
  });

  if (error) return { exito: false, mensaje: "No se pudo guardar la auditoría." };
  return { exito: true, mensaje: `Auditoría guardada — ${porcentaje}% (${clasificacion}).` };
}

export type AuditoriaResumen = {
  id: string;
  tiendaNombre: string;
  fecha: string;
  supervisorNombre: string;
  porcentaje: number;
  clasificacion: string;
  alertas: string[];
};

function mapearResumen(a: any): AuditoriaResumen {
  return {
    id: a.id,
    tiendaNombre: a.tiendas?.nombre ?? "—",
    fecha: a.fecha,
    supervisorNombre: a.supervisor_nombre,
    porcentaje: a.porcentaje,
    clasificacion: a.clasificacion,
    alertas: a.alertas ?? [],
  };
}

export async function obtenerMisAuditorias(): Promise<AuditoriaResumen[]> {
  const sesion = await exigirSesion();
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("auditorias")
    .select("id, fecha, supervisor_nombre, porcentaje, clasificacion, alertas, tiendas(nombre)")
    .eq("supervisor_id", sesion.id)
    .order("fecha", { ascending: false });

  if (error) throw new Error("No se pudo cargar tus auditorías.");
  return (data ?? []).map(mapearResumen);
}

export async function obtenerTodasLasAuditorias(): Promise<AuditoriaResumen[]> {
  const sesion = await exigirSesion();
  if (sesion.rol !== "coordinador" && sesion.rol !== "gerente") {
    throw new Error("No autorizado.");
  }
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("auditorias")
    .select("id, fecha, supervisor_nombre, porcentaje, clasificacion, alertas, tiendas(nombre)")
    .order("fecha", { ascending: false });

  if (error) throw new Error("No se pudo cargar las auditorías.");
  return (data ?? []).map(mapearResumen);
}

export type DetalleAuditoria = AuditoriaResumen & {
  lider: string | null;
  items: { categoria: string; item: string; puntaje: number }[];
  observaciones: Record<string, string>;
  fortalezas: string | null;
  oportunidades: string | null;
  compromisos: { accion: string; responsable: string; fecha: string }[];
  puntajeTotal: number;
  puntajeMaximo: number;
};

export async function obtenerDetalleAuditoria(id: string): Promise<DetalleAuditoria> {
  const sesion = await exigirSesion();
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("auditorias")
    .select("*, tiendas(nombre)")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) throw new Error("No se pudo cargar la auditoría.");

  const esPropia = data.supervisor_id === sesion.id;
  const esAdmin = sesion.rol === "coordinador" || sesion.rol === "gerente";
  if (!esPropia && !esAdmin) throw new Error("No autorizado.");

  return {
    id: data.id,
    tiendaNombre: data.tiendas?.nombre ?? "—",
    fecha: data.fecha,
    supervisorNombre: data.supervisor_nombre,
    porcentaje: data.porcentaje,
    clasificacion: data.clasificacion,
    alertas: data.alertas ?? [],
    lider: data.lider,
    items: data.items ?? [],
    observaciones: data.observaciones ?? {},
    fortalezas: data.fortalezas,
    oportunidades: data.oportunidades,
    compromisos: data.compromisos ?? [],
    puntajeTotal: data.puntaje_total,
    puntajeMaximo: data.puntaje_maximo,
  };
}
