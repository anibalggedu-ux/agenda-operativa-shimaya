import jsPDF from "jspdf";
import { formatearFechaLegible, formatearHora, diaSemanaPeru, sumarDias } from "./fechas";
import { formatearMinutos } from "./distancia";

const AMARILLO: [number, number, number] = [234, 179, 8];
const FONDO_OSCURO: [number, number, number] = [15, 17, 26];
const ANCHO_UTIL = 180;

// Colores de medalla — los emoji 🥉🥈🥇🌟 no se pueden dibujar con las
// fuentes estándar de jsPDF (salen como símbolos rotos), así que las
// medallas se dibujan como formas vectoriales tipo medalla olímpica: cinta
// arriba + disco con borde, relieve de dos tonos y un brillo sutil.
const COLOR_CINTA: [number, number, number] = [178, 30, 46];
const COLOR_CINTA_SOMBRA: [number, number, number] = [120, 18, 30];

const MEDALLA_BRONCE = { claro: [205, 139, 82] as [number, number, number], oscuro: [130, 82, 40] as [number, number, number] };
const MEDALLA_PLATA = { claro: [205, 210, 217] as [number, number, number], oscuro: [140, 145, 153] as [number, number, number] };
const MEDALLA_ORO = { claro: [235, 195, 80] as [number, number, number], oscuro: [175, 132, 32] as [number, number, number] };
const COLOR_ESTRELLA: [number, number, number] = [250, 204, 21];
const COLOR_ESTRELLA_BORDE: [number, number, number] = [180, 130, 10];

function dibujarCintaMedalla(doc: jsPDF, cx: number, cy: number, radio: number) {
  const mitadBase = radio * 0.62;
  const alto = radio * 1.3;
  const puntaY = cy - radio * 0.15;

  doc.setDrawColor(...COLOR_CINTA_SOMBRA);
  doc.setFillColor(...COLOR_CINTA);
  doc.triangle(cx - mitadBase, cy - radio - alto, cx - mitadBase * 0.25, cy - radio - alto, cx, puntaY, "FD");
  doc.triangle(cx + mitadBase, cy - radio - alto, cx + mitadBase * 0.25, cy - radio - alto, cx, puntaY, "FD");
}

function dibujarDiscoMedalla(
  doc: jsPDF,
  cx: number,
  cy: number,
  radio: number,
  colores: { claro: [number, number, number]; oscuro: [number, number, number] }
) {
  // Aro exterior (borde) en el tono oscuro, disco interior en el tono claro
  // — da la sensación de relieve metálico en vez de un círculo plano.
  doc.setDrawColor(...colores.oscuro);
  doc.setFillColor(...colores.oscuro);
  doc.circle(cx, cy, radio, "FD");
  doc.setFillColor(...colores.claro);
  doc.circle(cx, cy, radio * 0.74, "F");

  const brillo = (doc as any).GState ? new (doc as any).GState({ opacity: 0.6 }) : null;
  if (brillo) doc.setGState(brillo);
  doc.setFillColor(255, 255, 255);
  doc.ellipse(cx - radio * 0.3, cy - radio * 0.35, radio * 0.3, radio * 0.16, "F");
  if (brillo) doc.setGState(new (doc as any).GState({ opacity: 1 }));
}

function dibujarMedalla(
  doc: jsPDF,
  cx: number,
  cy: number,
  radio: number,
  colores: { claro: [number, number, number]; oscuro: [number, number, number] }
) {
  dibujarCintaMedalla(doc, cx, cy, radio);
  dibujarDiscoMedalla(doc, cx, cy, radio, colores);
}

function dibujarEstrella(doc: jsPDF, cx: number, cy: number, radioExt: number) {
  const radioInt = radioExt * 0.42;
  const puntos: [number, number][] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? radioExt : radioInt;
    const angulo = (Math.PI / 5) * i - Math.PI / 2;
    puntos.push([cx + r * Math.cos(angulo), cy + r * Math.sin(angulo)]);
  }
  const segmentos = puntos.slice(1).map((p, i) => [p[0] - puntos[i][0], p[1] - puntos[i][1]]);
  segmentos.push([
    puntos[0][0] - puntos[puntos.length - 1][0],
    puntos[0][1] - puntos[puntos.length - 1][1],
  ]);
  doc.setFillColor(...COLOR_ESTRELLA);
  doc.setDrawColor(...COLOR_ESTRELLA_BORDE);
  doc.lines(segmentos, puntos[0][0], puntos[0][1], [1, 1], "FD", true);
}

