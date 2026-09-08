import { supabaseServer } from "@/lib/supabase-server";

// El Coordinador siempre tiene acceso al registro de nuevos usuarios (es su
// función natural). Cualquier otra persona solo lo tiene si el Coordinador
// se lo asignó explícitamente desde "Registro" (columna usuarios.puede_registrar).
export async function tieneAccesoRegistro(usuarioId: string, rol: string): Promise<boolean> {
  if (rol === "coordinador") return true;

  const supabase = supabaseServer();
  const { data } = await supabase
    .from("usuarios")
    .select("puede_registrar")
    .eq("id", usuarioId)
    .maybeSingle();

  return !!data?.puede_registrar;
}
