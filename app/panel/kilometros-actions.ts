"use server";

import { supabaseServer } from "@/lib/supabase-server";
import { obtenerSesion } from "@/lib/session";
import { calcularRutaAuto, calcularRutasEnLotes } from "@/lib/distancia";
import { obtenerVisitasEnRangoAnalitica } from "./analitica/actions";

async function exigirSesion() {
  const sesion = await obtenerSesion();
  if (!sesion) throw new Error("No autorizado.");
  return sesion;
}

export type FilaKilometros = {
  usuarioId: string;
  usuarioNombre: string;
  rol: string;
  totalVisitas: number;
  totalKm: number;
  totalMinutos: number;
  visitasSinCalcular: number;
};

export type TrayectoKilometros = {
  usuarioNombre: string;
  tiendaNombre: string;
  // Tienda de origen cuando el trayecto es una auto-asignación hecha desde
  // otra tienda — null significa que el origen es el domicilio (caso normal).
  origenNombre: string | null;
  km: number;
  minutos: number;
  visitas: number;
  kmAcumulado: number;
};

export type ResumenKilometros = {
  filas: FilaKilometros[];
  detalle: TrayectoKilometros[];
};

export async function obtenerResumenKilometros(desde: string, hasta: string): Promise<ResumenKilometros> {
  await exigirSesion();
  const supabase = supabaseServer();

  const [{ data: usuarios, error: errorUsuarios }, visitas, { data: tiendas, error: errorTiendas }] = await Promise.all([
    supabase.from("usuarios").select("id, nombre, rol, lat, lon").eq("activo", true),
    obtenerVisitasEnRangoAnalitica(desde, hasta),
    supabase.from("tiendas").select("id, nombre, lat, lon"),
  ]);

  if (errorUsuarios || errorTiendas) throw new Error("No se pudo cargar los datos de kilómetros.");

  const mapaUsuarios = new Map((usuarios ?? []).map((u) => [u.id, u]));
  const mapaTiendas = new Map((tiendas ?? []).map((t) => [t.id, t]));

  // Cada visita ya viene deduplicada por usuario+tienda+fecha (mismo criterio
  // que el resto del sistema: cuenta cada asignación, tenga o no observación
  // escrita, y sin importar si fue asignada por el coordinador o
  // auto-asignada). Se agrupan por usuario+origen+destino porque la ruta
  // entre esos dos puntos es siempre la misma — solo cambia cuántas veces se
  // repitió. El origen normalmente es el domicilio, pero en una
  // auto-asignación es la tienda desde la que se hizo (ver origen_tienda_id).
  const conteos = new Map<
    string,
    { usuarioId: string; tiendaId: string; origenTiendaId: string | null; veces: number }
  >();
  visitas.forEach((v) => {
    const clave = `${v.usuarioId}|${v.origenTiendaId ?? "casa"}|${v.tiendaId}`;
    const actual = conteos.get(clave);
    if (actual) actual.veces += 1;
    else conteos.set(clave, { usuarioId: v.usuarioId, tiendaId: v.tiendaId, origenTiendaId: v.origenTiendaId, veces: 1 });
  });

  const pares = Array.from(conteos.values()).map((p) => ({
    ...p,
    tiendaNombre: mapaTiendas.get(p.tiendaId)?.nombre ?? "—",
    origenNombre: p.origenTiendaId ? mapaTiendas.get(p.origenTiendaId)?.nombre ?? "—" : null,
  }));

  const rutasPorClave = new Map<string, { km: number; minutos: number } | null>();

  await calcularRutasEnLotes(pares, async (par) => {
    const tienda = mapaTiendas.get(par.tiendaId);
    const origen = par.origenTiendaId ? mapaTiendas.get(par.origenTiendaId) : mapaUsuarios.get(par.usuarioId);

    const clave = `${par.usuarioId}|${par.origenTiendaId ?? "casa"}|${par.tiendaId}`;
    if (!origen?.lat || !origen?.lon || !tienda?.lat || !tienda?.lon) {
      rutasPorClave.set(clave, null);
      return;
    }
    const ruta = await calcularRutaAuto(
      Number(origen.lat),
      Number(origen.lon),
      Number(tienda.lat),
      Number(tienda.lon)
    );
    rutasPorClave.set(clave, ruta);
  });

  const filasPorUsuario = new Map<string, FilaKilometros>();
  const detalle: TrayectoKilometros[] = [];

  pares.forEach((par) => {
    const usuario = mapaUsuarios.get(par.usuarioId);
    if (!usuario) return;

    const fila = filasPorUsuario.get(par.usuarioId) ?? {
      usuarioId: par.usuarioId,
      usuarioNombre: usuario.nombre,
      rol: usuario.rol,
      totalVisitas: 0,
      totalKm: 0,
      totalMinutos: 0,
      visitasSinCalcular: 0,
    };

    fila.totalVisitas += par.veces;

    const ruta = rutasPorClave.get(`${par.usuarioId}|${par.origenTiendaId ?? "casa"}|${par.tiendaId}`);
    if (ruta) {
      fila.totalKm += Math.round(ruta.km * par.veces * 10) / 10;
      fila.totalMinutos += ruta.minutos * par.veces;
      detalle.push({
        usuarioNombre: usuario.nombre,
        tiendaNombre: par.tiendaNombre,
        origenNombre: par.origenNombre,
        km: ruta.km,
        minutos: ruta.minutos,
        visitas: par.veces,
        kmAcumulado: Math.round(ruta.km * par.veces * 10) / 10,
      });
    } else {
      fila.visitasSinCalcular += par.veces;
    }

    filasPorUsuario.set(par.usuarioId, fila);
  });

  const filas = Array.from(filasPorUsuario.values())
    .map((f) => ({ ...f, totalKm: Math.round(f.totalKm * 10) / 10 }))
    .sort((a, b) => b.totalKm - a.totalKm);

  detalle.sort((a, b) => b.kmAcumulado - a.kmAcumulado);

  return { filas, detalle };
}
