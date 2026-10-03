import { supabaseServer } from "@/lib/supabase-server";

// El Coordinador siempre tiene acceso al registro de nuevos usuarios (es su
// función natural). Los Capacitadores nunca lo tienen, sin excepción. Cualquier
// otra persona solo lo tiene si el Coordinador se lo asignó explícitamente
// desde "Registro" (columna usuarios.puede_registrar).
export async function tieneAccesoRegistro(usuarioId: string, rol: string): Promise<boolean> {
  if (rol === "coordinador") return true;
  if (rol === "capacitador") return false;

  const supabase = supabaseServer();
  const { data } = await supabase
    .from("usuarios")
    .select("puede_registrar")
    .eq("id", usuarioId)
    .maybeSingle();

  return !!data?.puede_registrar;
}

// Coordinador y Gerente realizan auditorías siempre, sin excepción. Las
// auditorías no tienen fecha fija ni son diarias para el resto, así que en
// vez de mostrarle el formulario a todo Supervisor/Capacitador, quien tenga
// acceso a Registro lo activa puntualmente para la persona que va a auditar
// (columna usuarios.puede_auditar) -- y quien ya tiene acceso a Registro
// (ver tieneAccesoRegistro) lo tiene también para auditar, sin necesidad de
// prender el flag aparte.
export async function tieneAccesoAuditoria(usuarioId: string, rol: string): Promise<boolean> {
  if (rol === "coordinador" || rol === "gerente") return true;

  if (await tieneAccesoRegistro(usuarioId, rol)) return true;

  const supabase = supabaseServer();
  const { data } = await supabase
    .from("usuarios")
    .select("puede_auditar")
    .eq("id", usuarioId)
    .maybeSingle();

  return !!data?.puede_auditar;
}
