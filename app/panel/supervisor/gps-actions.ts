"use server";

import { supabaseServer } from "@/lib/supabase-server";
import { obtenerSesion } from "@/lib/session";
import { horaPeru, diaLaboralPeru } from "@/lib/fechas";

export type EstadoAsistencia = {
  horaIngreso: string | null;
  horaSalida: string | null;
};

export async function obtenerEstadoAsistenciaHoy(): Promise<EstadoAsistencia> {
  const sesion = await obtenerSesion();
  if (!sesion) throw new Error("No autorizado.");

  const supabase = supabaseServer();
  const { data } = await supabase
    .from("asistencia")
    .select("hora_ingreso, hora_salida")
    .eq("usuario_id", sesion.id)
    .eq("fecha", diaLaboralPeru(sesion.rol === "capacitador"))
    .maybeSingle();

  return {
    horaIngreso: data ? data.hora_ingreso : null,
    horaSalida: data ? data.hora_salida : null,
  };
}

export type ResultadoMarcado = { exito: boolean; mensaje?: string; hora?: string };

export async function marcarIngreso(lat: number, lng: number): Promise<ResultadoMarcado> {
  const sesion = await obtenerSesion();
  if (!sesion) return { exito: false, mensaje: "No autorizado." };

  const supabase = supabaseServer();
  const hora = horaPeru();
  const ubicacion = "https://www.google.com/maps?q=" + lat + "," + lng;

  const { error } = await supabase.from("asistencia").upsert(
    {
      fecha: diaLaboralPeru(sesion.rol === "capacitador"),
      usuario_id: sesion.id,
      hora_ingreso: hora,
      ubicacion_ingreso: ubicacion,
    },
    { onConflict: "fecha,usuario_id" }
  );

  if (error) return { exito: false, mensaje: "No se pudo registrar el ingreso." };
  return { exito: true, hora: hora };
}

export async function marcarSalida(lat: number, lng: number): Promise<ResultadoMarcado> {
  const sesion = await obtenerSesion();
  if (!sesion) return { exito: false, mensaje: "No autorizado." };

  const supabase = supabaseServer();
  const fecha = diaLaboralPeru(sesion.rol === "capacitador");

  const { data: existente } = await supabase
    .from("asistencia")
    .select("id")
    .eq("usuario_id", sesion.id)
    .eq("fecha", fecha)
    .maybeSingle();

  if (!existente) {
    return { exito: false, mensaje: "Debes marcar tu ingreso antes de marcar la salida." };
  }

  const hora = horaPeru();
  const ubicacion = "https://www.google.com/maps?q=" + lat + "," + lng;

  const { error } = await supabase
    .from("asistencia")
    .update({ hora_salida: hora, ubicacion_salida: ubicacion })
    .eq("usuario_id", sesion.id)
    .eq("fecha", fecha);

  if (error) return { exito: false, mensaje: "No se pudo registrar la salida." };
  return { exito: true, hora: hora };
}