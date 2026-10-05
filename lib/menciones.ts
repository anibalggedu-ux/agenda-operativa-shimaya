// Detecta y resuelve @menciones en el texto libre de una historia (o
// cualquier otro texto que en el futuro lo necesite) -- compartido entre
// cliente (autocompletado al escribir) y servidor (quién recibe el push al
// publicar), para no duplicar la lógica de qué cuenta como una coincidencia.

export function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

// Un token de mención es @ seguido de letras/números/guion bajo, sin
// espacios -- igual que Instagram/WhatsApp, corta en el primer espacio o
// signo de puntuación.
const PATRON_MENCION = /@([a-zA-ZÀ-ÿ0-9_]+)/g;

export function extraerTokensMencion(texto: string): string[] {
  const tokens: string[] = [];
  let match: RegExpExecArray | null;
  PATRON_MENCION.lastIndex = 0;
  while ((match = PATRON_MENCION.exec(texto)) !== null) {
    tokens.push(normalizarTexto(match[1]));
  }
  return tokens;
}

export type UsuarioMencionable = { id: string; nombre: string };

// Compara cada @token contra el primer nombre de cada usuario (caso típico:
// "@antony" -> "Antony Montalban") y, si no coincide, contra el nombre
// completo pegado sin espacios (caso "@antonymontalban") -- evita que
// alguien quede sin encontrar solo por no separar el apellido.
export function resolverMenciones(texto: string, usuarios: UsuarioMencionable[]): UsuarioMencionable[] {
  const tokens = new Set(extraerTokensMencion(texto));
  if (tokens.size === 0) return [];

  const encontrados = new Map<string, UsuarioMencionable>();
  usuarios.forEach((u) => {
    const partes = u.nombre.trim().split(/\s+/).map(normalizarTexto);
    const primerNombre = partes[0] ?? "";
    const nombrePegado = partes.join("");
    if (tokens.has(primerNombre) || tokens.has(nombrePegado)) {
      encontrados.set(u.id, u);
    }
  });
  return Array.from(encontrados.values());
}
