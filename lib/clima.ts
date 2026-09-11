// Clima vía Open-Meteo (gratuito, sin API key). Cachea con el fetch cache de
// Next.js para no golpear la API en cada render.

export type ClimaDia = {
  fecha: string;
  codigo: number;
  tempMax: number;
  tempMin: number;
  precipitacion: number;
  vientoMax: number;
};

export type ClimaActual = {
  temp: number;
  sensacion: number;
  codigo: number;
};

export type ResumenClimaDia = {
  icono: string;
  descripcion: string;
  tempMax: number;
  tempMin: number;
  riesgo: boolean;
  avisoTexto: string | null;
};

export type ResumenClimaActual = {
  icono: string;
  descripcion: string;
  temp: number;
  sensacion: number;
};

const CODIGOS_WMO: Record<number, { icono: string; descripcion: string }> = {
  0: { icono: "☀️", descripcion: "Despejado" },
  1: { icono: "🌤️", descripcion: "Mayormente despejado" },
  2: { icono: "⛅", descripcion: "Parcialmente nublado" },
  3: { icono: "☁️", descripcion: "Nublado" },
  45: { icono: "🌫️", descripcion: "Neblina" },
  48: { icono: "🌫️", descripcion: "Neblina con escarcha" },
  51: { icono: "🌦️", descripcion: "Llovizna ligera" },
  53: { icono: "🌦️", descripcion: "Llovizna moderada" },
  55: { icono: "🌧️", descripcion: "Llovizna intensa" },
  56: { icono: "🌧️", descripcion: "Llovizna helada" },
  57: { icono: "🌧️", descripcion: "Llovizna helada intensa" },
  61: { icono: "🌧️", descripcion: "Lluvia ligera" },
  63: { icono: "🌧️", descripcion: "Lluvia moderada" },
  65: { icono: "🌧️", descripcion: "Lluvia intensa" },
  71: { icono: "🌨️", descripcion: "Nevada ligera" },
  73: { icono: "🌨️", descripcion: "Nevada moderada" },
  75: { icono: "❄️", descripcion: "Nevada intensa" },
  80: { icono: "🌦️", descripcion: "Chubascos ligeros" },
  81: { icono: "🌧️", descripcion: "Chubascos moderados" },
  82: { icono: "⛈️", descripcion: "Chubascos intensos" },
  95: { icono: "⛈️", descripcion: "Tormenta eléctrica" },
  96: { icono: "⛈️", descripcion: "Tormenta con granizo" },
  99: { icono: "⛈️", descripcion: "Tormenta severa con granizo" },
};

function describirCodigo(codigo: number) {
  return CODIGOS_WMO[codigo] ?? { icono: "🌡️", descripcion: "Sin datos" };
}

export async function obtenerClimaActual(lat: number, lon: number): Promise<ClimaActual | null> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,weathercode&timezone=auto`;
    const res = await fetch(url, { next: { revalidate: 900 } });
    if (!res.ok) return null;
    const json = await res.json();
    const c = json.current;
    if (!c || typeof c.temperature_2m !== "number") return null;
    return {
      temp: Math.round(c.temperature_2m),
      sensacion: Math.round(c.apparent_temperature),
      codigo: c.weathercode,
    };
  } catch {
    return null;
  }
}

// Trae el pronóstico diario de una tienda para un rango amplio (unos días
// atrás para reportes recién editables, y hasta 16 días adelante, el máximo
// que ofrece Open-Meteo) en una sola llamada, y se indexa por fecha.
export async function obtenerClimaDiario(lat: number, lon: number): Promise<Map<string, ClimaDia>> {
  const mapa = new Map<string, ClimaDia>();
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max&timezone=auto&past_days=3&forecast_days=16`;
    const res = await fetch(url, { next: { revalidate: 1800 } });
    if (!res.ok) return mapa;
    const json = await res.json();
    const d = json.daily;
    if (!d?.time) return mapa;
    (d.time as string[]).forEach((fecha, i) => {
      mapa.set(fecha, {
        fecha,
        codigo: d.weathercode[i],
        tempMax: Math.round(d.temperature_2m_max[i]),
        tempMin: Math.round(d.temperature_2m_min[i]),
        precipitacion: d.precipitation_sum[i] ?? 0,
        vientoMax: Math.round(d.windspeed_10m_max[i] ?? 0),
      });
    });
    return mapa;
  } catch {
    return mapa;
  }
}

export function resumirClimaDia(dia: ClimaDia): ResumenClimaDia {
  const { icono, descripcion } = describirCodigo(dia.codigo);
  const avisos: string[] = [];
  if (dia.precipitacion >= 5) avisos.push("lluvia");
  if (dia.vientoMax >= 30) avisos.push("viento fuerte");
  if (dia.tempMax >= 32) avisos.push("calor intenso");
  if (dia.tempMin <= 12) avisos.push("frío");
  return {
    icono,
    descripcion,
    tempMax: dia.tempMax,
    tempMin: dia.tempMin,
    riesgo: avisos.length > 0,
    avisoTexto: avisos.length > 0 ? `Alerta: ${avisos.join(" y ")}` : null,
  };
}

export function resumirClimaActual(actual: ClimaActual): ResumenClimaActual {
  const { icono, descripcion } = describirCodigo(actual.codigo);
  return { icono, descripcion, temp: actual.temp, sensacion: actual.sensacion };
}