// Dibuja "Vitrina de trofeos: N pts" y, debajo, las medallas (bronce, plata,
// oro + la estrella) con su cantidad — devuelve el nuevo cursor Y.
function dibujarVitrinaTrofeos(
  doc: jsPDF,
  x: number,
  y: number,
  puntos: number,
  medallas: Record<"bronce" | "plata" | "oro" | "estrella", number>
): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Vitrina de trofeos:", x, y);
  doc.setFont("helvetica", "normal");
  doc.text(`${puntos} pts`, x + 38, y);

  const radio = 3.1;
  const centroY = y + 14;
  const items: { tipo: "medalla" | "estrella"; colores?: typeof MEDALLA_ORO; cantidad: number }[] = [
    { tipo: "medalla", colores: MEDALLA_BRONCE, cantidad: medallas.bronce },
    { tipo: "medalla", colores: MEDALLA_PLATA, cantidad: medallas.plata },
    { tipo: "medalla", colores: MEDALLA_ORO, cantidad: medallas.oro },
    { tipo: "estrella", cantidad: medallas.estrella },
  ];

  let cx = x + radio + 1;
  items.forEach((item) => {
    if (item.tipo === "estrella") {
      dibujarEstrella(doc, cx, centroY, radio + 0.6);
    } else if (item.colores) {
      dibujarMedalla(doc, cx, centroY, radio, item.colores);
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(0, 0, 0);
    doc.text(`x${item.cantidad}`, cx + radio + 3, centroY + 1);
    cx += 34;
  });

  return centroY + radio + 6;
}

export type KilometrosPorTienda = { tiendaNombre: string; km: number; minutos: number; visitas: number };

// Dibuja el resumen de kilómetros recorridos (total + desglose por trayecto,
// útil para calcular reembolsos de movilidad) — devuelve el nuevo cursor Y.
// Si no hay nada que calcular (sin dirección cargada), lo indica sin
// interrumpir el resto del PDF.
function dibujarKilometros(
  doc: jsPDF,
  y: number,
  totalKm: number,
  totalMinutos: number,
  porTienda: KilometrosPorTienda[]
): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Kilómetros recorridos:", 14, y);
  doc.setFont("helvetica", "normal");
  doc.text(
    totalKm > 0 ? `${totalKm} km  (~ ${formatearMinutos(totalMinutos)} manejando)` : "Sin datos suficientes",
    62,
    y
  );
  y += 7;

  if (porTienda.length > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    porTienda.forEach((t) => {
      const texto = `${t.tiendaNombre} — ${t.km} km · ${formatearMinutos(t.minutos)} · ${t.visitas} visita(s)`;
      const lineas = doc.splitTextToSize(texto, ANCHO_UTIL - 8);
      if (y + lineas.length * 5 > ALTO_PAGINA) {
        doc.addPage();
        y = 20;
      }
      doc.text(lineas, 18, y);
      y += lineas.length * 5;
    });
    y += 3;
  }

  return y;
}

export type AsignacionEspecialPdf = { tipo: string; fechaInicio: string; fechaFin: string; motivo: string | null };

// Dibuja racha de puntualidad, % de puntualidad del periodo, cuántas
// auto-asignaciones hizo, y permisos/vacaciones vigentes en el rango —
// devuelve el nuevo cursor Y. "marcaciones" ya viene cargado para la lista
// de abajo, así que el % de puntualidad se calcula de ahí sin otra consulta.
function dibujarResumenDesempeno(
  doc: jsPDF,
  y: number,
  rachaActual: number,
  marcaciones: { horaIngreso: string | null; tarde: boolean }[],
  autoasignaciones: number,
  asignacionesEspeciales: AsignacionEspecialPdf[]
): number {
  const totalMarcaciones = marcaciones.filter((m) => m.horaIngreso).length;
  const tardanzas = marcaciones.filter((m) => m.tarde).length;
  const puntuales = totalMarcaciones - tardanzas;
  const pct = totalMarcaciones > 0 ? Math.round((puntuales / totalMarcaciones) * 100) : null;

  y = campo(
    doc,
    "Racha de puntualidad:",
    rachaActual > 0 ? `${rachaActual} día(s) seguidos` : "Sin racha activa",
    y,
    75
  );
  y = campo(
    doc,
    "Puntualidad del periodo:",
    pct === null ? "Sin marcaciones en el rango" : `${puntuales} de ${totalMarcaciones} a tiempo (${pct}%)`,
    y,
    75
  );
  y = campo(
    doc,
    "Auto-asignaciones:",
    autoasignaciones === 0 ? "Ninguna en el rango" : `${autoasignaciones} vez(ces) — asignación de última hora`,
    y,
    75
  );

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Permisos / vacaciones vigentes en el rango:", 14, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  if (asignacionesEspeciales.length === 0) {
    doc.text("Ninguno.", 14, y);
    y += 6;
  } else {
    asignacionesEspeciales.forEach((a) => {
      const texto =
        `${a.tipo}: ${formatearFechaLegible(a.fechaInicio)} - ${formatearFechaLegible(a.fechaFin)}` +
        (a.motivo ? " — " + a.motivo : "");
      const lineas = doc.splitTextToSize(texto, ANCHO_UTIL - 4);
      if (y + lineas.length * 5 > ALTO_PAGINA) {
        doc.addPage();
        y = 20;
      }
      doc.text(lineas, 14, y);
      y += lineas.length * 5;
    });
    y += 2;
  }

  return y;
}

export type MarcacionParaPdf = {
  fecha: string;
  horaIngreso: string | null;
  horaSalida: string | null;
  tarde: boolean;
};

