import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// FIX SEGURIDAD: este cliente usa la SERVICE_ROLE_KEY, que tiene acceso total
// a la base de datos SIN pasar por RLS. Por eso este archivo SOLO se importa
// desde código que corre en el servidor (Server Actions, Route Handlers) —
// nunca desde un componente de cliente ("use client"). La clave nunca viaja
// al navegador porque no tiene el prefijo NEXT_PUBLIC_.
//
// El genérico <Database> (lib/database.types.ts, generado desde el esquema
// real vía Supabase MCP) tipa cada .from(tabla).select(...) contra las
// columnas reales — antes cada .select() devolvía `any` implícito y el
// tipado de dominio se reconstruía a mano por archivo, sin garantía de que
// coincidiera con la base de datos.
export function supabaseServer() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Faltan las variables de entorno SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY. Revisa tu archivo .env.local o la configuración de Vercel."
    );
  }

  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false },
    // Sin esto, Next.js (App Router) puede guardar en caché las llamadas
    // fetch() que supabase-js hace por dentro, incluso en una ruta marcada
    // "force-dynamic" -- confirmado en producción: una consulta nueva a
    // marcaciones_break devolvía siempre la misma respuesta vieja (0 filas)
    // pese a que, probando la MISMA consulta directo contra PostgREST, sí
    // traía la fila real. Caso real: el cron de "5 min de break" nunca
    // detectó un break real durante horas, porque la primera vez que corrió
    // tras el último deploy no había nadie en break, y esa respuesta vacía
    // quedó pegada para todas las corridas siguientes. cache: "no-store"
    // obliga a que cada consulta vaya siempre a la base, nunca a una
    // respuesta guardada -- justo lo que se espera de este cliente, que ya
    // existe para tener siempre el dato real sin pasar por RLS.
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
}
