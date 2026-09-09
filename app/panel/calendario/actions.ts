"use server";

import { supabaseServer } from "@/lib/supabase-server";
import { obtenerSesion } from "@/lib/session";

export type TipoEventoCalendario =
  | "ruta"
  | "vacaciones"
  | "permiso"
  | "descanso_medico"
  | "mision_especial"
  | "evento";

export type EventoCalendario = {
  fecha: string;
  tipo: TipoEventoCalendario;
  personaId: string | null;
  personaNombre: string | null;
  detalle: string;
};

export type PersonaDescanso = {
  id: string;
  nombre: string;
  rol: string;
  diasDescanso: string[];
};

export type DatosCalendario = {
  eventos: EventoCalendario[];
  personas: PersonaDescanso[];
};

const TIPO_ASIGNACION: Record<string, TipoEventoCalendario> = {
  Vacaciones: "vacaciones",
  Permiso: "permiso",
  "Descanso Médico": "descanso_medico",
  "Misión Especial": "mision_especial",
};

function rangoMes(anio: number, mes: number): { inicio: string; fin: string } {
  const inicio = `${anio}-${String(mes).padStart(2, "0")}-01`;
  const ultimoDia = new Date(anio, mes, 0).getDate();
  const fin = `${anio}-${String(mes).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}`;
  return { inicio, fin };
}

// Recorta el rango de una asignación especial (que puede empezar antes o
// terminar después del mes visible) a los días que caen dentro del mes, y
// devuelve cada fecha individual dentro de ese recorte.
function expandirRango(fechaInicio: string, fechaFin: string, inicioMes: string, finMes: string): string[] {
  const desde = fechaInicio < inicioMes ? inicioMes : fechaInicio;
  const hasta = fechaFin > finMes ? finMes : fechaFin;
  const fechas: string[] = [];
  const cursor = new Date(desde + "T00:00:00");
  const limite = new Date(hasta + "T00:00:00");
  while (cursor <= limite) {
    fechas.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  return fechas;
}

async function exigirSesion() {
  const sesion = await obtenerSesion();
  if (!sesion) throw new Error("No autorizado.");
  return sesion;
}

async function cargarCalendario(
  anio: number,
  mes: number,
  usuarioId: string | null
): Promise<DatosCalendario> {
  const { inicio, fin } = rangoMes(anio, mes);
  const supabase = supabaseServer();

  let consultaRutas = supabase
    .from("rutas_activas")
    .select("fecha_planificada, usuario_id, usuarios(nombre), tiendas(nombre)")
    .gte("fecha_planificada", inicio)
    .lte("fecha_planificada", fin);
  if (usuarioId) consultaRutas = consultaRutas.eq("usuario_id", usuarioId);

  let consultaEspeciales = supabase
    .from("asignaciones_especiales")
    .select("tipo, fecha_inicio, fecha_fin, motivo, usuario_id, usuarios(nombre)")
    .lte("fecha_inicio", fin)
    .gte("fecha_fin", inicio);
  if (usuarioId) consultaEspeciales = consultaEspeciales.eq("usuario_id", usuarioId);

  const consultaComunicados = supabase
    .from("comunicados")
    .select("tipo, mensaje, fecha_evento, ubicacion")
    .not("fecha_evento", "is", null)
    .gte("fecha_evento", inicio)
    .lte("fecha_evento", fin);

  let consultaPersonas = supabase
    .from("usuarios")
    .select("id, nombre, rol, dias_descanso")
    .eq("activo", true)
    .order("nombre");
  if (usuarioId) consultaPersonas = consultaPersonas.eq("id", usuarioId);

  const [{ data: rutas }, { data: especiales }, { data: comunicados }, { data: personas }] =
    await Promise.all([consultaRutas, consultaEspeciales, consultaComunicados, consultaPersonas]);

  const eventos: EventoCalendario[] = [];

  (rutas ?? []).forEach((r: any) => {
    eventos.push({
      fecha: r.fecha_planificada,
      tipo: "ruta",
      personaId: r.usuario_id,
      personaNombre: r.usuarios?.nombre ?? "—",
      detalle: r.tiendas?.nombre ?? "Tienda",
    });
  });

  (especiales ?? []).forEach((a: any) => {
    const tipo = TIPO_ASIGNACION[a.tipo];
    if (!tipo) return;
    expandirRango(a.fecha_inicio, a.fecha_fin, inicio, fin).forEach((fecha) => {
      eventos.push({
        fecha,
        tipo,
        personaId: a.usuario_id,
        personaNombre: a.usuarios?.nombre ?? "—",
        detalle: a.motivo || a.tipo,
      });
    });
  });

  (comunicados ?? []).forEach((c: any) => {
    eventos.push({
      fecha: c.fecha_evento,
      tipo: "evento",
      personaId: null,
      personaNombre: null,
      detalle: c.ubicacion ? `${c.tipo} — ${c.ubicacion}` : c.tipo,
    });
  });

  return {
    eventos,
    personas: (personas ?? []).map((p: any) => ({
      id: p.id,
      nombre: p.nombre,
      rol: p.rol,
      diasDescanso: p.dias_descanso ?? [],
    })),
  };
}

// Coordinador y Gerente ven el calendario completo de todo el personal.
export async function obtenerCalendarioMes(anio: number, mes: number): Promise<DatosCalendario> {
  const sesion = await exigirSesion();
  if (sesion.rol !== "coordinador" && sesion.rol !== "gerente") {
    throw new Error("No autorizado.");
  }
  return cargarCalendario(anio, mes, null);
}

// Supervisor y Capacitador solo ven lo propio — el usuarioId sale siempre de
// la sesión firmada, nunca de un parámetro del cliente.
export async function obtenerMiCalendarioMes(anio: number, mes: number): Promise<DatosCalendario> {
  const sesion = await exigirSesion();
  return cargarCalendario(anio, mes, sesion.id);
}
