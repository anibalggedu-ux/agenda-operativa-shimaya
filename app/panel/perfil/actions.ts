"use server";

import { supabaseServer } from "@/lib/supabase-server";
import { obtenerSesion } from "@/lib/session";
import { calcularAntiguedad, calcularProximaFechaAnual, hoyPeru } from "@/lib/fechas";
import { progresoProximoBronce, type ConteoMedallas } from "@/lib/trofeos";
import { obtenerVitrinaTrofeos, obtenerTotalDonado, obtenerTotalRecibido } from "../puntos-actions";
import { subirFotoPerfil, obtenerUrlTemporalFotoPerfil } from "@/lib/azure-storage";
import { revalidatePath } from "next/cache";

export type PerfilCompleto = {
  nombre: string;
  rol: string;
  fotoUrl: string | null;
  diasDescanso: string[];
  antiguedad: { anios: number; meses: number } | null;
  proximoAniversario: { fecha: string; diasFaltantes: number } | null;
  // false para gerente -- no participa del sistema de puntos, así que no
  // aparece en la Vitrina de Trofeos y esta sección no se muestra.
  tienePuntos: boolean;
  puntos: number;
  medallas: ConteoMedallas;
  progresoBronce: { actual: number; faltan: number };
  rachaActual: number;
  viajesProvincia: number;
  ranking: { posicion: number; total: number } | null;
  totalDonado: number;
  totalRecibido: number;
};

export async function obtenerMiPerfilCompleto(): Promise<PerfilCompleto> {
  const sesion = await obtenerSesion();
  if (!sesion) throw new Error("No autorizado.");

  const supabase = supabaseServer();
  const [{ data: usuario, error }, vitrina, totalDonado, totalRecibido, fotoUrl] = await Promise.all([
    supabase.from("usuarios").select("nombre, rol, dias_descanso, fecha_ingreso").eq("id", sesion.id).maybeSingle(),
    obtenerVitrinaTrofeos(),
    obtenerTotalDonado(),
    obtenerTotalRecibido(),
    obtenerUrlTemporalFotoPerfil(sesion.id),
  ]);

  if (error) throw new Error("No se pudo cargar tu perfil.");

  const fechaIngreso = usuario?.fecha_ingreso ?? null;
  let antiguedad: PerfilCompleto["antiguedad"] = null;
  let proximoAniversario: PerfilCompleto["proximoAniversario"] = null;
  if (fechaIngreso) {
    const hoy = hoyPeru();
    antiguedad = calcularAntiguedad(fechaIngreso, hoy);
    const [, mIng, dIng] = fechaIngreso.split("-").map(Number);
    proximoAniversario = calcularProximaFechaAnual(mIng, dIng, hoy);
  }

  const indice = vitrina.findIndex((f) => f.usuarioId === sesion.id);
  const propio = indice >= 0 ? vitrina[indice] : null;

  return {
    nombre: usuario?.nombre ?? sesion.nombre,
    rol: usuario?.rol ?? sesion.rol,
    fotoUrl,
    diasDescanso: usuario?.dias_descanso ?? [],
    antiguedad,
    proximoAniversario,
    tienePuntos: propio !== null,
    puntos: propio?.puntos ?? 0,
    medallas: propio?.medallas ?? { bronce: 0, plata: 0, oro: 0, estrella: 0 },
    progresoBronce: progresoProximoBronce(propio?.puntos ?? 0),
    rachaActual: propio?.rachaActual ?? 0,
    viajesProvincia: propio?.viajesProvincia ?? 0,
    ranking: propio ? { posicion: indice + 1, total: vitrina.length } : null,
    totalDonado,
    totalRecibido,
  };
}

export async function actualizarFotoPerfil(fotoDataUrl: string): Promise<{ ok: boolean; mensaje?: string }> {
  const sesion = await obtenerSesion();
  if (!sesion) throw new Error("No autorizado.");

  try {
    await subirFotoPerfil(sesion.id, fotoDataUrl);
    revalidatePath("/panel");
    return { ok: true };
  } catch (error: any) {
    return { ok: false, mensaje: error.message || "No se pudo subir la foto." };
  }
}
