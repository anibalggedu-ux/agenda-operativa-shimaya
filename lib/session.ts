import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

// FIX SEGURIDAD DE FONDO: en Apps Script guardábamos el rol en sessionStorage,
// que cualquiera puede editar a mano desde la consola del navegador
// (sessionStorage.setItem('rolUsuario', 'GERENTE')) — ese fue justamente el
// hueco de seguridad que detectamos en la auditoría. Acá el rol viaja dentro
// de un JWT FIRMADO por el servidor, guardado en una cookie httpOnly: el
// navegador no puede leerlo ni modificarlo, solo reenviarlo tal cual.
const SECRET = new TextEncoder().encode(
  process.env.SESSION_SECRET || "cambia-este-secreto-en-produccion"
);
const COOKIE_NAME = "sesion_shimaya";

export type SesionUsuario = {
  id: string;
  nombre: string;
  rol: "coordinador" | "supervisor" | "capacitador" | "gerente";
};

export async function crearSesion(usuario: SesionUsuario) {
  const token = await new SignJWT({ ...usuario })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(SECRET);

  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12, // 12 horas
  });
}

export async function obtenerSesion(): Promise<SesionUsuario | null> {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as unknown as SesionUsuario;
  } catch {
    return null; // token inválido, vencido, o alterado
  }
}

export async function cerrarSesion() {
  cookies().delete(COOKIE_NAME);
}

// El Coordinador también hace visitas de campo bajo su propia "Mi Ruta",
// además de Supervisor — ambos roles comparten la bitácora (selector de
// tiendas, reporte y PDF).
export function tieneBitacora(rol: SesionUsuario["rol"]): boolean {
  return rol === "supervisor" || rol === "coordinador";
}
