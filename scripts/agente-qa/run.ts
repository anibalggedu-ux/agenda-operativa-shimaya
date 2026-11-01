// Agente de QA: abre la app de verdad (Playwright) apuntando al proyecto
// Supabase DE PRUEBA, inicia sesión como cada uno de los 4 roles, y deja que
// Claude decida qué tocar en cada paso -- como alguien nuevo explorando el
// sistema -- en vez de seguir un guion fijo. Junta lo que encuentra (errores
// de consola, respuestas fallidas del servidor, y lo que el propio Claude
// marque como raro) en un reporte Markdown.
//
// Uso:
//   npm run qa:seed              (una vez, o cada vez que se reclone el esquema)
//   npm run qa:agente                              -- los 4 roles, 20 pasos c/u
//   npm run qa:agente -- --roles=supervisor --steps=10
//   npm run qa:agente -- --headed                  (ver el navegador en vivo)

import Anthropic from "@anthropic-ai/sdk";
import { chromium, type Page, type Browser } from "playwright";
import { spawn, type ChildProcess } from "child_process";
import { mkdirSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import {
  QA_SUPABASE_URL,
  QA_SUPABASE_SERVICE_ROLE_KEY,
  QA_SESSION_SECRET,
  QA_APP_PORT,
  ANTHROPIC_API_KEY,
} from "./env";

// ---------- Argumentos de línea de comando ----------

const argv = process.argv.slice(2);
function flag(nombre: string): string | undefined {
  const prefijo = `--${nombre}=`;
  const hallado = argv.find((a) => a.startsWith(prefijo));
  return hallado?.slice(prefijo.length);
}
const SOLO_ROLES = (flag("roles")?.split(",") ?? ["supervisor", "capacitador", "coordinador", "gerente"]).map((r) =>
  r.trim()
);
const PASOS_MAX = Number(flag("steps") ?? 20);
const HEADLESS = !argv.includes("--headed");
const MODELO = process.env.CLAUDE_QA_MODEL || "claude-opus-5-5";

type Rol = "supervisor" | "capacitador" | "coordinador" | "gerente";

// ---------- Foto de prueba para cuando Claude abre la cámara/galería ----------
// comprimirFotoComoBase64() del app solo necesita una imagen JPEG
// decodificable, no que se vea bien -- se genera una vez en disco
// (gitignorado) con ffmpeg-static (ya es dependencia del proyecto, para
// comprimir videos de historias) para pasársela a cualquier
// <input type="file"> que se abra durante la exploración.

const RUTA_FOTO_PRUEBA = resolve(process.cwd(), "scripts/agente-qa/fixtures/foto-prueba.jpg");

async function asegurarFotoPrueba(): Promise<void> {
  mkdirSync(resolve(process.cwd(), "scripts/agente-qa/fixtures"), { recursive: true });
  if (existsSync(RUTA_FOTO_PRUEBA)) return;
  const ffmpegPath = (await import("ffmpeg-static")).default as unknown as string;
  await new Promise<void>((resolveFn, reject) => {
    const proceso = spawn(ffmpegPath, [
      "-f", "lavfi", "-i", "color=c=red:s=320x240",
      "-frames:v", "1", "-y", RUTA_FOTO_PRUEBA,
    ]);
    proceso.on("error", reject);
    proceso.on("exit", (codigo) => (codigo === 0 ? resolveFn() : reject(new Error(`ffmpeg salió con código ${codigo}`))));
  });
}

const CLAVES: Record<Rol, string> = {
  supervisor: process.env.QA_CLAVE_SUPERVISOR || "qa-supervisor-001",
  capacitador: process.env.QA_CLAVE_CAPACITADOR || "qa-capacitador-001",
  coordinador: process.env.QA_CLAVE_COORDINADOR || "qa-coordinador-001",
  gerente: process.env.QA_CLAVE_GERENTE || "qa-gerente-001",
};

const PERSONAS: Record<Rol, string> = {
  supervisor:
    "Eres un SUPERVISOR de campo que recién empieza a usar esta app en su celular. Tu día real incluye: revisar tu ruta de tiendas, autoasignarte una tienda si no tienes ninguna, marcar llegada/salida con foto, llenar el checklist de visita, revisar Central Analítica, y mirar Documentos o el Calendario.",
  capacitador:
    "Eres un CAPACITADOR de campo. Haces visitas parecidas a un supervisor (misma Bitácora: selector de tiendas, marcación con foto, checklist), pero tu foco es la capacitación del personal de tienda -- revisa también Documentos y cualquier sección de material de capacitación.",
  coordinador:
    "Eres un COORDINADOR de oficina. Tienes acceso de lectura amplio: revisa Central Analítica de todo el equipo, Registro (si puedes registrar usuarios), el Calendario de otros, Auditorías, y la gestión de tiendas permanentes/descansos si la encuentras.",
  gerente:
    "Eres un GERENTE. Como el coordinador, tienes acceso de lectura amplio sobre todo el equipo -- revisa Central Analítica, Documentos, Calendario, Auditorías, y cualquier reporte o resumen ejecutivo que encuentres.",
};

// ---------- Tipos de hallazgo ----------

type Hallazgo = {
  rol: Rol;
  tipo: "reportado" | "consola" | "red";
  severidad?: "alto" | "medio" | "bajo";
  resumen: string;
  detalle: string;
  url: string;
};

const hallazgos: Hallazgo[] = [];

// ---------- Levantar `next dev` apuntando a la base de prueba ----------

function levantarServidor(): Promise<ChildProcess> {
  return new Promise((resolveFn, reject) => {
    const proceso = spawn("npx", ["next", "dev", "-p", String(QA_APP_PORT)], {
      cwd: resolve(process.cwd()),
      env: {
        ...process.env,
        SUPABASE_URL: QA_SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: QA_SUPABASE_SERVICE_ROLE_KEY,
        SESSION_SECRET: QA_SESSION_SECRET,
        NODE_ENV: "development",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let listo = false;
    const timeout = setTimeout(() => {
      if (!listo) reject(new Error("next dev no arrancó a tiempo (60s) -- revisa que el puerto esté libre."));
    }, 60000);

    proceso.stdout?.on("data", (buf) => {
      const texto = buf.toString();
      if (!listo && /Ready in|started server/i.test(texto)) {
        listo = true;
        clearTimeout(timeout);
        // Un respiro extra -- "Ready" sale antes de que el primer compile-on-demand
        // de la ruta /login esté listo para responder.
        setTimeout(() => resolveFn(proceso), 1500);
      }
    });
    proceso.stderr?.on("data", (buf) => process.stderr.write(`[next dev] ${buf}`));
    proceso.on("error", reject);
    proceso.on("exit", (codigo) => {
      if (!listo) reject(new Error(`next dev terminó antes de arrancar (código ${codigo}).`));
    });
  });
}

// ---------- Elementos interactivos visibles (para que Claude "vea" qué tocar) ----------

type ElementoInteractivo = { idx: number; tag: string; tipo?: string; texto: string; deshabilitado: boolean };

async function listarElementos(page: Page): Promise<ElementoInteractivo[]> {
  // Si el paso anterior disparó una navegación (ej. redirect tras login),
  // el evaluate puede caer justo cuando el contexto de la página vieja ya
  // se destruyó y el nuevo todavía no está listo -- un reintento corto
  // después de esperar a que la navegación termine resuelve esta carrera.
  try {
    return await listarElementosInterno(page);
  } catch (error) {
    if (error instanceof Error && /Execution context was destroyed/.test(error.message)) {
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      return listarElementosInterno(page);
    }
    throw error;
  }
}

async function listarElementosInterno(page: Page): Promise<ElementoInteractivo[]> {
  return page.evaluate(() => {
    const selector = 'a, button, input, textarea, select, [role="button"], [tabindex]:not([tabindex="-1"])';
    const nodos = Array.from(document.querySelectorAll(selector));
    const resultado: { idx: number; tag: string; tipo?: string; texto: string; deshabilitado: boolean }[] = [];
    let idx = 0;
    for (const el of nodos) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      // Solo lo que entra en el viewport actual -- coherente con la captura
      // de pantalla que Claude recibe junto a esta lista.
      if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
      const estilo = getComputedStyle(el as Element);
      if (estilo.visibility === "hidden" || estilo.display === "none" || Number(estilo.opacity) === 0) continue;

      const etiqueta =
        (el as HTMLElement).innerText?.trim().slice(0, 90) ||
        el.getAttribute("aria-label") ||
        el.getAttribute("placeholder") ||
        (el as HTMLInputElement).value ||
        el.getAttribute("title") ||
        "";
      el.setAttribute("data-qa-idx", String(idx));
      resultado.push({
        idx,
        tag: el.tagName.toLowerCase(),
        tipo: el.getAttribute("type") || undefined,
        texto: etiqueta || "(sin texto visible)",
        deshabilitado: (el as HTMLButtonElement).disabled === true || el.getAttribute("aria-disabled") === "true",
      });
      idx++;
      if (idx >= 50) break;
    }
    return resultado;
  });
}

// ---------- Tools que Claude puede llamar ----------

const TOOLS: Anthropic.Tool[] = [
  {
    name: "click",
    description: "Hace click en el elemento con ese índice de la lista actual.",
    input_schema: {
      type: "object",
      properties: { idx: { type: "integer" } },
      required: ["idx"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "fill",
    description: "Escribe texto en el input/textarea con ese índice (no envía el formulario).",
    input_schema: {
      type: "object",
      properties: { idx: { type: "integer" }, texto: { type: "string" } },
      required: ["idx", "texto"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "seleccionar_opcion",
    description: "En un <select> con ese índice, elige la opción cuyo texto visible coincide con `opcion`.",
    input_schema: {
      type: "object",
      properties: { idx: { type: "integer" }, opcion: { type: "string" } },
      required: ["idx", "opcion"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "desplazar",
    description: "Baja o sube un poco la página para ver más elementos.",
    input_schema: {
      type: "object",
      properties: { direccion: { type: "string", enum: ["abajo", "arriba"] } },
      required: ["direccion"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "volver",
    description: "Vuelve a la página anterior (como el botón atrás del navegador).",
    input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
    strict: true,
  },
  {
    name: "esperar",
    description: "Espera unos milisegundos antes del próximo paso (ej. tras subir una foto).",
    input_schema: {
      type: "object",
      properties: { ms: { type: "integer" } },
      required: ["ms"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "reportar_hallazgo",
    description:
      "Deja constancia de algo que parece un error o una falla real: un botón que no hace nada, un mensaje confuso, datos inconsistentes, algo que se ve roto. Después de llamar esto, seguís explorando normalmente.",
    input_schema: {
      type: "object",
      properties: {
        severidad: { type: "string", enum: ["alto", "medio", "bajo"] },
        resumen: { type: "string", description: "Una línea." },
        detalle: { type: "string", description: "Qué hiciste, qué esperabas, qué pasó." },
      },
      required: ["severidad", "resumen", "detalle"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "terminar",
    description: "Termina esta sesión de exploración (ya probaste lo que tenías que probar para este rol).",
    input_schema: {
      type: "object",
      properties: { resumen: { type: "string" } },
      required: ["resumen"],
      additionalProperties: false,
    },
    strict: true,
  },
];

// ---------- Loop del agente para un rol ----------

async function explorarComoRol(browser: Browser, rol: Rol, anthropic: Anthropic) {
  console.log(`\n=== ${rol.toUpperCase()} ===`);
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); // tamaño de celular, igual que el uso real

  const erroresDesdeUltimoPaso: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") erroresDesdeUltimoPaso.push(`[consola] ${msg.text().slice(0, 300)}`);
  });
  page.on("pageerror", (err) => erroresDesdeUltimoPaso.push(`[excepción JS] ${err.message.slice(0, 300)}`));
  page.on("response", (res) => {
    if (res.status() >= 400 && !res.url().includes("favicon")) {
      erroresDesdeUltimoPaso.push(`[red ${res.status()}] ${res.request().method()} ${res.url()}`);
    }
  });
  // Cuando un click abre el selector de archivos nativo (botón de "tomar
  // foto"/"galería" sobre un <input type="file"> oculto), Playwright lo
  // intercepta acá en vez de dejarlo abrir de verdad -- si no, el paso
  // quedaría trabado para siempre esperando un diálogo del sistema
  // operativo que nunca va a aparecer.
  page.on("filechooser", async (fc) => {
    await fc.setFiles(RUTA_FOTO_PRUEBA).catch(() => {});
  });

  // Login real a través de la interfaz (no una cookie fabricada a mano) --
  // es justo el primer tramo que cualquier error de login rompería.
  await page.goto(`http://localhost:${QA_APP_PORT}/login`);
  await page.fill('input[name="clave"]', CLAVES[rol]);
  await page.click('button:has-text("Ingresar al sistema")');
  await page.waitForURL(`**/panel/${rol}`, { timeout: 15000 }).catch(() => {
    hallazgos.push({
      rol,
      tipo: "reportado",
      severidad: "alto",
      resumen: "No se pudo iniciar sesión",
      detalle: `Tras enviar la credencial no se llegó a /panel/${rol}. URL actual: ${page.url()}`,
      url: page.url(),
    });
  });

  const historia: Anthropic.MessageParam[] = [];
  let terminado = false;

  for (let paso = 0; paso < PASOS_MAX && !terminado; paso++) {
    await page.waitForTimeout(400); // deja asentar animaciones/transiciones antes de mirar
    const elementos = await listarElementos(page);
    const captura = await page.screenshot({ type: "jpeg", quality: 55 });
    const erroresDeEstePaso = [...erroresDesdeUltimoPaso];
    erroresDesdeUltimoPaso.length = 0;

    const contenidoUsuario: Anthropic.ContentBlockParam[] = [
      {
        type: "image",
        source: { type: "base64", media_type: "image/jpeg", data: captura.toString("base64") },
      },
      {
        type: "text",
        text:
          `URL actual: ${page.url()}\n` +
          `Paso ${paso + 1} de ${PASOS_MAX}.\n` +
          (erroresDeEstePaso.length
            ? `Errores detectados desde el paso anterior (puede que no sean visibles en pantalla):\n${erroresDeEstePaso.join("\n")}\n`
            : "") +
          `Elementos visibles ahora (usa su índice en tus llamadas a herramientas):\n` +
          elementos
            .map((e) => `${e.idx}: <${e.tag}${e.tipo ? ` type=${e.tipo}` : ""}>${e.deshabilitado ? " [deshabilitado]" : ""} "${e.texto}"`)
            .join("\n"),
      },
    ];
    historia.push({ role: "user", content: contenidoUsuario });

    const respuesta = await anthropic.messages.create({
      model: MODELO,
      max_tokens: 1024,
      system:
        `Estás probando "Agenda Operativa Shimaya", una app de gestión operativa de campo para una cadena de restaurantes en Perú, en un entorno de PRUEBA sin datos reales. ${PERSONAS[rol]}\n\n` +
        "Explorá como lo haría una persona real usando esto por primera vez: curioso, probando botones, leyendo lo que dice la pantalla, sin apurarte. Tu objetivo es encontrar fallas reales -- algo que no responde, un mensaje que no tiene sentido, datos que se contradicen, un error de consola, una pantalla que se ve rota -- no solo completar una tarea. Cuando encuentres algo así, llamá a reportar_hallazgo y seguí explorando. Si todo se ve y funciona bien en lo que probaste, no inventes fallas.\n\n" +
        "Respondé SIEMPRE con exactamente una llamada a una herramienta, nunca con texto solo. No repitas la misma acción si ya no cambia nada en pantalla -- si quedaste atascado, probá otra parte de la app o llamá a terminar.",
      tools: TOOLS,
      tool_choice: { type: "auto" },
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      messages: historia,
    });

    historia.push({ role: "assistant", content: respuesta.content });

    const llamadas = respuesta.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (llamadas.length === 0) {
      // No debería pasar con tool_choice auto + la instrucción de arriba, pero
      // si pasa, lo tratamos como un "esperar" para no trabar el loop.
      historia.push({
        role: "user",
        content: [{ type: "text", text: "Tenés que llamar a una herramienta. Probá de nuevo." }],
      });
      continue;
    }

    // El prompt pide una sola llamada por paso, pero el modelo a veces
    // devuelve más de un bloque tool_use en la misma respuesta -- cada
    // tool_use de este turno necesita su tool_result en el siguiente
    // mensaje o la API rechaza la conversación entera. Se ejecuta solo la
    // primera llamada (la intención real de este diseño) y se responde con
    // un resultado "no ejecutado" para cualquier otra, sin romper el turno.
    const resultados: Anthropic.ToolResultBlockParam[] = [];
    for (const [i, llamada] of llamadas.entries()) {
      let resultadoTexto: string;
      if (i > 0) {
        resultadoTexto = "no ejecutado -- respondé con una sola llamada a herramienta por paso";
      } else {
        try {
          resultadoTexto = await ejecutarAccion(page, llamada.name, llamada.input as any, rol);
        } catch (err: any) {
          resultadoTexto = `error al ejecutar la acción: ${err?.message || err}`;
        }
        if (llamada.name === "terminar") terminado = true;
      }
      resultados.push({ type: "tool_result", tool_use_id: llamada.id, content: resultadoTexto });
    }

    historia.push({ role: "user", content: resultados });
  }

  await page.close();
  console.log(`${rol}: exploración terminada (${hallazgos.filter((h) => h.rol === rol).length} hallazgos).`);
}

async function ejecutarAccion(page: Page, nombre: string, input: any, rol: Rol): Promise<string> {
  const selector = (idx: number) => `[data-qa-idx="${idx}"]`;
  switch (nombre) {
    case "click":
      await page.click(selector(input.idx), { timeout: 5000 });
      await page.waitForTimeout(600);
      return "click hecho";
    case "fill":
      await page.fill(selector(input.idx), input.texto, { timeout: 5000 });
      return "texto escrito";
    case "seleccionar_opcion":
      await page.selectOption(selector(input.idx), { label: input.opcion }, { timeout: 5000 });
      return "opción elegida";
    case "desplazar":
      await page.mouse.wheel(0, input.direccion === "abajo" ? 500 : -500);
      await page.waitForTimeout(300);
      return "desplazado";
    case "volver":
      await page.goBack({ timeout: 5000 }).catch(() => {});
      return "volvió";
    case "esperar":
      await page.waitForTimeout(Math.min(input.ms ?? 1000, 5000));
      return "esperado";
    case "reportar_hallazgo":
      hallazgos.push({ rol, tipo: "reportado", severidad: input.severidad, resumen: input.resumen, detalle: input.detalle, url: page.url() });
      return "hallazgo registrado";
    case "terminar":
      return input.resumen ?? "terminado";
    default:
      return `herramienta desconocida: ${nombre}`;
  }
}

// ---------- Reporte final ----------

function escribirReporte() {
  const carpeta = resolve(process.cwd(), "scripts/agente-qa/reportes");
  mkdirSync(carpeta, { recursive: true });
  const marca = new Date().toISOString().replace(/[:.]/g, "-");
  const ruta = resolve(carpeta, `${marca}.md`);

  const lineas: string[] = [`# Reporte del agente de QA — ${new Date().toLocaleString("es-PE")}`, ""];
  for (const rol of SOLO_ROLES as Rol[]) {
    const propios = hallazgos.filter((h) => h.rol === rol);
    lineas.push(`## ${rol}`, "");
    if (propios.length === 0) {
      lineas.push("Sin hallazgos.", "");
      continue;
    }
    for (const h of propios) {
      lineas.push(`- **[${h.severidad ?? "?"}]** ${h.resumen}`, `  - ${h.detalle}`, `  - URL: ${h.url}`, "");
    }
  }
  writeFileSync(ruta, lineas.join("\n"));
  console.log(`\nReporte escrito en ${ruta}`);
  return ruta;
}

// ---------- Main ----------

async function main() {
  const anthropic = new Anthropic(ANTHROPIC_API_KEY ? { apiKey: ANTHROPIC_API_KEY } : undefined);
  await asegurarFotoPrueba();
  console.log(`Levantando next dev en el puerto ${QA_APP_PORT} (contra la base de prueba)...`);
  const servidor = await levantarServidor();

  const cerrarTodo = () => {
    servidor.kill();
  };
  process.on("exit", cerrarTodo);
  process.on("SIGINT", () => {
    cerrarTodo();
    process.exit(1);
  });

  const browser = await chromium.launch({
    headless: HEADLESS,
    executablePath: process.env.QA_CHROMIUM_EXECUTABLE_PATH || undefined,
  });
  try {
    for (const rol of SOLO_ROLES as Rol[]) {
      await explorarComoRol(browser, rol, anthropic);
    }
  } finally {
    await browser.close();
    cerrarTodo();
  }

  const ruta = escribirReporte();
  console.log(`\nTotal de hallazgos: ${hallazgos.length}`);
  if (hallazgos.length > 0) {
    console.log("Resumen:");
    for (const h of hallazgos) console.log(`  [${h.rol}/${h.severidad ?? "?"}] ${h.resumen}`);
  }
  console.log(`\nVer detalle completo en: ${ruta}`);
}

main().catch((err) => {
  console.error("El agente de QA falló:", err);
  process.exit(1);
});
