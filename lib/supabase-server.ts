import { createClient } from "@supabase/supabase-js";

// FIX SEGURIDAD: este cliente usa la SERVICE_ROLE_KEY, que tiene acceso total
// a la base de datos SIN pasar por RLS. Por eso este archivo SOLO se importa
// desde código que corre en el servidor (Server Actions, Route Handlers) —
// nunca desde un componente de cliente ("use client"). La clave nunca viaja
// al navegador porque no tiene el prefijo NEXT_PUBLIC_.
export function supabaseServer() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Faltan las variables de entorno SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY. Revisa tu archivo .env.local o la configuración de Vercel."
    );
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}
