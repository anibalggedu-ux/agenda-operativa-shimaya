// Puntaje del checklist de rutina de visita. Aparte de
// app/panel/checklist-visita-actions.ts porque un archivo "use server" solo
// puede exportar funciones async, y esto lo usan también los componentes.

export type TipoItemChecklist = "escala_5" | "si_no" | "opciones" | "texto" | "numero";

export type ItemChecklist = {
  clave: string;
  etiqueta: string;
  tipo: TipoItemChecklist;
  opciones?: string[];
  // Puntaje 0-100 por cada opción posible -- solo para tipo "opciones". Si no
  // está definido, la pregunta es informativa y no cuenta en el puntaje final
  // (ej. "qué se visualiza" en TV no tiene una respuesta "mejor" que otra).
  // Una opción sin puntaje tampoco cuenta (ej. "No hay" dispensador).
  puntajes?: Record<string, number>;
  // Solo para tipo "si_no": qué respuesta vale 100% -- por defecto "si" (la
  // mayoría de preguntas sí/no son "sí es bueno"), pero algo como
  // "¿Contaminación cruzada?" es al revés (no es lo bueno).
  siNoBueno?: "si" | "no";
};

export type AreaChecklist = "cocina" | "salon" | "caja" | "jugueria";

export type SeccionChecklist = {
  clave: string;
  titulo: string;
  // Área a la que pertenece el bloque, para la nota ponderada (ver
  // AREAS_CHECKLIST). Sin área en ningún bloque = plantilla antigua: todas
  // las preguntas pesan igual.
  area?: AreaChecklist;
  items: ItemChecklist[];
};

export type RespuestasChecklist = Record<string, Record<string, string | number | null>>;

export type ClasificacionChecklist = "Excelente" | "Bueno" | "Requiere mejora" | "Acción inmediata";

// Peso de cada área en la nota final (suman 100).
export const AREAS_CHECKLIST: { clave: AreaChecklist; nombre: string; peso: number }[] = [
  { clave: "cocina", nombre: "Cocina", peso: 60 },
  { clave: "salon", nombre: "Salón", peso: 20 },
  { clave: "caja", nombre: "Caja", peso: 10 },
  { clave: "jugueria", nombre: "Juguería", peso: 10 },
];

// Nota 0-100 por área, o null si esa área no tuvo nada puntuable respondido.
export type PuntajesArea = Partial<Record<AreaChecklist, number | null>>;

export function clasificarPorcentaje(porcentaje: number): ClasificacionChecklist {
  if (porcentaje >= 90) return "Excelente";
  if (porcentaje >= 75) return "Bueno";
  if (porcentaje >= 60) return "Requiere mejora";
  return "Acción inmediata";
}

// Puntaje 0-100 de una sola respuesta, o null si el tipo de pregunta no
// puntúa (texto, número, opciones sin puntajes configurados) o si no se
// respondió. Punto único de esta regla -- lo usan tanto el puntaje general
// de un checklist como el promedio por sección en Central Analítica.
export function puntajeItem(it: ItemChecklist, valor: string | number | null | undefined): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  if (it.tipo === "escala_5" && typeof valor === "number") return (valor / 5) * 100;
  if (it.tipo === "si_no") {
    const esSi = valor === "true";
    const bueno = it.siNoBueno === "no" ? !esSi : esSi;
    return bueno ? 100 : 0;
  }
  if (it.tipo === "opciones" && it.puntajes && typeof valor === "string") {
    const p = it.puntajes[valor];
    return p !== undefined ? p : null;
  }
  return null;
}

// Promedio de las preguntas puntuables respondidas de un bloque, o null si
// no tiene ninguna. Preguntas sin responder no cuentan (no se penaliza dejar
// algo en blanco, ej. si la tienda no tiene mueble aéreo).
export function puntajeSeccion(s: SeccionChecklist, respuestas: RespuestasChecklist | null | undefined): number | null {
  let suma = 0;
  let cantidad = 0;
  s.items.forEach((it) => {
    const p = puntajeItem(it, respuestas?.[s.clave]?.[it.clave]);
    if (p !== null) {
      suma += p;
      cantidad++;
    }
  });
  return cantidad === 0 ? null : suma / cantidad;
}

function promedio(valores: number[]): number | null {
  return valores.length === 0 ? null : valores.reduce((a, b) => a + b, 0) / valores.length;
}

// Nota final. Con áreas: dentro de cada área cada bloque pesa igual (así las
// 5 mesas refrigeradas no se comen la nota de cocina) y luego se ponderan
// las áreas con AREAS_CHECKLIST. Un área sin nada respondido no cuenta y su
// peso se reparte entre las demás (ej. tienda sin juguería).
export function calcularPuntaje(
  secciones: SeccionChecklist[],
  respuestas: RespuestasChecklist
): { porcentaje: number | null; clasificacion: ClasificacionChecklist | null; areas: PuntajesArea | null } {
  const conAreas = secciones.some((s) => s.area);

  if (!conAreas) {
    let suma = 0;
    let cantidad = 0;
    secciones.forEach((s) =>
      s.items.forEach((it) => {
        const p = puntajeItem(it, respuestas[s.clave]?.[it.clave]);
        if (p !== null) {
          suma += p;
          cantidad++;
        }
      })
    );
    if (cantidad === 0) return { porcentaje: null, clasificacion: null, areas: null };
    const porcentaje = Math.round(suma / cantidad);
    return { porcentaje, clasificacion: clasificarPorcentaje(porcentaje), areas: null };
  }

  const areas: PuntajesArea = {};
  let sumaPonderada = 0;
  let pesoUsado = 0;
  AREAS_CHECKLIST.forEach((a) => {
    const notas = secciones
      .filter((s) => s.area === a.clave)
      .map((s) => puntajeSeccion(s, respuestas))
      .filter((n): n is number => n !== null);
    const nota = promedio(notas);
    areas[a.clave] = nota === null ? null : Math.round(nota);
    if (nota !== null) {
      sumaPonderada += nota * a.peso;
      pesoUsado += a.peso;
    }
  });

  if (pesoUsado === 0) return { porcentaje: null, clasificacion: null, areas };
  const porcentaje = Math.round(sumaPonderada / pesoUsado);
  return { porcentaje, clasificacion: clasificarPorcentaje(porcentaje), areas };
}

// "Cocina 80% · Salón 90% · Caja 100%" (omite las áreas sin nota), o null.
export function textoPuntajesArea(areas: PuntajesArea | null | undefined): string | null {
  if (!areas) return null;
  const partes = AREAS_CHECKLIST.filter((a) => areas[a.clave] !== null && areas[a.clave] !== undefined).map(
    (a) => `${a.nombre} ${areas[a.clave]}%`
  );
  return partes.length === 0 ? null : partes.join(" · ");
}
