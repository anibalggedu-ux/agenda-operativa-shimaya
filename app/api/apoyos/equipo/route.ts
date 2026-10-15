import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { supabaseServer } from "@/lib/supabase-server";
import { hoyPeru, sumarDias } from "@/lib/fechas";

// Lista de supervisores y capacitadores (con la ubicación aproximada de su domicilio) para la app de
// Coordinación de Apoyos: ahí el coordinador marca qué áreas domina cada uno y el sistema los propone
// como apoyo, del más cercano al más lejano. Solo la app de apoyos puede pedirla: llega un enlace firmado
// con el mismo secreto compartido (APOYOS_SSO_SECRET) que vence en 2 minutos. No se manda la dirección escrita,
// solo coordenadas redondeadas (~100 m).
export const dynamic = "force-dynamic";
// Las consultas a la base no se guardan en la caché de datos de Next: con ella, los supervisores asignados llegaban a Apoyos con datos de días atrás.
export const fetchCache = "force-no-store";

// Días de descanso fijo guardados como LUNES…DOMINGO (sin tilde) -> 1..7 (lunes = 1).
const DIA_ISO: Record<string, number> = { LUNES: 1, MARTES: 2, MIERCOLES: 3, JUEVES: 4, VIERNES: 5, SABADO: 6, DOMINGO: 7 };
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
    .select("id, nombre, rol, lat, lon, dias_descanso")
    .in("rol", ["supervisor", "capacitador"])
    .eq("activo", true)
    .order("nombre");
  if (error) return NextResponse.json({ error: "No se pudo cargar" }, { status: 500 });

  // Las cuentas genéricas (sup-generico, cap-generico…) no son personas: no se proponen como apoyo ni para capacitar.
  // El gerente tampoco entra: solo se piden los roles supervisor y capacitador.
  const esGenerica = (nombre: string) => /gen[eé]ric/i.test(nombre);
  // Ausencias de los próximos días: vacaciones, permisos, licencias, descansos especiales, misiones y permisos aprobados.
  const desde = hoyPeru();
  const hasta = sumarDias(desde, 28);
  const [{ data: especiales }, { data: permisos }] = await Promise.all([
    supabase.from("asignaciones_especiales").select("usuario_id, tipo, fecha_inicio, fecha_fin").lte("fecha_inicio", hasta).gte("fecha_fin", desde),
    supabase.from("solicitudes_permiso").select("usuario_id, fecha_inicio, fecha_fin").eq("estado", "aprobado").lte("fecha_inicio", hasta).gte("fecha_fin", desde),
  ]);
  // Tiendas asignadas de forma permanente a cada supervisor (sin fecha de fin): la app de Apoyos las usa para saber quién aprueba el horario de cada tienda.
  const { data: asignadas } = await supabase.from("tiendas_permanentes").select("usuario_id, tiendas(nombre)").is("fecha_fin", null);
  const tiendasDe = (id: string) =>
    (asignadas ?? [])
      .filter((a: any) => String(a.usuario_id) === id)
      .map((a: any) => String((Array.isArray(a.tiendas) ? a.tiendas[0]?.nombre : a.tiendas?.nombre) ?? ""))
      .filter(Boolean);
  const ausenciasDe = (id: string) => [
    ...(especiales ?? []).filter((a: any) => a.usuario_id === id).map((a: any) => ({ desde: a.fecha_inicio as string, hasta: a.fecha_fin as string, motivo: String(a.tipo ?? "Ausencia") })),
    ...(permisos ?? []).filter((a: any) => a.usuario_id === id).map((a: any) => ({ desde: a.fecha_inicio as string, hasta: a.fecha_fin as string, motivo: "Permiso" })),
  ];
  const equipo = (data ?? []).filter((u) => !esGenerica(String(u.nombre))).map((u) => ({
    id: String(u.id),
    nombre: u.nombre as string,
    rol: u.rol as string,
    lat: redondear(u.lat),
    lng: redondear(u.lon),
    descanso_semanal: ((u.dias_descanso ?? []) as string[]).map((d) => DIA_ISO[String(d).toUpperCase()]).filter(Boolean),
    ausencias: ausenciasDe(String(u.id)),
    tiendas: u.rol === "supervisor" ? tiendasDe(String(u.id)) : [],
  }));
  // Quién tiene tiendas asignadas de forma permanente: supervisores y también coordinadores (ej. una coordinadora a cargo de Shirest). No son parte del equipo de apoyo.
  const { data: responsables } = await supabase.from("usuarios").select("id, nombre, rol").in("rol", ["supervisor", "coordinador"]).eq("activo", true);
  const supervisan = (responsables ?? [])
    .filter((u: any) => !esGenerica(String(u.nombre)))
    .map((u: any) => ({ id: String(u.id), nombre: u.nombre as string, rol: u.rol as string, tiendas: tiendasDe(String(u.id)) }))
    .filter((u) => u.tiendas.length > 0);
  const res = NextResponse.json({ equipo, supervisan });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
