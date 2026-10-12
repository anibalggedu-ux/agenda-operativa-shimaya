import { NextResponse } from "next/server";
import { obtenerSesion } from "@/lib/session";

// Botón "Sistema de propinas" en Central Analítica: redirige a la app de
// propinas de otro equipo. El link real (con su clave de acceso) vive en la
// variable de entorno PROPINAS_URL, nunca en el código -- así no queda
// guardado en git ni le llega al navegador. Cualquiera logueado en esta app
// puede usarlo (ver central-analitica.tsx, donde se muestra el botón).
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const sesion = await obtenerSesion();
  if (!sesion) return NextResponse.redirect(new URL("/login", req.url));

  const url = process.env.PROPINAS_URL;
  if (!url) {
    return new NextResponse(
      "El acceso al Sistema de propinas todavía no está configurado (falta PROPINAS_URL). Avisa al administrador.",
      { status: 503 }
    );
  }

  const res = NextResponse.redirect(url, 302);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}
