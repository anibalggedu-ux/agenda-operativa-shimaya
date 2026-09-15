import { supabaseServer } from "@/lib/supabase-server";

// Lógica compartida entre coordinador/actions.ts (obtenerHistorialTienda,
// solo coordinador) y analitica/actions.ts (obtenerHistorialTiendaAnalitica,
// cualquier rol) -- antes estaba duplicada byte a byte en ambos archivos.
// Cada uno mantiene su propio control de acceso y solo delega aquí la
// consulta y el armado del resultado.

export type ObservacionTiendaCompartida = {
  fecha: string;
  usuarioNombre: string;
  rol: string;
  observacion: string;
  actividad: string | null;
};

export type VisitanteTiendaCompartida = { usuarioNombre: string; rol: string; visitas: number };

export type SupervisorPermanenteTiendaCompartida = { usuarioNombre: string; rol: string };

export type HistorialTiendaCompartido = {
  tiendaNombre: string;
  totalVisitas: number;
  observaciones: ObservacionTiendaCompartida[];
  visitantes: VisitanteTiendaCompartida[];
  supervisoresPermanentes: SupervisorPermanenteTiendaCompartida[];
};

export async function cargarHistorialTienda(
  tiendaId: string,
  desde: string,
  hasta: string
): Promise<HistorialTiendaCompartido> {
  const supabase = supabaseServer();

  const [
    { data: tienda, error: errorTienda },
    { data, error },
    { data: permanentes, error: errorPermanentes },
  ] = await Promise.all([
    supabase.from("tiendas").select("nombre").eq("id", tiendaId).maybeSingle(),
    supabase
      .from("rutas_diarias")
      .select("fecha, usuario_id, rol, observacion, actividad, usuarios(nombre)")
      .eq("tienda_id", tiendaId)
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha", { ascending: false }),
    supabase
      .from("tiendas_permanentes")
      .select("usuarios(nombre, rol)")
      .eq("tienda_id", tiendaId)
      .is("fecha_fin", null),
  ]);

  if (errorTienda || error || errorPermanentes) {
    throw new Error("No se pudo cargar el historial de la tienda.");
  }

  const filas = data ?? [];

  // "Total visitas" y el conteo por colaborador cuentan visitas, no
  // reportes: si la misma persona escribió más de un reporte de esta tienda
  // el mismo día, eso sigue siendo UNA visita (aunque abajo se muestren
  // todas las observaciones escritas, esas sí completas, una por una).
  const visitasUnicas = new Set(filas.map((r: any) => `${r.usuario_id}|${r.fecha}`));

  const visitantesMap = new Map<string, VisitanteTiendaCompartida>();
  const usuarioFechaContado = new Set<string>();
  filas.forEach((r: any) => {
    const clave = `${r.usuario_id}|${r.fecha}`;
    const nombre = r.usuarios?.nombre ?? "—";
    if (!usuarioFechaContado.has(clave)) {
      usuarioFechaContado.add(clave);
      const existente = visitantesMap.get(nombre);
      if (existente) existente.visitas += 1;
      else visitantesMap.set(nombre, { usuarioNombre: nombre, rol: r.rol ?? "—", visitas: 1 });
    }
  });

  return {
    tiendaNombre: tienda?.nombre ?? "—",
    totalVisitas: visitasUnicas.size,
    observaciones: filas.map((r: any) => ({
      fecha: r.fecha,
      usuarioNombre: r.usuarios?.nombre ?? "—",
      rol: r.rol,
      observacion: r.observacion,
      actividad: r.actividad,
    })),
    visitantes: Array.from(visitantesMap.values()).sort((a, b) => b.visitas - a.visitas),
    supervisoresPermanentes: (permanentes ?? []).map((p: any) => ({
      usuarioNombre: p.usuarios?.nombre ?? "—",
      rol: p.usuarios?.rol ?? "—",
    })),
  };
}