// Dibuja la lista de marcaciones de entrada/salida, resaltando en rojo el
// día si llegó tarde -- usado tanto en el propio historial (self-service)
// como en el historial de un colaborador visto por el coordinador. Cada uno
// mantiene su propio título y espaciado de cierre, que ya eran ligeramente
// distintos antes de compartir esta función.
function dibujarMarcaciones(
  doc: jsPDF,
  y: number,
  titulo: string,
  marcaciones: MarcacionParaPdf[],
  margenVacio: number,
  margenFinal: number
): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(titulo, 14, y);
  y += 7;

  if (marcaciones.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.text("Sin marcaciones en este rango.", 14, y);
    return y + margenVacio;
  }

  marcaciones.forEach((m) => {
    if (y + 6 > ALTO_PAGINA) {
      doc.addPage();
      y = 20;
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    if (m.tarde) doc.setTextColor(...ROJO_TARDANZA);
    const texto =
      formatearFechaLegible(m.fecha) +
      " — Ingreso: " +
      (m.horaIngreso ? formatearHora(m.horaIngreso) : "—") +
      (m.tarde ? " (TARDE)" : "") +
      "  ·  Salida: " +
      (m.horaSalida ? formatearHora(m.horaSalida) : "—");
    doc.text(texto, 14, y);
    doc.setTextColor(0, 0, 0);
    y += 5.5;
  });

  return y + margenFinal;
}

// Dibuja el bloque "Descansó estos días en el rango" a partir de una lista
// de fechas ya calculada -- generarPdfHistorial la calcula inline (a partir
// de desde/hasta) y generarPdfHistorialPersona la recibe ya calculada desde
// la acción que junta los datos, pero el dibujo es el mismo en ambos casos.
function dibujarDiasDescansoEnRango(doc: jsPDF, y: number, fechasDescanso: string[]): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Descansó estos días en el rango:", 14, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const textoFechas =
    fechasDescanso.length === 0
      ? "Ninguno dentro de este rango."
      : fechasDescanso.map((f) => formatearFechaLegible(f)).join("  ·  ");
  const lineasFechas = doc.splitTextToSize(textoFechas, ANCHO_UTIL);
  doc.text(lineasFechas, 14, y);
  return y + lineasFechas.length * 5 + 4;
}

// Versión ya recortada en círculo del logo (PNG con transparencia real en
// las esquinas) — el recorte por software dentro del PDF con doc.clip() no
// se veía confiable entre visores de PDF, así que se usa un archivo aparte
// pre-recortado (ver public/logo-shimaya-circulo.png) en vez de la foto
// cuadrada original.
let logoBase64Cache: string | null = null;

async function obtenerLogoBase64(): Promise<string | null> {
  if (logoBase64Cache) return logoBase64Cache;
  try {
    const respuesta = await fetch("/logo-shimaya-circulo.png");
    const blob = await respuesta.blob();
    logoBase64Cache = await new Promise<string>((resolve, reject) => {
      const lector = new FileReader();
      lector.onloadend = () => resolve(lector.result as string);
      lector.onerror = reject;
      lector.readAsDataURL(blob);
    });
    return logoBase64Cache;
  } catch {
    return null;
  }
}

async function dibujarEncabezado(doc: jsPDF, subtitulo: string) {
  doc.setFillColor(...FONDO_OSCURO);
  doc.rect(0, 0, 210, 28, "F");

  const logo = await obtenerLogoBase64();
  if (logo) {
    try {
      doc.addImage(logo, "PNG", 180, 5, 18, 18);
    } catch {
      // Si por algún motivo el logo no carga, el PDF se genera igual sin él.
    }
  }

  doc.setTextColor(...AMARILLO);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("AGENDA OPERATIVA SHIMAYA", 14, 13);

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(subtitulo, 14, 21);

  doc.setTextColor(0, 0, 0);
}

// La columna de valor se alinea a 48mm por defecto (se ve prolijo con
// labels cortos), pero si el label es más ancho que eso el texto se corre
// para no pisarlo — antes era un número fijo ajustado caso por caso, lo que
// dejaba pasar labels largos nuevos sin el ajuste.
function campo(doc: jsPDF, etiqueta: string, valor: string, y: number, valorXManual?: number): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(etiqueta, 14, y);
  const anchoEtiqueta = doc.getTextWidth(etiqueta);
  const valorX = valorXManual ?? Math.max(48, 14 + anchoEtiqueta + 4);
  doc.setFont("helvetica", "normal");
  doc.text(valor, valorX, y);
  return y + 7;
}

export type DatosReporteIndividual = {
  supervisorNombre: string;
  tiendaNombre: string;
  fecha: string;
  area: string | null;
  enfoque: string | null;
  observacion: string;
  actividad: string;
};

