"use server";

import { supabaseServer } from "@/lib/supabase-server";
import { obtenerSesion } from "@/lib/session";

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
};

export type SeccionChecklist = {
  clave: string;
  titulo: string;
  items: ItemChecklist[];
};

export type RespuestasChecklist = Record<string, Record<string, string | number | null>>;

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

export type ResultadoChecklist = { exito: boolean; mensaje?: string; id?: string };

export async function guardarChecklistVisita(
  tiendaId: string,
  fecha: string,
  respuestas: RespuestasChecklist
): Promise<ResultadoChecklist> {
  const sesion = await exigirRolConChecklist();

  if (!tiendaId || !fecha) {
    return { exito: false, mensaje: "Selecciona la tienda y la fecha." };
  }

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
    })
    .select("id")
    .single();

  if (error || !data) return { exito: false, mensaje: "No se pudo guardar el checklist." };

  return { exito: true, id: data.id };
}

export type ChecklistVisitaResumen = {
  id: string;
  tiendaId: string;
  tiendaNombre: string;
  usuarioNombre: string;
  rol: string;
  fecha: string;
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
    .select("id, tienda_id, usuario_nombre, rol, fecha, tiendas(nombre)")
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
  }));
}

export type ChecklistVisitaDetalle = {
  id: string;
  tiendaNombre: string;
  usuarioNombre: string;
  rol: string;
  fecha: string;
  respuestas: RespuestasChecklist;
};

export type PromedioCajaPorTienda = { tiendaNombre: string; promedio: number };
export type DistribucionOpcion = { opcion: string; cantidad: number };

export type AgregadosChecklistVisita = {
  resumen: ChecklistVisitaResumen[];
  promedioCajaPorTienda: PromedioCajaPorTienda[];
  distribucionNeveras: DistribucionOpcion[];
};

// Los dos gráficos de arranque (Central Analítica): promedio de Caja por
// tienda y distribución del estado de Neveras. Se leen directo de las claves
// del checklist original ("caja"/"neveras") -- si algún día se necesitan más
// gráficos específicos, se agregan aquí de la misma forma sin tocar lo demás.
export async function obtenerAgregadosChecklistVisita(
  desde: string,
  hasta: string
): Promise<AgregadosChecklistVisita> {
  const sesion = await obtenerSesion();
  if (!sesion) throw new Error("No autorizado.");

  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("checklists_visita")
    .select("id, tienda_id, usuario_nombre, rol, fecha, respuestas, tiendas(nombre)")
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha", { ascending: false });

  if (error) throw new Error("No se pudo cargar los checklists.");
  const filas = (data ?? []) as any[];

  const resumen: ChecklistVisitaResumen[] = filas.map((c) => ({
    id: c.id,
    tiendaId: c.tienda_id,
    tiendaNombre: c.tiendas?.nombre ?? "—",
    usuarioNombre: c.usuario_nombre,
    rol: c.rol,
    fecha: c.fecha,
  }));

  const cajaPorTienda = new Map<string, { suma: number; n: number }>();
  filas.forEach((c) => {
    const caja = c.respuestas?.caja;
    if (!caja) return;
    const valores = [caja.orden, caja.limpieza, caja.organizacion].filter(
      (v) => typeof v === "number"
    ) as number[];
    if (valores.length === 0) return;
    const promedio = valores.reduce((a, b) => a + b, 0) / valores.length;
    const nombre = c.tiendas?.nombre ?? "—";
    const actual = cajaPorTienda.get(nombre) ?? { suma: 0, n: 0 };
    cajaPorTienda.set(nombre, { suma: actual.suma + promedio, n: actual.n + 1 });
  });
  const promedioCajaPorTienda = Array.from(cajaPorTienda.entries())
    .map(([tiendaNombre, { suma, n }]) => ({
      tiendaNombre,
      promedio: Math.round((suma / n) * 10) / 10,
    }))
    .sort((a, b) => b.promedio - a.promedio);

  const distribucionMap = new Map<string, number>();
  filas.forEach((c) => {
    const valor = c.respuestas?.neveras?.limpieza;
    if (!valor) return;
    distribucionMap.set(valor, (distribucionMap.get(valor) ?? 0) + 1);
  });
  const distribucionNeveras = Array.from(distribucionMap.entries()).map(([opcion, cantidad]) => ({
    opcion,
    cantidad,
  }));

  return { resumen, promedioCajaPorTienda, distribucionNeveras };
}

export async function obtenerDetalleChecklistVisita(id: string): Promise<ChecklistVisitaDetalle> {
  const sesion = await obtenerSesion();
  if (!sesion) throw new Error("No autorizado.");

  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("checklists_visita")
    .select("id, usuario_nombre, rol, fecha, respuestas, tiendas(nombre)")
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
  };
}
