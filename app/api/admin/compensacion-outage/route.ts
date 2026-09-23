import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { enviarCorreo } from "@/lib/email";

// Ruta administrativa de un solo uso -- compensación por la caída de Azure
// Storage del 21-22 de septiembre de 2026 (ver conversación). Se borra
// después de correrla una vez. Protegida por un secreto que solo conoce
// quien la ejecuta manualmente (no la llama ningún cron ni ninguna parte de
// la UI).
export const dynamic = "force-dynamic";

const PUNTOS_COMPENSACION = 25;

// Cuentas genéricas/de prueba (comparten el mismo correo real) -- se
// excluyen de los puntos y del correo para no mandar 3 copias al mismo
// buzón ni tocar datos que no son de una persona real.
const IDS_EXCLUIR = new Set([
  "b0d49e2e-790c-4b3c-8b52-509210f1f569", // cap-generico
  "b6302577-981e-4d13-ade8-15e48f6e8e17", // coor-generico
  "03e9f20e-7efc-4085-bf19-8c16483832a6", // sup-generico
]);

const KARLA_ID = "9eb2cc1f-85ac-44d3-9281-ae397cbe2ba2";

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (!process.env.ADMIN_TASK_SECRET || auth !== `Bearer ${process.env.ADMIN_TASK_SECRET}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const supabase = supabaseServer();

  // 1. Regulariza el único ingreso real que quedó sin marcar (Karla Suárez,
  // 21 de sept.) -- a su hora límite de puntualidad (coordinador, 12:00pm).
  const { data: yaExiste } = await supabase
    .from("asistencia")
    .select("id")
    .eq("usuario_id", KARLA_ID)
    .eq("fecha", "2026-09-21")
    .maybeSingle();

  if (!yaExiste) {
    await supabase.from("asistencia").insert({
      usuario_id: KARLA_ID,
      fecha: "2026-09-21",
      hora_ingreso: "12:00:00",
    });
  }

  // 2. +25 puntos a todo el equipo real con bitácora.
  const { data: usuarios, error: errorUsuarios } = await supabase
    .from("usuarios")
    .select("id, nombre, email, puntos_heredados")
    .eq("activo", true)
    .in("rol", ["supervisor", "capacitador", "coordinador"]);

  if (errorUsuarios) return NextResponse.json({ error: "No se pudo leer usuarios." }, { status: 500 });

  const reales = (usuarios ?? []).filter((u) => !IDS_EXCLUIR.has(u.id));

  let puntosActualizados = 0;
  for (const u of reales) {
    const { error } = await supabase
      .from("usuarios")
      .update({ puntos_heredados: (u.puntos_heredados ?? 0) + PUNTOS_COMPENSACION })
      .eq("id", u.id);
    if (!error) puntosActualizados++;
  }

  // 3. Correo de disculpa + aviso a cada uno.
  let correosEnviados = 0;
  const fallidos: string[] = [];
  for (const u of reales) {
    if (!u.email) {
      fallidos.push(u.nombre);
      continue;
    }
    const primerNombre = u.nombre.split(" ")[0];
    const resultado = await enviarCorreo({
      para: u.email,
      asunto: "Ya se solucionó: puedes marcar tu ingreso y salida con normalidad",
      tituloEmoji: "✅",
      cuerpoHtml: `
        <p>Hola ${primerNombre},</p>
        <p>Te escribimos porque el 21 y 22 de septiembre tuvimos una falla externa con nuestro proveedor de
        almacenamiento de fotos, que en algunos casos no dejó marcar el ingreso o la salida en la app con
        normalidad.</p>
        <p>Ya está <strong>completamente solucionado</strong> — puedes marcar tu ingreso y salida sin ningún
        problema.</p>
        <p>Como agradecimiento por tu paciencia, te sumamos <strong>25 puntos</strong> a tu cuenta.</p>
        <p>Gracias por tu comprensión.</p>
        <p>Equipo Shimaya</p>
      `,
    });
    if (resultado.exito) correosEnviados++;
    else fallidos.push(u.nombre);
  }

  return NextResponse.json({
    ok: true,
    totalEquipoReal: reales.length,
    puntosActualizados,
    correosEnviados,
    fallidos,
  });
}
