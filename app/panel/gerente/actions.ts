"use server";

import { supabaseServer } from "@/lib/supabase-server";
import { exigirGerente, exigirGerenteOCoordinador } from "@/lib/session";
import { diaSemanaPeru, diaLaboralPeru } from "@/lib/fechas";
import { coordsDeUrlMaps, distanciaMetros } from "@/lib/distancia-recta";
import { obtenerVisitasEnRangoAnalitica } from "../analitica/actions";

function diasEntre(desdeISO: string, hastaISO: string): number {
  const [y1, m1, d1] = desdeISO.split("-").map(Number);
  const [y2, m2, d2] = hastaISO.split("-").map(Number);
  const t1 = Date.UTC(y1, m1 - 1, d1);
  const t2 = Date.UTC(y2, m2 - 1, d2);
  return Math.round((t2 - t1) / 86400000);
}

export type AlertaAtrasada = {
  id: string;
  usuarioNombre: string;
  tiendaNombre: string;
  fechaPlanificada: string;
  diasAtraso: number;
};

export type PersonaDescansando = { nombre: string; rol: string };

export type AsignacionEspecialVigente = {
  nombre: string;
  tipo: string;
  fechaInicio: string;
  fechaFin: string;
};

export type DashboardGerente = {
  kpis: {
    // Tiendas que ya enviaron su reporte hoy, y por separado las que tienen
    // ruta asignada hoy (se haya reportado o no) -- antes "tiendas
    // visitadas" contaba filas de rutas_diarias en vez de tiendas distintas
    // (una tienda con dos reportes el mismo día se contaba doble), y no
    // había forma de ver cuántas estaban asignadas sin mezclarlo con lo ya
    // reportado.
    tiendasVisitadasHoy: number;
    tiendasAsignadasHoy: number;
    reportesAtrasados: number;
    personalEnCampoHoy: number;
  };
  alertasAtrasadas: AlertaAtrasada[];
  personalDescansandoHoy: PersonaDescansando[];
  personalConAsignacionEspecial: AsignacionEspecialVigente[];
};

export async function obtenerDashboardGerente(): Promise<DashboardGerente> {
  await exigirGerente();
  const supabase = supabaseServer();
  // Día laboral, no calendario: rutas_diarias y asistencia se guardan bajo
  // diaLaboralPeru() (ver comentario en obtenerMapaOperativoHoy), así que
  // estos KPIs deben pedir el mismo día o se desalinean entre medianoche y
  // las 6am.
  const hoy = diaLaboralPeru();
  const diaSemana = diaSemanaPeru(hoy);

  const [
    visitasHoy,
    rutasActivas,
    usuariosDescanso,
    asignacionesEspeciales,
    enCampoHoy,
  ] = await Promise.all([
    supabase.from("rutas_diarias").select("tienda_id").eq("fecha", hoy),
    supabase
      .from("rutas_activas")
      .select("id, tienda_id, fecha_planificada, usuarios(nombre), tiendas!tienda_id(nombre)")
      .order("fecha_planificada", { ascending: true }),
    supabase.from("usuarios").select("nombre, rol").contains("dias_descanso", [diaSemana]),
    supabase
      .from("asignaciones_especiales")
      .select("tipo, fecha_inicio, fecha_fin, usuarios(nombre)")
      .lte("fecha_inicio", hoy)
      .gte("fecha_fin", hoy),
    supabase
      .from("asistencia")
      .select("id", { count: "exact", head: true })
      .eq("fecha", hoy)
      .not("hora_ingreso", "is", null)
      .is("hora_salida", null),
  ]);

  if (visitasHoy.error || rutasActivas.error || usuariosDescanso.error || asignacionesEspeciales.error) {
    throw new Error("No se pudo cargar el dashboard.");
  }

  const activas = (rutasActivas.data ?? []) as any[];
  const pendientesHoy = activas.filter((r) => r.fecha_planificada === hoy);
  const atrasadas = activas.filter((r) => r.fecha_planificada < hoy);

  // Tiendas distintas, no filas: si una tienda recibió dos reportes hoy (o
  // fue asignada dos veces, ej. a dos personas), sigue contando una sola vez.
  const tiendasReportadasHoy = new Set((visitasHoy.data ?? []).map((r: any) => r.tienda_id));
  const tiendasAsignadasHoy = new Set(pendientesHoy.map((r: any) => r.tienda_id));

  return {
    kpis: {
      tiendasVisitadasHoy: tiendasReportadasHoy.size,
      tiendasAsignadasHoy: tiendasAsignadasHoy.size,
      reportesAtrasados: atrasadas.length,
      personalEnCampoHoy: enCampoHoy.count ?? 0,
    },
    alertasAtrasadas: atrasadas.map((r) => ({
      id: r.id,
      usuarioNombre: r.usuarios?.nombre ?? "—",
      tiendaNombre: r.tiendas?.nombre ?? "—",
      fechaPlanificada: r.fecha_planificada,
      diasAtraso: diasEntre(r.fecha_planificada, hoy),
    })),
    personalDescansandoHoy: (usuariosDescanso.data ?? []).map((u: any) => ({
      nombre: u.nombre,
      rol: u.rol,
    })),
    personalConAsignacionEspecial: (asignacionesEspeciales.data ?? []).map((a: any) => ({
      nombre: a.usuarios?.nombre ?? "—",
      tipo: a.tipo,
      fechaInicio: a.fecha_inicio,
      fechaFin: a.fecha_fin,
    })),
  };
}

