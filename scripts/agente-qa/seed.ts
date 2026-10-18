// Siembra los 4 usuarios de prueba (uno por rol) + un par de tiendas en el
// proyecto Supabase DE PRUEBA, para que el agente de QA (run.ts) tenga algo
// real con qué trabajar. Pensado para correr una vez por cada esquema nuevo,
// y es seguro re-correrlo: borra primero cualquier fila "QA " que haya
// quedado de una corrida anterior.
//
// Uso: npm run qa:seed

import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import {
  QA_SUPABASE_URL,
  QA_SUPABASE_SERVICE_ROLE_KEY,
} from "./env";

function hashPassword(clave: string): string {
  // Debe ser EXACTO el mismo algoritmo que lib/password.ts del app real
  // (SHA-256 hex), para que el login funcione con esta clave.
  return createHash("sha256").update(clave, "utf8").digest("hex");
}

const supabase = createClient(QA_SUPABASE_URL, QA_SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const CLAVE_SUPERVISOR = process.env.QA_CLAVE_SUPERVISOR || "qa-supervisor-001";
const CLAVE_CAPACITADOR = process.env.QA_CLAVE_CAPACITADOR || "qa-capacitador-001";
const CLAVE_COORDINADOR = process.env.QA_CLAVE_COORDINADOR || "qa-coordinador-001";
const CLAVE_GERENTE = process.env.QA_CLAVE_GERENTE || "qa-gerente-001";

// Coordenadas reales de Lima (zona de El Polo) -- no importa que sean reales,
// solo que existan para que el cálculo de distancia/ETA tenga algo con qué
// trabajar.
const TIENDAS = [
  { nombre: "QA Tienda Centro", direccion: "Av. Primavera 100, Surco", lat: -12.1075, lon: -76.9739 },
  { nombre: "QA Tienda Norte", direccion: "Av. Túpac Amaru 500, Independencia", lat: -11.9897, lon: -77.0564 },
  { nombre: "QA Tienda Sur", direccion: "Av. Pachacútec 800, Villa El Salvador", lat: -12.2167, lon: -76.9333 },
];

async function limpiarCorridaAnterior() {
  // tiendas_permanentes y usuarios de prueba previos -- por nombre, ya que
  // los ids son generados por la base. El orden importa por las FKs.
  const { data: usuariosQa } = await supabase.from("usuarios").select("id").like("nombre", "QA %");
  const idsUsuarios = (usuariosQa ?? []).map((u) => u.id);
  if (idsUsuarios.length > 0) {
    await supabase.from("tiendas_permanentes").delete().in("usuario_id", idsUsuarios);
  }
  await supabase.from("usuarios").delete().like("nombre", "QA %");
  await supabase.from("tiendas").delete().like("nombre", "QA %");
}

async function main() {
  console.log(`Sembrando datos de prueba en ${QA_SUPABASE_URL}...`);
  await limpiarCorridaAnterior();

  const { data: tiendasCreadas, error: errorTiendas } = await supabase
    .from("tiendas")
    .insert(TIENDAS)
    .select("id, nombre");
  if (errorTiendas) throw errorTiendas;
  console.log(`Tiendas creadas: ${tiendasCreadas.map((t) => t.nombre).join(", ")}`);

  const tiendaCentro = tiendasCreadas.find((t) => t.nombre === "QA Tienda Centro")!;

  const USUARIOS = [
    {
      nombre: "QA Supervisor",
      rol: "supervisor",
      clave_hash: hashPassword(CLAVE_SUPERVISOR),
      puede_auditar: true,
    },
    {
      nombre: "QA Capacitador",
      rol: "capacitador",
      clave_hash: hashPassword(CLAVE_CAPACITADOR),
    },
    {
      nombre: "QA Coordinador",
      rol: "coordinador",
      clave_hash: hashPassword(CLAVE_COORDINADOR),
      puede_auditar: true,
      puede_registrar: true,
    },
    {
      nombre: "QA Gerente",
      rol: "gerente",
      clave_hash: hashPassword(CLAVE_GERENTE),
      puede_registrar: true,
    },
  ];

  const { data: usuariosCreados, error: errorUsuarios } = await supabase
    .from("usuarios")
    .insert(USUARIOS)
    .select("id, nombre, rol");
  if (errorUsuarios) throw errorUsuarios;

  // Supervisor, capacitador y coordinador comparten Bitácora de Campo
  // (tieneBitacora en lib/session.ts) -- les damos a los tres una tienda fija
  // para que el agente pueda probar marcaciones/checklist sin tener que
  // autoasignarse una primero.
  const conBitacora = usuariosCreados.filter((u) => u.rol !== "gerente");
  const { error: errorPermanentes } = await supabase.from("tiendas_permanentes").insert(
    conBitacora.map((u) => ({ usuario_id: u.id, tienda_id: tiendaCentro.id }))
  );
  if (errorPermanentes) throw errorPermanentes;

  console.log("\nUsuarios de prueba listos:");
  for (const u of usuariosCreados) {
    console.log(`  - ${u.nombre} (${u.rol})  id=${u.id}`);
  }
  console.log(
    "\nClaves de login (de scripts/agente-qa/.env.qa.local):\n" +
      `  supervisor:   ${CLAVE_SUPERVISOR}\n` +
      `  capacitador:  ${CLAVE_CAPACITADOR}\n` +
      `  coordinador:  ${CLAVE_COORDINADOR}\n` +
      `  gerente:      ${CLAVE_GERENTE}\n`
  );
}

main().catch((err) => {
  console.error("Falló la siembra de datos de prueba:", err);
  process.exit(1);
});
