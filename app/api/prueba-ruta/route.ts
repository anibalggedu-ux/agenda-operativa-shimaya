import { NextRequest, NextResponse } from "next/server";
import { calcularRutaAuto, formatearMinutos } from "@/lib/distancia";

// Ruta temporal de diagnostico para probar Mapbox con un caso real
// (casa de Anibal -> tienda San Borja). Se elimina despues de la prueba.
const TOKEN = "shimaya-ruta-diag-4f9c21";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (token !== TOKEN) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const ruta = await calcularRutaAuto(-12.088823, -77.058946, -12.087664, -77.003546);

  return NextResponse.json({
    ruta,
    formateado: ruta ? `${ruta.km} km (~${formatearMinutos(ruta.minutos)} en auto)` : null,
  });
}