// ---------- Mapa operativo del día ----------
//
// Dónde está cada colaborador hoy, según sus asignaciones del día (mismo
// criterio de "visita" que el resto del sistema: reportada o pendiente de
// reportar, sin duplicar) cruzado con la ubicación real de cada tienda.

export type PersonaEnMapa = {
  usuarioId: string;
  usuarioNombre: string;
  rol: string;
  // Cuánto quedó el GPS de su marcación de llegada respecto a la dirección
  // registrada de la tienda — null si no marcó llegada todavía, o si esa
  // marcación no trae ubicación. El pin de la tienda no se mueve por esto;
  // solo avisa junto al nombre de la persona (ver UMBRAL_LEJOS_METROS).
  distanciaMetros: number | null;
};

export type TiendaEnMapa = {
  tiendaId: string;
  tiendaNombre: string;
  lat: number;
  lon: number;
  personas: PersonaEnMapa[];
};

// Reunión/evento con al menos una marcación de llegada hoy -- mismo criterio
// que las tarjetas de "Eventos de hoy" (asistencia_eventos), separado de las
// visitas a tienda para no mezclar ambos tipos de ubicación en la misma
// lista, aunque se muestren juntos en el mismo mapa.
export type EventoEnMapa = {
  comunicadoId: string;
  mensaje: string;
  lat: number;
  lon: number;
  personas: PersonaEnMapa[];
};

export type MapaOperativoHoy = {
  fecha: string;
  tiendas: TiendaEnMapa[];
  eventos: EventoEnMapa[];
  totalPersonas: number;
};

export async function obtenerMapaOperativoHoy(): Promise<MapaOperativoHoy> {
  await exigirGerenteOCoordinador();
  const supabase = supabaseServer();
  // "Día laboral", no el día calendario: las visitas y marcaciones de
  // madrugada (antes de las 6am) se guardan bajo el día que recién termina
  // (ver diaLaboralPeru en lib/fechas.ts). Si acá se usara hoyPeru(), entre
  // medianoche y las 6am el mapa pediría "las visitas de hoy" mientras esas
  // mismas visitas quedaron guardadas "de ayer" — el mapa se veía mezclar un
  // día con otro.
  const hoy = diaLaboralPeru();

  const [visitas, { data: tiendas, error: errorTiendas }, { data: eventosHoy, error: errorEventos }] =
    await Promise.all([
      obtenerVisitasEnRangoAnalitica(hoy, hoy),
      supabase.from("tiendas").select("id, nombre, lat, lon"),
      supabase
        .from("asistencia_eventos")
        .select("comunicado_id, usuario_id, usuarios(nombre, rol), comunicados(mensaje, lat, lon)")
        .eq("fecha", hoy)
        .not("hora_llegada", "is", null),
    ]);

  if (errorTiendas) throw new Error("No se pudo cargar el mapa operativo.");
  if (errorEventos) throw new Error("No se pudo cargar los eventos del mapa operativo.");

  const mapaTiendas = new Map((tiendas ?? []).map((t) => [t.id, t]));
  const porTienda = new Map<string, TiendaEnMapa>();
  const usuariosUnicos = new Set<string>();

  visitas.forEach((v) => {
    const tienda = mapaTiendas.get(v.tiendaId);
    if (!tienda?.lat || !tienda?.lon) return; // sin ubicación cargada — no se puede ubicar en el mapa

    usuariosUnicos.add(v.usuarioId);

    const entrada: TiendaEnMapa = porTienda.get(v.tiendaId) ?? {
      tiendaId: v.tiendaId,
      tiendaNombre: tienda.nombre,
      lat: Number(tienda.lat),
      lon: Number(tienda.lon),
      personas: [],
    };
    if (!entrada.personas.some((p) => p.usuarioId === v.usuarioId)) {
      const coordsMarcacion = coordsDeUrlMaps(v.ubicacionLlegada);
      const distancia = coordsMarcacion
        ? distanciaMetros(coordsMarcacion.lat, coordsMarcacion.lng, Number(tienda.lat), Number(tienda.lon))
        : null;
      entrada.personas.push({
        usuarioId: v.usuarioId,
        usuarioNombre: v.usuarioNombre,
        rol: v.rol,
        distanciaMetros: distancia,
      });
    }
    porTienda.set(v.tiendaId, entrada);
  });

  const porEvento = new Map<string, EventoEnMapa>();
  (eventosHoy ?? []).forEach((e: any) => {
    const comunicado = e.comunicados;
    if (!comunicado?.lat || !comunicado?.lon) return; // sin ubicación geocodificada — no se puede ubicar

    usuariosUnicos.add(e.usuario_id);

    const entrada: EventoEnMapa = porEvento.get(e.comunicado_id) ?? {
      comunicadoId: e.comunicado_id,
      mensaje: comunicado.mensaje,
      lat: Number(comunicado.lat),
      lon: Number(comunicado.lon),
      personas: [],
    };
    if (!entrada.personas.some((p) => p.usuarioId === e.usuario_id)) {
      entrada.personas.push({
        usuarioId: e.usuario_id,
        usuarioNombre: e.usuarios?.nombre ?? "—",
        rol: e.usuarios?.rol ?? "—",
        // Los eventos no tienen tienda de referencia contra la cual medir
        // distancia — solo aplica a visitas a tienda.
        distanciaMetros: null,
      });
    }
    porEvento.set(e.comunicado_id, entrada);
  });

  return {
    fecha: hoy,
    tiendas: Array.from(porTienda.values()),
    eventos: Array.from(porEvento.values()),
    totalPersonas: usuariosUnicos.size,
  };
}
