import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { ejecutarDepuracionFotos } from "@/app/panel/registro/actions";
import { hoyPeru, sumarDias } from "@/lib/fechas";
import { depurarFotosEvidencia } from "@/lib/evidencias";
import { DIAS_RETENCION_EVIDENCIAS } from "@/lib/evidencias-constantes";

// Vercel Cron llama esta ruta una vez al día (ver vercel.json) mandando
// "Authorization: Bearer <CRON_SECRET>" automáticamente.
export const dynamic = "force-dynamic";

// Borra fotos de marcación (ingreso/salida GPS) de más de 2 meses -- para
// que el espacio en Vercel Blob no dependa de que alguien se acuerde de usar
// el depurador manual de Registro. La hora, ubicación y demás datos del
// reporte quedan intactos; solo se borra el archivo de la foto. En la misma
// corrida se borran las fotos opcionales de checklists y auditorías con más
// de DIAS_RETENCION_EVIDENCIAS (archivo y fila; el registro queda intacto).
const DIAS_RETENCION_MARCACIONES = 60;
const LOTE_MAXIMO = 500;
// Más que el rango más largo que usa Central Analítica (30 días) para que
// siempre haya margen, pero sin dejar crecer la tabla indefinidamente -- cada
// persona activa deja ~1 fila cada 45s mientras tiene la app abierta.
const DIAS_RETENCION_LATIDOS = 35;

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const hasta = sumarDias(hoyPeru(), -DIAS_RETENCION_MARCACIONES);
  const { borradas, pendientes } = await ejecutarDepuracionFotos(hasta, LOTE_MAXIMO);
  const supabase = supabaseServer();

  const evidencias = await depurarFotosEvidencia(supabase, LOTE_MAXIMO);
  if (evidencias.borradas > 0) {
    await supabase.from("auditoria_cambios").insert({
      usuario_id: null,
      usuario_nombre: "Depuración automática (cron)",
      accion: "Depuró fotos de checklists y auditorías",
      detalle: `${evidencias.borradas} foto(s) con más de ${DIAS_RETENCION_EVIDENCIAS} días${
        evidencias.pendientes > 0 ? ` -- quedan ${evidencias.pendientes} pendientes para la próxima corrida` : ""
      }`,
    });
  }

  if (borradas > 0) {
    await supabase.from("auditoria_cambios").insert({
      usuario_id: null,
      usuario_nombre: "Depuración automática (cron)",
      accion: "Depuró fotos de marcación antiguas",
      detalle: `${borradas} foto(s) anteriores a ${hasta} (más de ${DIAS_RETENCION_MARCACIONES} días)${
        pendientes > 0 ? ` -- quedan ${pendientes} pendientes para la próxima corrida` : ""
      }`,
    });
  }

  const hastaLatidos = new Date(Date.now() - DIAS_RETENCION_LATIDOS * 24 * 60 * 60 * 1000).toISOString();
  const { count: latidosBorrados } = await supabase
    .from("latidos_actividad")
    .delete({ count: "exact" })
    .lt("creado_en", hastaLatidos);

  return NextResponse.json({ ok: true, borradas, pendientes, hasta, evidencias, latidosBorrados });
}
