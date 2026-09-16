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

// Solo escala_5, si_no, y opciones-con-puntajes-definidos cuentan para el
// puntaje final -- texto, número, y opciones sin puntajes configurados son
// informativos y se ignoran. Preguntas sin responder tampoco cuentan (no se
// penaliza por dejar algo en blanco en un checklist opcional).
export function calcularPuntajeChecklist(
  secciones: SeccionChecklist[],
  respuestas: RespuestasChecklist
): { porcentaje: number | null; clasificacion: ClasificacionChecklist | null } {
  let suma = 0;
  let cantidad = 0;

  secciones.forEach((s) => {
    s.items.forEach((it) => {
      const valor = respuestas[s.clave]?.[it.clave];
      if (valor === null || valor === undefined || valor === "") return;

      if (it.tipo === "escala_5" && typeof valor === "number") {
        suma += (valor / 5) * 100;
        cantidad++;
      } else if (it.tipo === "si_no") {
        const esSi = valor === "true";
        const bueno = it.siNoBueno === "no" ? !esSi : esSi;
        suma += bueno ? 100 : 0;
        cantidad++;
      } else if (it.tipo === "opciones" && it.puntajes && typeof valor === "string") {
        const puntaje = it.puntajes[valor];
        if (puntaje !== undefined) {
          suma += puntaje;
          cantidad++;
        }
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
  const { porcentaje, clasificacion } = calcularPuntajeChecklist(secciones, respuestas);

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

export type PromedioCajaPorTienda = { tiendaNombre: string; promedio: number };
export type DistribucionOpcion = { opcion: string; cantidad: number };

export type AgregadosChecklistVisita = {
  resumen: ChecklistVisitaResumen[];
  promedioGeneralPorTienda: PromedioCajaPorTienda[];
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
    .select("id, tienda_id, usuario_nombre, rol, fecha, respuestas, porcentaje, clasificacion, tiendas(nombre)")
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
    porcentaje: c.porcentaje,
    clasificacion: c.clasificacion,
  }));

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

  return { resumen, promedioGeneralPorTienda, promedioCajaPorTienda, distribucionNeveras };
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
