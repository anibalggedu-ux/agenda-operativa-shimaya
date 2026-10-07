import { NextResponse } from "next/server";
import { SignJWT } from "jose";
import { obtenerSesion } from "@/lib/session";

// Botón "Horarios de las tiendas": abre la app de Coordinación de Apoyos en modo SOLO LECTURA
// sin pedir otra contraseña. Se genera un enlace firmado que vence en 60 segundos y solo sirve una vez
// (la app de apoyos lo verifica con el mismo secreto). Solo supervisor, coordinador y gerente.
// Los capacitadores y cualquier otro rol quedan fuera. Si el secreto no está configurado, no se abre nada.
export const dynamic = "force-dynamic";

const ROLES_PERMITIDOS = ["supervisor", "coordinador", "gerente"];
const URL_APOYOS_POR_DEFECTO = "https://coordinacion-apoyos-tiendas.pages.dev";

export async function GET(req: Request) {
  const sesion = await obtenerSesion();
  if (!sesion) return NextResponse.redirect(new URL("/login", req.url));
  if (!ROLES_PERMITIDOS.includes(sesion.rol)) {
    return new NextResponse("Tu rol no tiene acceso a esta vista.", { status: 403 });
  }

  const secreto = process.env.APOYOS_SSO_SECRET;
  if (!secreto || secreto.length < 32) {
    return new NextResponse(
      "El acceso a Horarios de las tiendas todavía no está configurado (falta APOYOS_SSO_SECRET). Avisa al administrador.",
      { status: 503 }
    );
  }

  const ahora = Math.floor(Date.now() / 1000);
  const enlace = await new SignJWT({ nombre: sesion.nombre, rol: sesion.rol })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer("agenda-operativa")
    .setAudience("apoyos")
    .setSubject(String(sesion.id))
    .setJti(crypto.randomUUID())
    .setIssuedAt(ahora)
    .setExpirationTime(ahora + 60)
    .sign(new TextEncoder().encode(secreto));

  const base = (process.env.APOYOS_URL || URL_APOYOS_POR_DEFECTO).replace(/\/+$/, "");
  // El enlace va en el "#" (fragmento): no viaja al servidor ni queda en registros.
  const res = NextResponse.redirect(`${base}/sso#t=${enlace}`, 302);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}
