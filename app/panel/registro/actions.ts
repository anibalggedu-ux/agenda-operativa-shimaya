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

  const { data, error } = await supabase
    .from("usuarios")
    .select("id, nombre, rol, puede_registrar, activo")
    .neq("rol", "coordinador")
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
