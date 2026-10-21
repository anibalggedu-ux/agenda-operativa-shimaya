import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { supabaseServer } from "@/lib/supabase-server";
import { notificarPush } from "@/lib/notificar-push";

// La app de Coordinación de Apoyos le pide a Agenda Operativa que mande un push a UNA persona (hoy: el responsable de soporte
// cuando un líder reporta una avería o deja una sugerencia). Solo la app de apoyos puede pedirlo: llega un enlace firmado
// con el mismo secreto compartido (APOYOS_SSO_SECRET) que vence en 2 minutos. El destino de la notificación NO lo manda
// quien llama: siempre abre /api/apoyos/acceso (con el número del mensaje o la tienda y semana del horario), que entra a Apoyos con la sesión de Agenda.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLES_QUE_PUEDEN_RECIBIR = ["supervisor", "coordinador", "gerente"];

export async function POST(req: Request) {
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

  const cuerpo = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const usuarioId = String(cuerpo.usuario_id ?? "");
  const titulo = String(cuerpo.titulo ?? "").trim().slice(0, 80);
  const texto = String(cuerpo.cuerpo ?? "").trim().replace(/\s+/g, " ").slice(0, 160);
  const ticket = Number(cuerpo.ticket_id);
  // Aviso al supervisor de que un líder confirmó el horario de una semana: abre Apoyos directo en esa tienda y semana.
  const horarioTienda = Number(cuerpo.horario_store_id);
  const horarioSemana = String(cuerpo.horario_semana ?? "");
  if (!UUID.test(usuarioId) || !titulo) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const supabase = supabaseServer();
  const { data: usuario } = await supabase.from("usuarios").select("id, rol, activo").eq("id", usuarioId).maybeSingle();
  if (!usuario || !usuario.activo || !ROLES_QUE_PUEDEN_RECIBIR.includes(String(usuario.rol))) {
    return NextResponse.json({ error: "Destinatario no válido" }, { status: 404 });
  }

  const url = Number.isInteger(horarioTienda) && horarioTienda > 0 && horarioTienda < 1_000_000_000 && /^\d{4}-\d{2}-\d{2}$/.test(horarioSemana)
    ? `/api/apoyos/acceso?ir=horario-${horarioTienda}-${horarioSemana.replace(/-/g, "")}`
    : Number.isInteger(ticket) && ticket > 0 && ticket < 1_000_000_000 ? `/api/apoyos/acceso?ir=soporte-${ticket}` : "/api/apoyos/acceso";
  await notificarPush([usuarioId], { titulo, cuerpo: texto, url });
  return NextResponse.json({ ok: true });
}
