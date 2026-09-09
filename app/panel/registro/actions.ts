"use server";

import { supabaseServer } from "@/lib/supabase-server";
import { obtenerSesion } from "@/lib/session";
import { hashPassword } from "@/lib/password";
import { tieneAccesoRegistro } from "@/lib/permisos";
import { DIAS_SEMANA } from "@/lib/fechas";

async function exigirAccesoRegistro() {
  const sesion = await obtenerSesion();
  if (!sesion) throw new Error("No autorizado.");
  const permitido = await tieneAccesoRegistro(sesion.id, sesion.rol);
  if (!permitido) throw new Error("No autorizado.");
  return sesion;
}

async function exigirCoordinador() {
  const sesion = await obtenerSesion();
  if (!sesion || sesion.rol !== "coordinador") throw new Error("No autorizado.");
  return sesion;
}

const ROLES_VALIDOS = ["capacitador", "supervisor", "coordinador", "gerente"];

export type ResultadoRegistro = { exito: boolean; mensaje?: string };

export async function crearUsuario(
  _prevState: ResultadoRegistro,
  formData: FormData
): Promise<ResultadoRegistro> {
  await exigirAccesoRegistro();

  const nombre = String(formData.get("nombre") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const fechaIngreso = String(formData.get("fechaIngreso") || "").trim();
  const fechaNacimiento = String(formData.get("fechaNacimiento") || "").trim();
  const rol = String(formData.get("rol") || "");
  const credencial = String(formData.get("credencial") || "");
  const diaDescanso = String(formData.get("diaDescanso") || "").trim();

  if (!nombre || !rol || !credencial) {
    return { exito: false, mensaje: "Completa nombre, rol y credencial." };
  }
  if (!ROLES_VALIDOS.includes(rol)) {
    return { exito: false, mensaje: "Rol inválido." };
  }
  if (diaDescanso && !(DIAS_SEMANA as readonly string[]).includes(diaDescanso)) {
    return { exito: false, mensaje: "Día de descanso inválido." };
  }

  const supabase = supabaseServer();

  const { data: existente, error: errorExistente } = await supabase
    .from("usuarios")
    .select("id")
    .ilike("nombre", nombre)
    .maybeSingle();

  if (errorExistente) return { exito: false, mensaje: "No se pudo verificar el nombre." };
  if (existente) {
    return { exito: false, mensaje: "Ya existe un usuario registrado con ese nombre." };
  }

  // El login ahora identifica solo por la credencial (sin elegir nombre), así
  // que dos personas no pueden compartir la misma clave — si pasara, no
  // habría forma de saber a cuál de las dos pertenece el inicio de sesión.
  const claveHash = hashPassword(credencial);
  const { data: claveEnUso, error: errorClave } = await supabase
    .from("usuarios")
    .select("id")
    .eq("clave_hash", claveHash)
    .maybeSingle();

  if (errorClave) return { exito: false, mensaje: "No se pudo verificar la credencial." };
  if (claveEnUso) {
    return { exito: false, mensaje: "Esa credencial ya está en uso por otro usuario. Elige una distinta." };
  }

  const { error } = await supabase.from("usuarios").insert({
    nombre,
    email: email || null,
    fecha_ingreso: fechaIngreso || null,
    fecha_nacimiento: fechaNacimiento || null,
    rol,
    clave_hash: claveHash,
    dias_descanso: diaDescanso ? [diaDescanso] : null,
  });

  if (error) return { exito: false, mensaje: "No se pudo registrar el usuario." };
  return { exito: true, mensaje: `${nombre} fue registrado(a) correctamente como ${rol}.` };
}

export type UsuarioConAcceso = {
  id: string;
  nombre: string;
  rol: string;
  puedeRegistrar: boolean;
  activo: boolean;
};

export async function obtenerUsuariosConAcceso(): Promise<UsuarioConAcceso[]> {
  await exigirCoordinador();
  const supabase = supabaseServer();

  // Los capacitadores nunca pueden tener acceso a Registro (ver
  // lib/permisos.ts), así que se excluyen de esta lista para no mostrar un
  // interruptor que en realidad no tendría ningún efecto.
  const { data, error } = await supabase
    .from("usuarios")
    .select("id, nombre, rol, puede_registrar, activo")
    .not("rol", "in", "(coordinador,capacitador)")
    .order("nombre");

  if (error) throw new Error("No se pudo cargar los usuarios.");

  return (data ?? []).map((u) => ({
    id: u.id,
    nombre: u.nombre,
    rol: u.rol,
    puedeRegistrar: !!u.puede_registrar,
    activo: u.activo !== false,
  }));
}

export async function actualizarAccesoRegistro(
  usuarioId: string,
  valor: boolean
): Promise<ResultadoRegistro> {
  await exigirCoordinador();
  const supabase = supabaseServer();

  const { error } = await supabase
    .from("usuarios")
    .update({ puede_registrar: valor })
    .eq("id", usuarioId);

  if (error) return { exito: false, mensaje: "No se pudo actualizar el acceso." };
  return { exito: true };
}

// Dar de baja no borra al usuario (sus reportes, marcaciones y puntos
// históricos quedan intactos) — solo le impide iniciar sesión y lo saca de
// la lista de acceso a Registro. Se puede reactivar en cualquier momento.
export async function actualizarEstadoUsuario(
  usuarioId: string,
  activo: boolean
): Promise<ResultadoRegistro> {
  const sesion = await exigirCoordinador();

  if (!activo && usuarioId === sesion.id) {
    return { exito: false, mensaje: "No puedes darte de baja a ti mismo(a)." };
  }

  const supabase = supabaseServer();
  const { error } = await supabase
    .from("usuarios")
    .update({ activo })
    .eq("id", usuarioId);

  if (error) return { exito: false, mensaje: "No se pudo actualizar el estado del usuario." };
  return { exito: true };
}

// ---------------------------------------------------------------------
// Mantenimiento de datos: corregir marcaciones mal registradas y limpiar
// información de prueba. Disponible para cualquiera con acceso a Registro
// (no solo Coordinador), igual que el resto de este archivo.
// ---------------------------------------------------------------------

export type UsuarioBasicoRegistro = { id: string; nombre: string; rol: string };

export async function obtenerUsuariosBasicos(): Promise<UsuarioBasicoRegistro[]> {
  await exigirAccesoRegistro();
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("usuarios")
    .select("id, nombre, rol")
    .order("nombre");

  if (error) throw new Error("No se pudo cargar los usuarios.");
  return data ?? [];
}

export type AsistenciaCorregible = {
  id: string;
  fecha: string;
  horaIngreso: string | null;
  horaSalida: string | null;
};

export async function obtenerAsistenciaParaCorregir(
  usuarioId: string,
  desde: string,
  hasta: string
): Promise<AsistenciaCorregible[]> {
  await exigirAccesoRegistro();
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("asistencia")
    .select("id, fecha, hora_ingreso, hora_salida")
    .eq("usuario_id", usuarioId)
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha", { ascending: false });

  if (error) throw new Error("No se pudo cargar las marcaciones.");

  return (data ?? []).map((a) => ({
    id: a.id,
    fecha: a.fecha,
    horaIngreso: a.hora_ingreso,
    horaSalida: a.hora_salida,
  }));
}

export async function actualizarAsistencia(
  id: string,
  horaIngreso: string | null,
  horaSalida: string | null
): Promise<ResultadoRegistro> {
  await exigirAccesoRegistro();
  const supabase = supabaseServer();

  const { error } = await supabase
    .from("asistencia")
    .update({ hora_ingreso: horaIngreso, hora_salida: horaSalida })
    .eq("id", id);

  if (error) return { exito: false, mensaje: "No se pudo actualizar la marcación." };
  return { exito: true };
}

export async function eliminarAsistencia(id: string): Promise<ResultadoRegistro> {
  await exigirAccesoRegistro();
  const supabase = supabaseServer();

  const { error } = await supabase.from("asistencia").delete().eq("id", id);
  if (error) return { exito: false, mensaje: "No se pudo eliminar la marcación." };
  return { exito: true };
}

export type AsignacionEspecialCorregible = {
  id: string;
  usuarioNombre: string;
  tipo: string;
  fechaInicio: string;
  fechaFin: string;
  motivo: string | null;
};

export async function obtenerAsignacionesEspecialesParaCorregir(): Promise<
  AsignacionEspecialCorregible[]
> {
  await exigirAccesoRegistro();
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("asignaciones_especiales")
    .select("id, tipo, fecha_inicio, fecha_fin, motivo, usuarios(nombre)")
    .order("fecha_inicio", { ascending: false });

  if (error) throw new Error("No se pudo cargar las asignaciones especiales.");

  return (data ?? []).map((a: any) => ({
    id: a.id,
    usuarioNombre: a.usuarios?.nombre ?? "—",
    tipo: a.tipo,
    fechaInicio: a.fecha_inicio,
    fechaFin: a.fecha_fin,
    motivo: a.motivo,
  }));
}

export async function eliminarAsignacionEspecialRegistro(id: string): Promise<ResultadoRegistro> {
  await exigirAccesoRegistro();
  const supabase = supabaseServer();

  const { error } = await supabase.from("asignaciones_especiales").delete().eq("id", id);
  if (error) return { exito: false, mensaje: "No se pudo eliminar la asignación especial." };
  return { exito: true };
}

export type ComunicadoCorregible = {
  id: string;
  tipo: string;
  mensaje: string;
  fecha: string;
  autor: string | null;
};

export async function obtenerComunicadosParaCorregir(): Promise<ComunicadoCorregible[]> {
  await exigirAccesoRegistro();
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("comunicados")
    .select("id, tipo, mensaje, fecha, autor")
    .order("fecha", { ascending: false });

  if (error) throw new Error("No se pudo cargar los comunicados.");
  return data ?? [];
}

export async function eliminarComunicado(id: string): Promise<ResultadoRegistro> {
  await exigirAccesoRegistro();
  const supabase = supabaseServer();

  const { error } = await supabase.from("comunicados").delete().eq("id", id);
  if (error) return { exito: false, mensaje: "No se pudo eliminar el comunicado." };
  return { exito: true };
}
