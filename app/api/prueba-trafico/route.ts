import { NextRequest, NextResponse } from "next/server";
import { calcularRutaAuto } from "@/lib/distancia";

// Ruta temporal de diagnostico: compara el trafico "ahora mismo" vs. el
// predicho para manana a las 12:00 (hora limite de supervisor), mismo
// trayecto (casa Anibal -> San Borja). Se elimina despues de la prueba.
const TOKEN = "shimaya-trafico-diag-9a13cd";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (token !== TOKEN) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const departAt = new Date("2026-09-15T12:00:00-05:00").toISOString();
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/-77.058946,-12.088823;-77.003546,-12.087664?overview=false&access_token=${process.env.MAPBOX_ACCESS_TOKEN}&depart_at=${departAt}`;
  const res = await fetch(url);
  const crudo = await res.json();

  return NextResponse.json({ departAtEnviado: departAt, status: res.status, crudo });
}
