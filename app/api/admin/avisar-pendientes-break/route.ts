import { NextResponse } from "next/server";
import { diaLaboralPeru } from "@/lib/fechas";
import { enviarAvisosPendientesBreak } from "@/app/panel/break-actions";

// Mismo secreto que los crons de Supabase -- deja disparar el aviso de
// "pendientes de break" fuera de una sesión de coordinador/gerente (ej.
// un pedido puntual por chat), sin tener que decodificar ni reusar
// credenciales de nadie.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (!process.env.SUPABASE_CRON_SECRET || auth !== `Bearer ${process.env.SUPABASE_CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const resultado = await enviarAvisosPendientesBreak(diaLaboralPeru());
  return NextResponse.json(resultado);
}