export async function generarPdfReporteIndividual(datos: DatosReporteIndividual) {
  const doc = new jsPDF();
  await dibujarEncabezado(doc, "Reporte de visita — Supervisor");

  let y = 40;
  y = campo(doc, "Supervisor:", datos.supervisorNombre, y);
  y = campo(doc, "Tienda:", datos.tiendaNombre, y);
  y = campo(doc, "Fecha:", formatearFechaLegible(datos.fecha), y);
  if (datos.area) {
    const areaTexto = datos.enfoque ? datos.area + " · " + datos.enfoque : datos.area;
    y = campo(doc, "Área / enfoque:", areaTexto, y);
  }

  y += 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Actividad realizada:", 14, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  const lineasActividad = doc.splitTextToSize(datos.actividad || "—", ANCHO_UTIL);
  doc.text(lineasActividad, 14, y);
  y += lineasActividad.length * 5.5 + 8;

  doc.setFont("helvetica", "bold");
  doc.text("Observación:", 14, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  const lineasObservacion = doc.splitTextToSize(datos.observacion, ANCHO_UTIL);
  doc.text(lineasObservacion, 14, y);

  const nombreArchivo =
    "reporte_" +
    datos.tiendaNombre.replace(/\s+/g, "_") +
    "_" +
    datos.fecha +
    ".pdf";
  doc.save(nombreArchivo);
}

export type ReporteHistorialItem = {
  fecha: string;
  tiendaNombre: string;
  observacion: string;
  actividad: string | null;
};

export type MarcacionHistorial = {
  fecha: string;
  horaIngreso: string | null;
  horaSalida: string | null;
  tarde: boolean;
};

const ROJO_TARDANZA: [number, number, number] = [220, 38, 38];

export type DatosHistorialPropio = {
  nombre: string;
  rol: string;
  desde: string;
  hasta: string;
  reportes: ReporteHistorialItem[];
  marcaciones: MarcacionHistorial[];
  // Se pasa vacío para capacitadores, que no reciben tienda permanente.
  tiendasPermanentes: string[];
  diasDescanso: string[];
  puntos: number;
  medallas: Record<"bronce" | "plata" | "oro" | "estrella", number>;
  totalKm: number;
  totalMinutos: number;
  kmPorTienda: KilometrosPorTienda[];
  rachaActual: number;
  autoasignaciones: number;
  asignacionesEspeciales: AsignacionEspecialPdf[];
};

export async function generarPdfHistorial(
  datos: DatosHistorialPropio,
  modo: "descargar" | "vista_previa" = "descargar"
): Promise<string | void> {
  const {
    nombre,
    rol,
    desde,
    hasta,
    reportes,
    marcaciones,
    tiendasPermanentes,
    diasDescanso,
    puntos,
    medallas,
    totalKm,
    totalMinutos,
    kmPorTienda,
    rachaActual,
    autoasignaciones,
    asignacionesEspeciales,
  } = datos;
  const doc = new jsPDF();
  const etiquetaRol = rol === "supervisor" ? "Supervisor" : rol === "capacitador" ? "Capacitador" : rol;
  await dibujarEncabezado(doc, "Historial de reportes — " + etiquetaRol);

  const ALTO_PAGINA = 280;

  let y = 40;
  y = campo(doc, etiquetaRol + ":", nombre, y);
  y = campo(
    doc,
    "Rango:",
    formatearFechaLegible(desde) + "  -  " + formatearFechaLegible(hasta),
    y
  );
  y = dibujarVitrinaTrofeos(doc, 14, y, puntos, medallas);
  if (rol === "supervisor") {
    y = campo(
      doc,
      "Tienda(s) fija(s):",
      tiendasPermanentes.length === 0 ? "Sin asignar" : tiendasPermanentes.join(", "),
      y
    );
  }
  y = campo(
    doc,
    "Descanso semanal:",
    diasDescanso.length === 0 ? "Sin asignar" : diasDescanso.join(" y "),
    y
  );

  if (diasDescanso.length > 0) {
    const fechasDescanso: string[] = [];
    let cursor = desde;
    while (cursor <= hasta) {
      if (diasDescanso.includes(diaSemanaPeru(cursor))) fechasDescanso.push(cursor);
      cursor = sumarDias(cursor, 1);
    }
    y = dibujarDiasDescansoEnRango(doc, y, fechasDescanso);
  }
  y += 4;

  y = dibujarKilometros(doc, y, totalKm, totalMinutos, kmPorTienda);
  y += 4;

  y = dibujarResumenDesempeno(doc, y, rachaActual, marcaciones, autoasignaciones, asignacionesEspeciales);
  y += 4;

  // Cuadro resumen de tiendas visitadas en el rango (a partir de los mismos
  // reportes, sin necesidad de otra consulta).
  const conteoTiendas = new Map<string, number>();
  reportes.forEach((r) => conteoTiendas.set(r.tiendaNombre, (conteoTiendas.get(r.tiendaNombre) ?? 0) + 1));

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Tiendas visitadas en el rango:", 14, y);
  y += 7;

  if (conteoTiendas.size === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.text("Sin visitas registradas en este rango.", 14, y);
    y += 8;
  } else {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    Array.from(conteoTiendas.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([tienda, cantidad]) => {
        const lineas = doc.splitTextToSize(`${tienda} — ${cantidad} visita(s)`, ANCHO_UTIL);
        if (y + lineas.length * 5.5 > ALTO_PAGINA) {
          doc.addPage();
          y = 20;
        }
        doc.text(lineas, 14, y);
        y += lineas.length * 5.5;
      });
    y += 6;
  }

  y = dibujarMarcaciones(doc, y, "Asistencia y marcaciones:", marcaciones, 8, 6);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Reportes de visitas:", 14, y);
  y += 7;

  if (reportes.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.text("No hay reportes registrados en este rango de fechas.", 14, y);
  }

  reportes.forEach((reporte) => {
    const lineasObservacion = doc.splitTextToSize(reporte.observacion, ANCHO_UTIL);
    const lineasActividad = reporte.actividad
      ? doc.splitTextToSize("Actividad: " + reporte.actividad, ANCHO_UTIL)
      : [];
    const altoBloque = 7 + lineasActividad.length * 5 + lineasObservacion.length * 5 + 6;

    if (y + altoBloque > ALTO_PAGINA) {
      doc.addPage();
      y = 20;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(formatearFechaLegible(reporte.fecha) + " — " + reporte.tiendaNombre, 14, y);
    y += 6;

    if (lineasActividad.length > 0) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      doc.text(lineasActividad, 14, y);
      y += lineasActividad.length * 5;
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(lineasObservacion, 14, y);
    y += lineasObservacion.length * 5 + 8;
  });

  const nombreArchivo = "historial_" + desde + "_a_" + hasta + ".pdf";
  // Vista previa: se devuelve la URL del blob para que quien llama la abra
  // en una pestaña ya creada (por el propio click, antes de este await) —
  // así el navegador no la bloquea como pop-up. El navegador renderiza el
  // PDF directo, con su propio zoom/scroll, sin descargar nada.
  if (modo === "vista_previa") {
    return doc.output("bloburl").toString();
  }
  doc.save(nombreArchivo);
}

const ALTO_PAGINA = 280;

export type DatosHistorialTienda = {
  tiendaNombre: string;
  desde: string;
  hasta: string;
  totalVisitas: number;
  observaciones: {
    fecha: string;
    usuarioNombre: string;
    rol: string;
    observacion: string;
    actividad: string | null;
  }[];
  visitantes: { usuarioNombre: string; rol: string; visitas: number }[];
  supervisoresPermanentes: { usuarioNombre: string; rol: string }[];
};

export async function generarPdfHistorialTienda(datos: DatosHistorialTienda) {
  const doc = new jsPDF();
  await dibujarEncabezado(doc, "Historial de tienda — Coordinador");

  let y = 40;
  y = campo(doc, "Tienda:", datos.tiendaNombre, y);
  y = campo(
    doc,
    "Rango:",
    formatearFechaLegible(datos.desde) + "  -  " + formatearFechaLegible(datos.hasta),
    y
  );
  y = campo(doc, "Total visitas:", String(datos.totalVisitas), y);
  y = campo(
    doc,
    "Supervisor(a) fijo(a):",
    datos.supervisoresPermanentes.length === 0
      ? "Sin asignar"
      : datos.supervisoresPermanentes.map((s) => `${s.usuarioNombre} (${s.rol})`).join(", "),
    y
  );
  y += 4;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Colaboradores que visitaron:", 14, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  if (datos.visitantes.length === 0) {
    doc.text("—", 14, y);
    y += 6;
  } else {
    datos.visitantes.forEach((v) => {
      const lineas = doc.splitTextToSize(`${v.usuarioNombre} (${v.rol}) — ${v.visitas} visita(s)`, ANCHO_UTIL);
      if (y + lineas.length * 5.5 > ALTO_PAGINA) {
        doc.addPage();
        y = 20;
      }
      doc.text(lineas, 14, y);
      y += lineas.length * 5.5;
    });
  }
  y += 6;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Observaciones:", 14, y);
  y += 7;

  if (datos.observaciones.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.text("No hay observaciones en este rango de fechas.", 14, y);
  }

  datos.observaciones.forEach((o) => {
    const lineasObservacion = doc.splitTextToSize(o.observacion, ANCHO_UTIL);
    const lineasActividad = o.actividad
      ? doc.splitTextToSize("Actividad: " + o.actividad, ANCHO_UTIL)
      : [];
    const altoBloque = 7 + lineasActividad.length * 5 + lineasObservacion.length * 5 + 6;

    if (y + altoBloque > ALTO_PAGINA) {
      doc.addPage();
      y = 20;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(formatearFechaLegible(o.fecha) + " — " + o.usuarioNombre + " (" + o.rol + ")", 14, y);
    y += 6;

    if (lineasActividad.length > 0) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      doc.text(lineasActividad, 14, y);
      y += lineasActividad.length * 5;
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(lineasObservacion, 14, y);
    y += lineasObservacion.length * 5 + 8;
  });

  const nombreArchivo =
    "historial_" + datos.tiendaNombre.replace(/\s+/g, "_") + "_" + datos.desde + "_a_" + datos.hasta + ".pdf";
  doc.save(nombreArchivo);
}

export type DatosHistorialPersona = {
  usuarioNombre: string;
  rol: string;
  desde: string;
  hasta: string;
  tiendasVisitadas: { fecha: string; tiendaNombre: string; observacion: string }[];
  marcaciones: { fecha: string; horaIngreso: string | null; horaSalida: string | null; tarde: boolean }[];
  puntos: { puntos: number; medallas: Record<"bronce" | "plata" | "oro" | "estrella", number> };
  tiendasPermanentes: string[];
  diasDescanso: string[];
  fechasDescansoEnRango: string[];
  antiguedad: { anios: number; meses: number } | null;
  proximoAniversario: { fecha: string; diasFaltantes: number } | null;
  proximoCumpleanos: { fecha: string; diasFaltantes: number; edadQueCumple: number | null } | null;
  totalKm: number;
  totalMinutos: number;
  kmPorTienda: KilometrosPorTienda[];
  rachaActual: number;
  autoasignaciones: number;
  asignacionesEspeciales: AsignacionEspecialPdf[];
};

export async function generarPdfHistorialPersona(datos: DatosHistorialPersona) {
  const doc = new jsPDF();
  await dibujarEncabezado(doc, "Historial de colaborador — Coordinador");

  let y = 40;
  y = campo(doc, "Nombre:", datos.usuarioNombre + " (" + datos.rol + ")", y);
  y = campo(
    doc,
    "Rango:",
    formatearFechaLegible(datos.desde) + "  -  " + formatearFechaLegible(datos.hasta),
    y
  );
  y = dibujarVitrinaTrofeos(doc, 14, y, datos.puntos.puntos, datos.puntos.medallas);
  y = campo(
    doc,
    "Tienda(s) fija(s):",
    datos.tiendasPermanentes.length === 0 ? "Sin asignar" : datos.tiendasPermanentes.join(", "),
    y
  );
  y = campo(
    doc,
    "Descanso semanal:",
    datos.diasDescanso.length === 0 ? "Sin asignar" : datos.diasDescanso.join(" y "),
    y
  );
  if (datos.diasDescanso.length > 0) {
    y = dibujarDiasDescansoEnRango(doc, y, datos.fechasDescansoEnRango);
  }
  y = campo(
    doc,
    "Antigüedad:",
    datos.antiguedad
      ? `${datos.antiguedad.anios} año(s) y ${datos.antiguedad.meses} mes(es)`
      : "No registrada",
    y
  );
  y = campo(
    doc,
    "Próximo aniversario:",
    datos.proximoAniversario
      ? `${formatearFechaLegible(datos.proximoAniversario.fecha)} (en ${datos.proximoAniversario.diasFaltantes} día(s))`
      : "No registrado",
    y
  );
  y = campo(
    doc,
    "Próximo cumpleaños:",
    datos.proximoCumpleanos
      ? `${formatearFechaLegible(datos.proximoCumpleanos.fecha)} — cumple ${datos.proximoCumpleanos.edadQueCumple} años (en ${datos.proximoCumpleanos.diasFaltantes} día(s))`
      : "No registrado",
    y
  );
  y += 4;

  y = dibujarKilometros(doc, y, datos.totalKm, datos.totalMinutos, datos.kmPorTienda);
  y += 4;

  y = dibujarResumenDesempeno(
    doc,
    y,
    datos.rachaActual,
    datos.marcaciones,
    datos.autoasignaciones,
    datos.asignacionesEspeciales
  );
  y += 4;

  y = dibujarMarcaciones(doc, y, "Marcaciones de entrada / salida:", datos.marcaciones, 6, 4);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Tiendas visitadas:", 14, y);
  y += 7;

  if (datos.tiendasVisitadas.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.text("Sin visitas registradas en este rango.", 14, y);
  }

  datos.tiendasVisitadas.forEach((t) => {
    const lineasObservacion = doc.splitTextToSize(t.observacion, ANCHO_UTIL);
    const altoBloque = 6 + lineasObservacion.length * 5 + 5;

    if (y + altoBloque > ALTO_PAGINA) {
      doc.addPage();
      y = 20;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.text(formatearFechaLegible(t.fecha) + " — " + t.tiendaNombre, 14, y);
    y += 5.5;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(lineasObservacion, 14, y);
    y += lineasObservacion.length * 5 + 6;
  });

  const nombreArchivo =
    "historial_" + datos.usuarioNombre.replace(/\s+/g, "_") + "_" + datos.desde + "_a_" + datos.hasta + ".pdf";
  doc.save(nombreArchivo);
}

// ---------- Auditoría de tienda ----------
//
// Pensado para imprimirse y entregarse en papel al líder/encargado de la
// tienda, así que además del contenido lleva dos líneas de firma al final.

const COLOR_CLASIFICACION: Record<string, [number, number, number]> = {
  Excelente: [16, 150, 90],
  Bueno: [37, 130, 190],
  "Requiere mejora": [200, 140, 20],
  "Acción inmediata": [200, 30, 40],
};

export type DatosAuditoriaPdf = {
  tiendaNombre: string;
  fecha: string;
  supervisorNombre: string; // quien realizó la auditoría
  lider: string | null;
  puntajeTotal: number;
  puntajeMaximo: number;
  porcentaje: number;
  clasificacion: string;
  alertas: string[];
  items: { categoria: string; item: string; puntaje: number }[];
  observaciones: Record<string, string>;
  fortalezas: string | null;
  oportunidades: string | null;
  compromisos: { accion: string; responsable: string; fecha: string }[];
};

const ETIQUETA_PUNTAJE: Record<number, string> = { 2: "Cumple", 1: "Parcial", 0: "No cumple" };

export async function generarPdfAuditoria(datos: DatosAuditoriaPdf) {
  const doc = new jsPDF();
  await dibujarEncabezado(doc, "Auditoría de tienda");

  let y = 40;
  y = campo(doc, "Tienda:", datos.tiendaNombre, y);
  y = campo(doc, "Fecha:", formatearFechaLegible(datos.fecha), y);
  y = campo(doc, "Realizada por:", datos.supervisorNombre, y);
  if (datos.lider) y = campo(doc, "Líder de tienda:", datos.lider, y);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  const colorClasificacion = COLOR_CLASIFICACION[datos.clasificacion] ?? [0, 0, 0];
  doc.setTextColor(...colorClasificacion);
  doc.text(
    `Puntaje: ${datos.puntajeTotal}/${datos.puntajeMaximo} (${datos.porcentaje}%) — ${datos.clasificacion}`,
    14,
    y
  );
  doc.setTextColor(0, 0, 0);
  y += 10;

  if (datos.alertas.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...ROJO_TARDANZA);
    doc.text("Alertas críticas:", 14, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    datos.alertas.forEach((a) => {
      const lineas = doc.splitTextToSize("• " + a, ANCHO_UTIL - 4);
      doc.text(lineas, 18, y);
      y += lineas.length * 5;
    });
    doc.setTextColor(0, 0, 0);
    y += 4;
  }

  // Checklist agrupado por categoría, en el mismo orden en que aparecen los
  // ítems (que ya vienen ordenados por categoría desde la plantilla).
  const categorias = Array.from(new Set(datos.items.map((i) => i.categoria)));

  categorias.forEach((categoria) => {
    const itemsCategoria = datos.items.filter((i) => i.categoria === categoria);
    const obs = datos.observaciones[categoria];
    const alturaEstimativa = 8 + itemsCategoria.length * 5.5 + (obs ? 10 : 0);

    if (y + alturaEstimativa > ALTO_PAGINA) {
      doc.addPage();
      y = 20;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.text(categoria, 14, y);
    y += 6;

    itemsCategoria.forEach((it) => {
      if (y + 5.5 > ALTO_PAGINA) {
        doc.addPage();
        y = 20;
      }
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(0, 0, 0);
      const lineasItem = doc.splitTextToSize(it.item, ANCHO_UTIL - 30);
      doc.text(lineasItem, 18, y);

      const etiqueta = ETIQUETA_PUNTAJE[it.puntaje] ?? "—";
      doc.setFont("helvetica", "bold");
      if (it.puntaje === 2) doc.setTextColor(16, 150, 90);
      else if (it.puntaje === 1) doc.setTextColor(200, 140, 20);
      else doc.setTextColor(...ROJO_TARDANZA);
      doc.text(etiqueta, 175, y, { align: "right" });
      doc.setTextColor(0, 0, 0);

      y += Math.max(lineasItem.length * 5, 5.5);
    });

    if (obs) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8.5);
      const lineasObs = doc.splitTextToSize("Obs: " + obs, ANCHO_UTIL - 4);
      doc.text(lineasObs, 18, y);
      y += lineasObs.length * 4.5;
    }

    y += 4;
  });

  y += 2;

  if (datos.fortalezas) {
    if (y + 16 > ALTO_PAGINA) {
      doc.addPage();
      y = 20;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Fortalezas:", 14, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const lineas = doc.splitTextToSize(datos.fortalezas, ANCHO_UTIL);
    doc.text(lineas, 14, y);
    y += lineas.length * 5 + 4;
  }

  if (datos.oportunidades) {
    if (y + 16 > ALTO_PAGINA) {
      doc.addPage();
      y = 20;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Oportunidades de mejora:", 14, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const lineas = doc.splitTextToSize(datos.oportunidades, ANCHO_UTIL);
    doc.text(lineas, 14, y);
    y += lineas.length * 5 + 4;
  }

  if (datos.compromisos.length > 0) {
    if (y + 12 > ALTO_PAGINA) {
      doc.addPage();
      y = 20;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Compromisos:", 14, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    datos.compromisos.forEach((c) => {
      const texto =
        `• ${c.accion} — responsable: ${c.responsable || "—"}` +
        (c.fecha ? ` — para: ${formatearFechaLegible(c.fecha)}` : "");
      const lineas = doc.splitTextToSize(texto, ANCHO_UTIL - 4);
      if (y + lineas.length * 5 > ALTO_PAGINA) {
        doc.addPage();
        y = 20;
      }
      doc.text(lineas, 18, y);
      y += lineas.length * 5;
    });
    y += 4;
  }

  // Pensado para entregarse impreso en la tienda — dos líneas de firma al
  // final, en una página nueva si no queda espacio decente para ambas.
  if (y + 40 > ALTO_PAGINA) {
    doc.addPage();
    y = 20;
  } else {
    y += 14;
  }

  const anchoFirma = 78;
  doc.setDrawColor(0, 0, 0);
  doc.line(14, y, 14 + anchoFirma, y);
  doc.line(210 - 14 - anchoFirma, y, 210 - 14, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text("Firma — realizó la auditoría", 14, y);
  doc.text("Firma — líder / encargado de tienda", 210 - 14 - anchoFirma, y);

  const nombreArchivo =
    "auditoria_" + datos.tiendaNombre.replace(/\s+/g, "_") + "_" + datos.fecha + ".pdf";
  doc.save(nombreArchivo);
}

// ---------- Checklist de rutina de visita ----------
//
// Igual que la auditoría, pensado para entregarse (impreso o en digital) al
// encargado de la tienda -- de ahí las líneas de firma al final.

export type ItemChecklistVisitaPdf = {
  etiqueta: string;
  tipo: "escala_5" | "si_no" | "opciones" | "texto" | "numero";
  valor: string | number | boolean | null;
};

export type SeccionChecklistVisitaPdf = {
  titulo: string;
  items: ItemChecklistVisitaPdf[];
};

export type DatosChecklistVisitaPdf = {
  tiendaNombre: string;
  fecha: string;
  usuarioNombre: string;
  rol: string;
  secciones: SeccionChecklistVisitaPdf[];
  porcentaje?: number | null;
  clasificacion?: string | null;
};

function formatearValorChecklist(item: ItemChecklistVisitaPdf): string {
  const { tipo, valor } = item;
  if (valor === null || valor === undefined || valor === "") return "—";
  if (tipo === "escala_5") return `${valor}/5`;
  if (tipo === "si_no") return valor === true || valor === "true" ? "Sí" : "No";
  return String(valor);
}

export async function generarPdfChecklistVisita(datos: DatosChecklistVisitaPdf): Promise<void> {
  const doc = new jsPDF();
  await dibujarEncabezado(doc, "Checklist de rutina de visita");

  let y = 40;
  y = campo(doc, "Tienda:", datos.tiendaNombre, y);
  y = campo(doc, "Fecha:", formatearFechaLegible(datos.fecha), y);
  y = campo(doc, "Realizado por:", `${datos.usuarioNombre} (${datos.rol})`, y);

  if (datos.porcentaje !== null && datos.porcentaje !== undefined) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    const color = COLOR_CLASIFICACION[datos.clasificacion ?? ""] ?? [0, 0, 0];
    doc.setTextColor(...color);
    doc.text(`Puntaje: ${datos.porcentaje}% — ${datos.clasificacion ?? ""}`, 14, y);
    doc.setTextColor(0, 0, 0);
    y += 8;
  }
  y += 3;

  datos.secciones.forEach((seccion) => {
    const itemsConValor = seccion.items.filter(
      (it) => it.valor !== null && it.valor !== undefined && it.valor !== ""
    );
    if (itemsConValor.length === 0) return;

    if (y + 12 > ALTO_PAGINA) {
      doc.addPage();
      y = 20;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(seccion.titulo, 14, y);
    y += 6;

    itemsConValor.forEach((item) => {
      if (item.tipo === "texto") {
        const lineas = doc.splitTextToSize(`${item.etiqueta}: ${formatearValorChecklist(item)}`, ANCHO_UTIL - 4);
        if (y + lineas.length * 5 > ALTO_PAGINA) {
          doc.addPage();
          y = 20;
        }
        doc.setFont("helvetica", "italic");
        doc.setFontSize(9);
        doc.text(lineas, 18, y);
        y += lineas.length * 5;
        return;
      }

      if (y + 5.5 > ALTO_PAGINA) {
        doc.addPage();
        y = 20;
      }
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.text(item.etiqueta, 18, y);
      doc.setFont("helvetica", "bold");
      doc.text(formatearValorChecklist(item), 175, y, { align: "right" });
      y += 5.5;
    });

    y += 4;
  });

  // Pensado para entregarse al encargado de la tienda -- dos líneas de
  // firma al final, en una página nueva si no queda espacio decente.
  if (y + 40 > ALTO_PAGINA) {
    doc.addPage();
    y = 20;
  } else {
    y += 14;
  }

  const anchoFirma = 78;
  doc.setDrawColor(0, 0, 0);
  doc.line(14, y, 14 + anchoFirma, y);
  doc.line(210 - 14 - anchoFirma, y, 210 - 14, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text("Firma — realizó el checklist", 14, y);
  doc.text("Firma — encargado de tienda", 210 - 14 - anchoFirma, y);

  const nombreArchivo =
    "checklist_visita_" + datos.tiendaNombre.replace(/\s+/g, "_") + "_" + datos.fecha + ".pdf";
  doc.save(nombreArchivo);
}
