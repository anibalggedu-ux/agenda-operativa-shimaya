import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { supabaseServer } from "@/lib/supabase-server";
import { hoyPeru, sumarDias } from "@/lib/fechas";

// Visitas de supervisores, capacitadores y coordinadores a las tiendas, para el dashboard de la app de Coordinación de Apoyos.
// Junta las visitas ya reportadas (rutas_diarias), las que siguen pendientes (rutas_activas) y, para recuperar el origen de las visitas
// viejas, el historial de asignaciones del coordinador. Solo lectura. Solo la app de apoyos puede pedirla: llega un enlace firmado con el
// mismo secreto compartido (APOYOS_SSO_SECRET) que vence en 2 minutos.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const ROLES = ["supervisor", "capacitador", "coordinador"];
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DIAS = 400;

type Fila = Record<string, any>;
// PostgREST devuelve como máximo 1000 filas por consulta: se pide por tramos hasta que ya no haya más.
async function todas(pedir: (desde: number, hasta: number) => PromiseLike<{ data: Fila[] | null; error: unknown }>): Promise<Fila[]> {
  const out: Fila[] = [];
  for (let i = 0; i < 20; i++) {
    const { data, error } = await pedir(i * 1000, i * 1000 + 999);
    if (error) throw new Error("consulta");
    out.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

export async function GET(req: Request) {
  const secreto = process.env.APOYOS_SSO_SECRET;
  if (!secreto || secreto.length < 32) return NextResponse.json({ error: "No configurado" }, { status: 503 });
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  try {
    await jwtVerify(token, new TextEncoder().encode(secreto), { issuer: "apoyos", audience: "agenda-operativa", algorithms: ["HS256"], maxTokenAge: "120s" });
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const hoy = hoyPeru();
  const u = new URL(req.url).searchParams;
  let hasta = FECHA.test(u.get("hasta") ?? "") ? u.get("hasta")! : hoy;
  let desde = FECHA.test(u.get("desde") ?? "") ? u.get("desde")! : sumarDias(hasta, -29);
  if (desde > hasta) desde = hasta;
  if (desde < sumarDias(hasta, -MAX_DIAS)) desde = sumarDias(hasta, -MAX_DIAS);

  const supabase = supabaseServer();
  try {
    const [usuarios, tiendas] = await Promise.all([
      supabase.from("usuarios").select("id, nombre, rol").in("rol", ROLES),
      supabase.from("tiendas").select("id, nombre"),
    ]);
    if (usuarios.error || tiendas.error) throw new Error("catalogo");
    const persona = new Map((usuarios.data ?? []).map((x) => [String(x.id), x] as const));
    const tienda = new Map((tiendas.data ?? []).map((x) => [String(x.id), String(x.nombre)] as const));

    const [diarias, activas, historial] = await Promise.all([
      todas((a, b) => supabase.from("rutas_diarias").select("fecha, usuario_id, tienda_id, hora_llegada, hora_salida, autoasignada, area, enfoque").gte("fecha", desde).lte("fecha", hasta).order("fecha").range(a, b)),
      todas((a, b) => supabase.from("rutas_activas").select("fecha_planificada, usuario_id, tienda_id, hora_llegada, hora_salida, autoasignada, area, enfoque").gte("fecha_planificada", desde).lte("fecha_planificada", hasta).order("fecha_planificada").range(a, b)),
      todas((a, b) => supabase.from("historial_asignaciones").select("fecha_planificada, usuario_id, tienda_id, area, enfoque").gte("fecha_planificada", desde).lte("fecha_planificada", hasta).order("fecha_planificada").range(a, b)),
    ]);

    // Las visitas viejas ya reportadas no guardan si fueron asignadas: si el coordinador la había planificado (historial), se recupera de ahí.
    const planificada = new Map(historial.map((h) => [`${h.fecha_planificada}|${h.usuario_id}|${h.tienda_id}`, h] as const));
    const filas: Record<string, unknown>[] = [];
    const agregar = (r: Fila, fecha: string, estado: "reportada" | "pendiente" | "sin_reporte") => {
      const p = persona.get(String(r.usuario_id));
      if (!p) return; // solo supervisores, capacitadores y coordinadores
      const plan = planificada.get(`${fecha}|${r.usuario_id}|${r.tienda_id}`);
      const origen = r.autoasignada === true ? "autoasignada" : r.autoasignada === false ? "asignada" : plan ? "asignada" : null;
      filas.push({
        fecha, persona: String(p.nombre), rol: String(p.rol), tienda: tienda.get(String(r.tienda_id)) ?? "?", estado, origen,
        llegada: r.hora_llegada ?? null, salida: r.hora_salida ?? null, area: r.area ?? plan?.area ?? null, enfoque: r.enfoque ?? plan?.enfoque ?? null,
      });
    };
    for (const r of diarias) agregar(r, String(r.fecha), "reportada");
    for (const r of activas) agregar(r, String(r.fecha_planificada), String(r.fecha_planificada) >= hoy ? "pendiente" : "sin_reporte");
    filas.sort((a, b) => (String(a.fecha) < String(b.fecha) ? 1 : String(a.fecha) > String(b.fecha) ? -1 : String(a.persona).localeCompare(String(b.persona))));
    return NextResponse.json({ desde, hasta, hoy, visitas: filas });
  } catch {
    return NextResponse.json({ error: "No se pudo cargar" }, { status: 500 });
  }
}
