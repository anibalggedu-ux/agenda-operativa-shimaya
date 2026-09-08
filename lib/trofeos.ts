export type CategoriaMedalla = "bronce" | "plata" | "oro" | "estrella";

export type ConteoMedallas = Record<CategoriaMedalla, number>;

type UmbralMedalla = {
  id: CategoriaMedalla;
  puntos: number;
  emoji: string;
  etiqueta: string;
};

// Cada categoría se cuenta de forma independiente sobre el total de puntos
// acumulados: cada vez que el total cruza un múltiplo del umbral de esa
// categoría se suma una medalla más de ese tipo. No son niveles excluyentes
// (no "sube" de bronce a plata) — un usuario puede tener, por ejemplo,
// 6 bronces, 2 platas y 1 oro al mismo tiempo, y ninguna medalla se pierde.
export const UMBRALES_MEDALLAS: UmbralMedalla[] = [
  { id: "bronce", puntos: 250, emoji: "🥉", etiqueta: "Bronce" },
  { id: "plata", puntos: 600, emoji: "🥈", etiqueta: "Plata" },
  { id: "oro", puntos: 1200, emoji: "🥇", etiqueta: "Oro" },
  { id: "estrella", puntos: 2000, emoji: "🌟", etiqueta: "Estrella" },
];

export function calcularConteoMedallas(puntos: number): ConteoMedallas {
  const conteo = {} as ConteoMedallas;
  UMBRALES_MEDALLAS.forEach((u) => {
    conteo[u.id] = Math.floor(puntos / u.puntos);
  });
  return conteo;
}

export function totalMedallas(conteo: ConteoMedallas): number {
  return UMBRALES_MEDALLAS.reduce((suma, u) => suma + conteo[u.id], 0);
}

// Progreso hacia la próxima medalla de bronce — el umbral más pequeño, que
// marca el ritmo de avance más frecuente y por eso sirve de barra general.
export function progresoProximoBronce(puntos: number): { actual: number; faltan: number } {
  const umbralBronce = UMBRALES_MEDALLAS[0].puntos;
  const actual = puntos % umbralBronce;
  const faltan = actual === 0 ? umbralBronce : umbralBronce - actual;
  return { actual, faltan };
}
