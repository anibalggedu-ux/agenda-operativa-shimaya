// Alta de usuarios y restablecimiento de contraseña. NO hay registro público: esta es la única vía.
//
//   npm run user:create -- --local  --email ana@shimaya.pe --name "Ana Pérez" --role validador
//   npm run user:create -- --remote --email jefe@shimaya.pe --name "Jefe" --role moderador
//   npm run user:create -- --remote --email ana@shimaya.pe --reset-password
//
// La contraseña se pide por teclado (sin eco) o en la variable SHIMAYA_NEW_PASSWORD; nunca por
// argumento (quedaría en el historial del shell). Solo se guarda su hash PBKDF2.
import { createInterface } from "node:readline";
import { hashPassword } from "../src/worker/password";
import { type Target, q, querySql, runSql } from "./wrangler";

const ROLES = ["validador", "moderador", "analista"];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

function fail(msg: string): never {
  console.error(`Error: ${msg}`);
  process.exit(1);
}

function ask(prompt: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      const w = (rl as unknown as { _writeToOutput: (s: string) => void });
      w._writeToOutput = (s: string) => {
        if (s.includes(prompt)) process.stdout.write(s);
      };
    }
    rl.question(prompt, (a) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(a);
    });
  });
}

const target: Target | undefined = flag("remote") ? "--remote" : flag("local") ? "--local" : undefined;
if (!target) fail("indica explícitamente --local o --remote (no hay valor por defecto a propósito).");

const email = (arg("email") ?? "").trim().toLowerCase();
if (!/^[^\s@'"]+@[^\s@'"]+\.[^\s@'"]{2,}$/.test(email)) fail("--email inválido.");

const reset = flag("reset-password");
const name = (arg("name") ?? "").replace(/[\u0000-\u001f]/g, " ").trim();
const role = arg("role") ?? "";
if (!reset) {
  if (name.length < 2 || name.length > 80) fail("--name debe tener entre 2 y 80 caracteres.");
  if (!ROLES.includes(role)) fail(`--role debe ser uno de: ${ROLES.join(", ")}.`);
}

let password = process.env.SHIMAYA_NEW_PASSWORD ?? "";
if (!password) {
  password = await ask("Contraseña (mín. 12 caracteres): ", true);
  if (password !== (await ask("Repite la contraseña: ", true))) fail("las contraseñas no coinciden.");
}
if (password.length < 12) fail("la contraseña debe tener al menos 12 caracteres.");
if (password.toLowerCase().includes(email.split("@")[0]!)) fail("la contraseña no debe contener tu correo.");

if (target === "--remote" && !flag("yes")) {
  const a = await ask(`Vas a ${reset ? "RESTABLECER la contraseña de" : `CREAR (${role}) a`} ${email} en la base de PRODUCCIÓN. ¿Continuar? (escribe "si"): `);
  if (a.trim().toLowerCase() !== "si") fail("cancelado.");
}

const hash = await hashPassword(password);
const exists = querySql(target, `SELECT id FROM users WHERE email = ${q(email)}`).length > 0;

if (reset) {
  if (!exists) fail("ese correo no existe.");
  // También se cierran todas sus sesiones abiertas.
  runSql(
    target,
    `UPDATE users SET password_hash = ${q(hash)}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE email = ${q(email)};
     DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE email = ${q(email)});`,
  );
  console.log(`Contraseña restablecida para ${email}. Sus sesiones abiertas se cerraron.`);
} else {
  if (exists) fail("ese correo ya existe. Para cambiar la contraseña usa --reset-password.");
  runSql(
    target,
    `INSERT INTO users (id, email, display_name, role, password_hash) VALUES (${q(crypto.randomUUID())}, ${q(email)}, ${q(name)}, ${q(role)}, ${q(hash)});`,
  );
  console.log(`Usuario creado: ${email} (${role}).`);
}
