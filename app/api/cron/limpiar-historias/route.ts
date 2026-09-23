import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { eliminarFotoHistoria } from "@/lib/blob-storage";

// Vercel Cron llama esta ruta una vez al día (ver vercel.json) mandando
// "Authorization: Bearer <CRON_SECRET>" automáticamente cuando esa variable
// de entorno está configurada -- así nadie más puede disparar el borrado
// simplemente conociendo la URL.
export const dynamic = "force-dynamic";

// El borrado real espera 7 días -- aunque la historia deja de verse en el
// feed del equipo a las 24h, sigue disponible en "Mi Galería" (el archivo
// personal de cada uno) hasta entonces.
const DIAS_VISIBLE_GALERIA = 7;

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const supabase = supabaseServer();
  const limite = new Date(Date.now() - DIAS_VISIBLE_GALERIA * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase.from("historias").select("id, foto_blob").lt("created_at", limite);

  if (error) {
    return NextResponse.json({ error: "No se pudo leer las historias vencidas." }, { status: 500 });
  }

  let borradas = 0;
  for (const fila of data ?? []) {
    await eliminarFotoHistoria(fila.foto_blob).catch(() => {});
    const { error: errorBorrado } = await supabase.from("historias").delete().eq("id", fila.id);
    if (!errorBorrado) borradas += 1;
  }

  return NextResponse.json({ ok: true, borradas, total: data?.length ?? 0 });
}
