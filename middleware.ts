import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

// FIX SEGURIDAD: esto reemplaza el patrón "revisa el rol en cada función del
// .gs" — acá se revisa UNA vez, antes de que la petición siquiera llegue a la
// página, para TODA ruta bajo /panel/. Si el JWT no es válido o no coincide
// con el rol de la carpeta, se redirige a /login — no hay forma de "engañar"
// esto editando algo del lado del navegador, porque el JWT está firmado.
const SECRET = new TextEncoder().encode(
  process.env.SESSION_SECRET || "cambia-este-secreto-en-produccion"
);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const match = pathname.match(/^\/panel\/([a-z]+)/);
  if (!match) return NextResponse.next();

  const rolRequerido = match[1];
  const token = req.cookies.get("sesion_shimaya")?.value;

  if (!token) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  try {
    const { payload } = await jwtVerify(token, SECRET);

    // Central Analítica, Registro y Documentos son compartidas entre roles —
    // solo exigen sesión válida aquí; el control de acceso fino (quién puede
    // registrar usuarios o administrar documentos) se revisa dentro de la
    // página misma.
    if (rolRequerido === "analitica" || rolRequerido === "registro" || rolRequerido === "documentos")
      return NextResponse.next();

    if (payload.rol !== rolRequerido) {
      // Sesión válida, pero de otro rol tratando de entrar a un panel ajeno
      return NextResponse.redirect(new URL(`/panel/${payload.rol}`, req.url));
    }
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL("/login", req.url));
  }
}

export const config = {
  matcher: "/panel/:path*",
};
