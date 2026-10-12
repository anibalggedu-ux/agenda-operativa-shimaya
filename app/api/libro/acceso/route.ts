import { NextResponse } from "next/server";
import { obtenerSesion } from "@/lib/session";

// Botón "Libro de reclamaciones": abre la app del Libro de Reclamaciones (reclamos y quejas de clientes).
// Esa app está protegida por Cloudflare Access (código de 6 dígitos al correo, sin contraseñas): al entrar
// por primera vez en un dispositivo pide el correo y el código, y luego recuerda la sesión.
// Solo supervisor, coordinador y gerente (los capacitadores quedan fuera), y solo entra quien tenga su correo
// autorizado en el Libro (en Cloudflare). El servidor comprueba el rol aquí para no depender de que alguien oculte el botón.
export const dynamic = "force-dynamic";

const ROLES_PERMITIDOS = ["supervisor", "coordinador", "gerente"];
const URL_LIBRO_POR_DEFECTO = "https://libro-reclamaciones.anibalggedu.workers.dev";

export async function GET(req: Request) {
  const sesion = await obtenerSesion();
  if (!sesion) return NextResponse.redirect(new URL("/login", req.url));
  if (!ROLES_PERMITIDOS.includes(sesion.rol)) {
    return new NextResponse("Tu rol no tiene acceso al Libro de Reclamaciones.", { status: 403 });
  }

  const base = (process.env.LIBRO_URL || URL_LIBRO_POR_DEFECTO).replace(/\/+$/, "");
  const res = NextResponse.redirect(base, 302);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}
