export type Medalla = {
  id: "bronce" | "plata" | "oro" | "estrella";
  puntos: number;
  emoji: string;
  etiqueta: string;
};

// Umbrales acumulativos definidos por el usuario — los puntos nunca se
// borran, así que una medalla obtenida no se puede perder.
export const UMBRALES_MEDALLAS: Medalla[] = [
  { id: "estrella", puntos: 2000, emoji: "🌟", etiqueta: "Estrella" },
  { id: "oro", puntos: 1200, emoji: "🥇", etiqueta: "Oro" },
  { id: "plata", puntos: 600, emoji: "🥈", etiqueta: "Plata" },
  { id: "bronce", puntos: 250, emoji: "🥉", etiqueta: "Bronce" },
];

export function calcularMedalla(puntos: number): Medalla | null {
  return UMBRALES_MEDALLAS.find((m) => puntos >= m.puntos) ?? null;
}

export function siguienteMedalla(puntos: number): Medalla | null {
  const ascendente = [...UMBRALES_MEDALLAS].reverse();
  return ascendente.find((m) => puntos < m.puntos) ?? null;
}
