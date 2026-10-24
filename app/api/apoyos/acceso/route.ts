import { NextResponse } from "next/server";
import { SignJWT } from "jose";
import { obtenerSesion } from "@/lib/session";

// Botón "Apoyos y estatus de tienda": abre la app de Coordinación de Apoyos sin pedir otra contraseña (por defecto en SOLO LECTURA;
// Apoyos decide por el id de usuario de este enlace si la persona tiene acceso completo de coordinador). Se genera un enlace firmado que vence en 60 segundos y solo sirve una vez
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
  // Enlace directo (viene de la notificación push): a un mensaje de soporte (?ir=soporte-123) o al horario de una tienda y semana
  // (?ir=horario-12-20261026) o al dashboard (?ir=dashboard) o a Estatus de tienda (?ir=estatus). Solo se aceptan esos formatos.
  const ir = new URL(req.url).searchParams.get("ir") ?? "";
  const destino = /^(soporte-\d{1,9}|horario-\d{1,9}-\d{8}|dashboard|estatus)$/.test(ir) ? `&ir=${ir}` : "";
  // El enlace va en el "#" (fragmento): no viaja al servidor ni queda en registros.
  const res = NextResponse.redirect(`${base}/sso#t=${enlace}${destino}`, 302);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}
