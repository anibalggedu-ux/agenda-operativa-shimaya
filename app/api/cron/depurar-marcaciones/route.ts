import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { ejecutarDepuracionFotos } from "@/app/panel/registro/actions";
import { hoyPeru, sumarDias } from "@/lib/fechas";

// Vercel Cron llama esta ruta una vez al día (ver vercel.json) mandando
// "Authorization: Bearer <CRON_SECRET>" automáticamente.
export const dynamic = "force-dynamic";

// Borra fotos de marcación (ingreso/salida GPS) de más de 2 meses -- para
// que el espacio en Vercel Blob no dependa de que alguien se acuerde de usar
// el depurador manual de Registro. La hora, ubicación y demás datos del
// reporte quedan intactos; solo se borra el archivo de la foto.
const DIAS_RETENCION_MARCACIONES = 60;
const LOTE_MAXIMO = 500;

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const hasta = sumarDias(hoyPeru(), -DIAS_RETENCION_MARCACIONES);
  const { borradas, pendientes } = await ejecutarDepuracionFotos(hasta, LOTE_MAXIMO);

  if (borradas > 0) {
    const supabase = supabaseServer();
    await supabase.from("auditoria_cambios").insert({
      usuario_id: null,
      usuario_nombre: "Depuración automática (cron)",
      accion: "Depuró fotos de marcación antiguas",
      detalle: `${borradas} foto(s) anteriores a ${hasta} (más de ${DIAS_RETENCION_MARCACIONES} días)${
        pendientes > 0 ? ` -- quedan ${pendientes} pendientes para la próxima corrida` : ""
      }`,
    });
  }

  return NextResponse.json({ ok: true, borradas, pendientes, hasta });
}
