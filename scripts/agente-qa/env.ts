// Carga las variables de entorno del proyecto Supabase de PRUEBA (separado
// del real) desde .env.qa.local -- nunca desde .env.local, que apunta a
// producción. Compartido por seed.ts y run.ts.

import { config } from "dotenv";
import { existsSync } from "fs";
import { resolve } from "path";

const ARCHIVO = resolve(process.cwd(), "scripts/agente-qa/.env.qa.local");

if (!existsSync(ARCHIVO)) {
  console.error(
    `No se encontró ${ARCHIVO}.\n` +
      "Copia scripts/agente-qa/.env.qa.example a scripts/agente-qa/.env.qa.local y completa los valores " +
      "(URL y service_role key del proyecto Supabase DE PRUEBA, nunca el real)."
  );
  process.exit(1);
}

config({ path: ARCHIVO });

function exigir(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) {
    console.error(`Falta ${nombre} en scripts/agente-qa/.env.qa.local`);
    process.exit(1);
  }
  return valor;
}

export const QA_SUPABASE_URL = exigir("QA_SUPABASE_URL");
export const QA_SUPABASE_SERVICE_ROLE_KEY = exigir("QA_SUPABASE_SERVICE_ROLE_KEY");
export const QA_SESSION_SECRET = exigir("QA_SESSION_SECRET");
export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY; // opcional: puede venir de `ant auth login`
export const QA_APP_PORT = Number(process.env.QA_APP_PORT || 3100);

// Salvavidas: si por error alguien apunta .env.qa.local al proyecto real,
// que truene fuerte en vez de dejar que el agente ande tocando datos reales.
if (QA_SUPABASE_URL.includes("vcxedfrldesstgbvkhcf")) {
  console.error(
    "QA_SUPABASE_URL apunta al proyecto de PRODUCCIÓN (vcxedfrldesstgbvkhcf). " +
      "Esto tiene que ser el proyecto de prueba (agenda-shimaya-qa-agentes). Abortando."
  );
  process.exit(1);
}
