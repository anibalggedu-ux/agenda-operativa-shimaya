export const AREAS_RUTA = [
  "Caja",
  "Cocina",
  "Salón",
  "Supervisión General",
  "Auditoría",
  "Administración",
] as const;

export const MAX_TIENDAS_PERMANENTES = 3;

export const MAX_DIAS_DESCANSO = 2;

// Misma hora límite de puntualidad usada en Central Analítica y en el
// sistema de puntos — un ingreso después de esta hora se marca como tarde.
export const HORA_LIMITE_TARDANZA: Record<string, string> = {
  capacitador: "11:00:00",
  supervisor: "12:00:00",
};
