"use server";

import { supabaseServer } from "@/lib/supabase-server";
import { obtenerSesion } from "@/lib/session";
import { calcularRutaAuto, calcularRutasEnLotes } from "@/lib/distancia";

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

  const [{ data: usuarios, error: errorUsuarios }, { data: visitas, error: errorVisitas }] = await Promise.all([
    supabase.from("usuarios").select("id, nombre, rol, lat, lon").eq("activo", true),
    supabase
      .from("rutas_diarias")
      .select("usuario_id, tienda_id, tiendas(nombre, lat, lon)")
      .gte("fecha", desde)
      .lte("fecha", hasta),
  ]);

  if (errorUsuarios || errorVisitas) throw new Error("No se pudo cargar los datos de kilómetros.");

  const mapaUsuarios = new Map((usuarios ?? []).map((u) => [u.id, u]));

  // Agrupa las visitas por usuario+tienda (la ruta entre esas dos
  // direcciones es siempre la misma, solo cambia cuántas veces se repitió).
  const conteos = new Map<string, { usuarioId: string; tiendaId: string; tiendaNombre: string; veces: number }>();
  (visitas ?? []).forEach((v: any) => {
    const clave = `${v.usuario_id}|${v.tienda_id}`;
    const actual = conteos.get(clave);
    if (actual) {
      actual.veces += 1;
    } else {
      conteos.set(clave, {
        usuarioId: v.usuario_id,
        tiendaId: v.tienda_id,
        tiendaNombre: v.tiendas?.nombre ?? "—",
        veces: 1,
      });
    }
  });

  const pares = Array.from(conteos.values());
  const rutasPorClave = new Map<string, { km: number; minutos: number } | null>();

  await calcularRutasEnLotes(pares, async (par) => {
    const usuario = mapaUsuarios.get(par.usuarioId);
    const visitaEjemplo = (visitas ?? []).find(
      (v: any) => v.usuario_id === par.usuarioId && v.tienda_id === par.tiendaId
    ) as any;
    const tienda = visitaEjemplo?.tiendas;

    const clave = `${par.usuarioId}|${par.tiendaId}`;
    if (!usuario?.lat || !usuario?.lon || !tienda?.lat || !tienda?.lon) {
      rutasPorClave.set(clave, null);
      return;
    }
    const ruta = await calcularRutaAuto(
      Number(usuario.lat),
      Number(usuario.lon),
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

    const ruta = rutasPorClave.get(`${par.usuarioId}|${par.tiendaId}`);
    if (ruta) {
      fila.totalKm += Math.round(ruta.km * par.veces * 10) / 10;
      fila.totalMinutos += ruta.minutos * par.veces;
      detalle.push({
        usuarioNombre: usuario.nombre,
        tiendaNombre: par.tiendaNombre,
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
