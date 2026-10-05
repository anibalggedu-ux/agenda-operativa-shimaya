import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

// Mismo secreto que los demás endpoints de admin -- deja borrar un
// comunicado puntual (ej. un aviso que ya cumplió su propósito) fuera de
// una sesión de coordinador/gerente.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (!process.env.SUPABASE_CRON_SECRET || auth !== `Bearer ${process.env.SUPABASE_CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta el parámetro id." }, { status: 400 });

  const supabase = supabaseServer();
  const { error } = await supabase.from("comunicados").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "No se pudo eliminar el comunicado." }, { status: 500 });

  return NextResponse.json({ ok: true });
}
