"use server";

import { supabaseServer } from "@/lib/supabase-server";
import { hashPassword } from "@/lib/password";
import { crearSesion, type SesionUsuario } from "@/lib/session";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

const MAX_FALLOS = 8;
const VENTANA_BLOQUEO_MIN = 10;

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

  // Freno a la fuerza bruta: si desde esta IP hubo demasiados fallos
  // recientes, se bloquea aunque la clave sea correcta. El límite es holgado
  // porque varios locales comparten una misma IP de red.
  const ip = headers().get("x-forwarded-for")?.split(",")[0].trim() || "desconocida";
  const desde = new Date(Date.now() - VENTANA_BLOQUEO_MIN * 60 * 1000).toISOString();
  const { count: fallosRecientes } = await supabase
    .from("intentos_login")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .gte("created_at", desde);
  if ((fallosRecientes ?? 0) >= MAX_FALLOS) {
    return {
      exito: false,
      mensaje: `Demasiados intentos fallidos. Espera ${VENTANA_BLOQUEO_MIN} minutos e inténtalo de nuevo.`,
    };
  }

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
    await supabase.from("intentos_login").insert({ ip });
    // Limpieza oportunista de registros viejos para que la tabla no crezca.
    await supabase
      .from("intentos_login")
      .delete()
      .lt("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    return { exito: false, mensaje: "Credencial incorrecta. Verifique sus datos." };
  }

  await crearSesion({
    id: usuario.id,
    nombre: usuario.nombre,
    rol: usuario.rol,
  });

  // Deja constancia de cada inicio de sesión (quién y cuándo) para poder
  // medir uso del sistema en Registro -- nunca debe bloquear el login si
  // falla el insert.
  try {
    await supabase.from("accesos_sistema").insert({
      usuario_id: usuario.id,
      usuario_nombre: usuario.nombre,
      rol: usuario.rol,
    });
  } catch (error) {
    console.error("No se pudo registrar el acceso al sistema:", error);
  }

  redirect(`/panel/${usuario.rol}`);
}
