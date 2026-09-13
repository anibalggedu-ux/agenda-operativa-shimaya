"use server";

import { supabaseServer } from "@/lib/supabase-server";
import { hashPassword } from "@/lib/password";
import { crearSesion, type SesionUsuario } from "@/lib/session";
import { redirect } from "next/navigation";

export type ResultadoLogin = { exito: boolean; mensaje?: string };

// La columna usuarios.rol es un texto libre en la base de datos — este guard
// confirma que trae uno de los 4 roles que la app realmente sabe manejar
// antes de armar la sesión, en vez de asumirlo a ciegas.
function esRolValido(rol: string): rol is SesionUsuario["rol"] {
  return rol === "coordinador" || rol === "supervisor" || rol === "capacitador" || rol === "gerente";
}

export async function iniciarSesionAction(
  _prevState: ResultadoLogin,
  formData: FormData
): Promise<ResultadoLogin> {
  const clave = String(formData.get("clave") || "");

  if (!clave) {
    return { exito: false, mensaje: "Ingresa tu credencial." };
  }

  const supabase = supabaseServer();
  const claveHash = hashPassword(clave);

  // Se identifica solo por la credencial — cada usuario tiene una clave
  // única (validado al crearla en "Registro"), así que no hace falta pedir
  // el nombre. maybeSingle() falla si hubiera dos con la misma clave, lo
  // cual ya no debería poder pasar.
  const { data: usuario, error } = await supabase
    .from("usuarios")
    .select("id, nombre, rol")
    .eq("clave_hash", claveHash)
    .eq("activo", true)
    .maybeSingle();

  if (error || !usuario || !esRolValido(usuario.rol)) {
    return { exito: false, mensaje: "Credencial incorrecta. Verifique sus datos." };
  }

  await crearSesion({
    id: usuario.id,
    nombre: usuario.nombre,
    rol: usuario.rol,
  });

  redirect(`/panel/${usuario.rol}`);
}
