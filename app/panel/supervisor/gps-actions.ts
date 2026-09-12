"use server";

import { supabaseServer } from "@/lib/supabase-server";
import { obtenerSesion } from "@/lib/session";
import { horaPeru, diaLaboralPeru, hoyPeru, sumarDias } from "@/lib/fechas";
import { subirFotoMarcacion } from "@/lib/azure-storage";

// Antes de esta hora, marcar la salida es ambiguo (¿pertenece a hoy o al
// turno que empezó ayer?) — se le pregunta al colaborador en vez de asumir.
const CORTE_AMBIGUEDAD_SALIDA = 6;

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

export type AmbiguedadSalida = { ambiguo: boolean; hoy: string; ayer: string };

export async function obtenerAmbiguedadSalida(): Promise<AmbiguedadSalida> {
  const sesion = await obtenerSesion();
  if (!sesion) throw new Error("No autorizado.");

  const hoy = hoyPeru();
  const ayer = sumarDias(hoy, -1);
  const horaActual = Number(horaPeru().split(":")[0]);

  return { ambiguo: horaActual < CORTE_AMBIGUEDAD_SALIDA, hoy, ayer };
}

export type ResultadoMarcado = { exito: boolean; mensaje?: string; hora?: string };

export async function marcarIngreso(
  lat: number,
  lng: number,
  fotoBase64?: string
): Promise<ResultadoMarcado> {
  const sesion = await obtenerSesion();
  if (!sesion) return { exito: false, mensaje: "No autorizado." };
  if (!fotoBase64) return { exito: false, mensaje: "Toma una foto para marcar el ingreso." };

  const supabase = supabaseServer();
  const hora = horaPeru();
  const fecha = diaLaboralPeru(sesion.rol === "capacitador");
  const ubicacion = "https://www.google.com/maps?q=" + lat + "," + lng;

  let fotoBlob: string | null = null;
  try {
    fotoBlob = `${sesion.id}/${fecha}-ingreso-${Date.now()}.jpg`;
    await subirFotoMarcacion(fotoBlob, fotoBase64);
  } catch (error) {
    console.error("No se pudo subir la foto de ingreso:", error);
    return { exito: false, mensaje: "No se pudo guardar la foto. Intenta de nuevo." };
  }

  const { error } = await supabase.from("asistencia").upsert(
    {
      fecha,
      usuario_id: sesion.id,
      hora_ingreso: hora,
      ubicacion_ingreso: ubicacion,
      foto_ingreso_blob: fotoBlob,
    },
    { onConflict: "fecha,usuario_id" }
  );

  if (error) return { exito: false, mensaje: "No se pudo registrar el ingreso." };
  return { exito: true, hora: hora };
}

export async function marcarSalida(
  lat: number,
  lng: number,
  fechaElegida?: string,
  fotoBase64?: string
): Promise<ResultadoMarcado> {
  const sesion = await obtenerSesion();
  if (!sesion) return { exito: false, mensaje: "No autorizado." };

  const supabase = supabaseServer();

  // Si viene una fecha elegida por el usuario (por la ambigüedad de
  // madrugada), se respeta solo si es hoy o ayer — cualquier otro valor se
  // ignora y se usa la regla automática de siempre.
  const hoy = hoyPeru();
  const ayer = sumarDias(hoy, -1);
  const fecha =
    fechaElegida && (fechaElegida === hoy || fechaElegida === ayer)
      ? fechaElegida
      : diaLaboralPeru(sesion.rol === "capacitador");

  const { data: existente } = await supabase
    .from("asistencia")
    .select("id")
    .eq("usuario_id", sesion.id)
    .eq("fecha", fecha)
    .maybeSingle();

  if (!existente) {
    return { exito: false, mensaje: "Debes marcar tu ingreso antes de marcar la salida." };
  }
  if (!fotoBase64) {
    return { exito: false, mensaje: "Toma una foto para marcar la salida." };
  }

  const hora = horaPeru();
  const ubicacion = "https://www.google.com/maps?q=" + lat + "," + lng;

  let fotoBlob: string | null = null;
  try {
    fotoBlob = `${sesion.id}/${fecha}-salida-${Date.now()}.jpg`;
    await subirFotoMarcacion(fotoBlob, fotoBase64);
  } catch (error) {
    console.error("No se pudo subir la foto de salida:", error);
    return { exito: false, mensaje: "No se pudo guardar la foto. Intenta de nuevo." };
  }

  const { error } = await supabase
    .from("asistencia")
    .update({ hora_salida: hora, ubicacion_salida: ubicacion, foto_salida_blob: fotoBlob })
    .eq("usuario_id", sesion.id)
    .eq("fecha", fecha);

  if (error) return { exito: false, mensaje: "No se pudo registrar la salida." };
  return { exito: true, hora: hora };
}