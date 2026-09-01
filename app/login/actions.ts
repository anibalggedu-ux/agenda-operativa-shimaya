"use server";

import { supabaseServer } from "@/lib/supabase-server";
import { hashPassword } from "@/lib/password";
import { crearSesion } from "@/lib/session";
import { redirect } from "next/navigation";

export type ResultadoLogin = { exito: boolean; mensaje?: string };

export async function iniciarSesionAction(
  _prevState: ResultadoLogin,
  formData: FormData
): Promise<ResultadoLogin> {
  const nombre = String(formData.get("nombre") || "").trim();
  const clave = String(formData.get("clave") || "");

  if (!nombre || !clave) {
    return { exito: false, mensaje: "Completa usuario y clave." };
  }

  const supabase = supabaseServer();
  const { data: usuario, error } = await supabase
    .from("usuarios")
    .select("id, nombre, rol, clave_hash")
    .ilike("nombre", nombre)
    .maybeSingle();

  if (error || !usuario) {
    return { exito: false, mensaje: "Credencial incorrecta. Verifique sus datos." };
  }

  const claveHashIngresada = hashPassword(clave);
  if (claveHashIngresada !== usuario.clave_hash) {
    return { exito: false, mensaje: "Credencial incorrecta. Verifique sus datos." };
  }

  await crearSesion({
    id: usuario.id,
    nombre: usuario.nombre,
    rol: usuario.rol,
  });

  redirect(`/panel/${usuario.rol}`);
}

export async function obtenerNombresUsuarios() {
  const supabase = supabaseServer();
  const { data } = await supabase
    .from("usuarios")
    .select("nombre")
    .order("nombre", { ascending: true });
  return data?.map((u) => u.nombre) ?? [];
}
