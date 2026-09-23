"use server";

import { supabaseServer } from "@/lib/supabase-server";
import { obtenerSesion } from "@/lib/session";
import { calcularAntiguedad, calcularProximaFechaAnual, hoyPeru } from "@/lib/fechas";
import { progresoProximoBronce, type ConteoMedallas } from "@/lib/trofeos";
import { obtenerVitrinaTrofeos, obtenerTotalDonado, obtenerTotalRecibido } from "../puntos-actions";
import { subirFotoPerfil, obtenerUrlTemporalFotoPerfil } from "@/lib/blob-storage";
import { revalidatePath } from "next/cache";

export type PerfilCompleto = {
  usuarioId: string;
  // El perfil que se pidió es el de quien tiene la sesión abierta -- muestra
  // el botón de cambiar foto y el directorio del equipo. El de otro usuario
  // es de solo lectura.
  esPropio: boolean;
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

// Sin usuarioId trae el propio. Con uno, cualquiera con sesión iniciada
// puede ver el perfil de cualquier compañero -- es la vitrina del equipo,
// no hay nada privado en estos datos (ya son visibles hoy repartidos entre
// Historias, la Vitrina de Trofeos y los rankings de cada portal).
export async function obtenerPerfil(usuarioId?: string): Promise<PerfilCompleto> {
  const sesion = await obtenerSesion();
  if (!sesion) throw new Error("No autorizado.");

  const objetivoId = usuarioId ?? sesion.id;

  const supabase = supabaseServer();
  const [{ data: usuario, error }, vitrina, totalDonado, totalRecibido, fotoUrl] = await Promise.all([
    supabase.from("usuarios").select("nombre, rol, dias_descanso, fecha_ingreso").eq("id", objetivoId).maybeSingle(),
    obtenerVitrinaTrofeos(),
    obtenerTotalDonado(objetivoId),
    obtenerTotalRecibido(objetivoId),
    obtenerUrlTemporalFotoPerfil(objetivoId),
  ]);

  if (error || !usuario) throw new Error("No se pudo cargar el perfil.");

  const fechaIngreso = usuario.fecha_ingreso ?? null;
  let antiguedad: PerfilCompleto["antiguedad"] = null;
  let proximoAniversario: PerfilCompleto["proximoAniversario"] = null;
  if (fechaIngreso) {
    const hoy = hoyPeru();
    antiguedad = calcularAntiguedad(fechaIngreso, hoy);
    const [, mIng, dIng] = fechaIngreso.split("-").map(Number);
    proximoAniversario = calcularProximaFechaAnual(mIng, dIng, hoy);
  }

  const indice = vitrina.findIndex((f) => f.usuarioId === objetivoId);
  const propio = indice >= 0 ? vitrina[indice] : null;

  return {
    usuarioId: objetivoId,
    esPropio: objetivoId === sesion.id,
    nombre: usuario.nombre ?? sesion.nombre,
    rol: usuario.rol ?? sesion.rol,
    fotoUrl,
    diasDescanso: usuario.dias_descanso ?? [],
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

export type PersonaDirectorio = { usuarioId: string; nombre: string; rol: string; fotoUrl: string | null };

// Lista de todo el equipo activo para "Perfil de tu equipo" -- cualquier
// usuario con sesión puede verla, es la misma idea que ya existe en
// Historias (ver quién publicó qué) llevada a una lista de nombres.
export async function obtenerDirectorioEquipo(): Promise<PersonaDirectorio[]> {
  const sesion = await obtenerSesion();
  if (!sesion) throw new Error("No autorizado.");

  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("usuarios")
    .select("id, nombre, rol")
    .eq("activo", true)
    .neq("id", sesion.id)
    .order("nombre", { ascending: true });

  if (error) return [];

  const personas = data ?? [];
  const fotos = await Promise.all(personas.map((u) => obtenerUrlTemporalFotoPerfil(u.id)));

  return personas.map((u, i) => ({ usuarioId: u.id, nombre: u.nombre, rol: u.rol, fotoUrl: fotos[i] }));
}
