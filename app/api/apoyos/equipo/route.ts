import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { supabaseServer } from "@/lib/supabase-server";

// Lista de supervisores y capacitadores (con la ubicación aproximada de su domicilio) para la app de
// Coordinación de Apoyos: ahí el coordinador marca qué áreas domina cada uno y el sistema los propone
// como apoyo, del más cercano al más lejano. Solo la app de apoyos puede pedirla: llega un enlace firmado
// con el mismo secreto compartido (APOYOS_SSO_SECRET) que vence en 2 minutos. No se manda la dirección escrita,
// solo coordenadas redondeadas (~100 m).
export const dynamic = "force-dynamic";

const redondear = (n: number | null) => (n === null || n === undefined ? null : Math.round(Number(n) * 1000) / 1000);

export async function GET(req: Request) {
  const secreto = process.env.APOYOS_SSO_SECRET;
  if (!secreto || secreto.length < 32) return NextResponse.json({ error: "No configurado" }, { status: 503 });

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  try {
    await jwtVerify(token, new TextEncoder().encode(secreto), {
      issuer: "apoyos",
      audience: "agenda-operativa",
      algorithms: ["HS256"],
      maxTokenAge: "120s",
    });
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("usuarios")
    .select("id, nombre, rol, lat, lon")
    .in("rol", ["supervisor", "capacitador"])
    .eq("activo", true)
    .order("nombre");
  if (error) return NextResponse.json({ error: "No se pudo cargar" }, { status: 500 });

  // Las cuentas genéricas (sup-generico, cap-generico…) no son personas: no se proponen como apoyo ni para capacitar.
  // El gerente tampoco entra: solo se piden los roles supervisor y capacitador.
  const esGenerica = (nombre: string) => /gen[eé]ric/i.test(nombre);
  const equipo = (data ?? []).filter((u) => !esGenerica(String(u.nombre))).map((u) => ({
    id: String(u.id),
    nombre: u.nombre as string,
    rol: u.rol as string,
    lat: redondear(u.lat),
    lng: redondear(u.lon),
  }));
  const res = NextResponse.json({ equipo });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
