import jsPDF from "jspdf";
import { formatearFechaLegible, formatearHora, diaSemanaPeru, sumarDias } from "./fechas";

const AMARILLO: [number, number, number] = [234, 179, 8];
const FONDO_OSCURO: [number, number, number] = [15, 17, 26];
const ANCHO_UTIL = 180;

// El logo se descarga una sola vez (es el mismo círculo que aparece en el
// login) y se reutiliza en cada PDF que se genere durante la sesión.
let logoBase64Cache: string | null = null;

async function obtenerLogoBase64(): Promise<string | null> {
  if (logoBase64Cache) return logoBase64Cache;
  try {
    const respuesta = await fetch("/logo-shimaya.jpeg");
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

// El archivo del logo es un cuadrado con esquinas blancas — se recorta a un
// círculo con una máscara de clip, igual que el CSS "rounded-full" del login.
function dibujarLogoCircular(doc: jsPDF, logo: string, cx: number, cy: number, radio: number) {
  doc.saveGraphicsState();
  doc.circle(cx, cy, radio, "S");
  doc.clip();
  (doc as any).discardPath?.();
  doc.addImage(logo, "JPEG", cx - radio, cy - radio, radio * 2, radio * 2);
  doc.restoreGraphicsState();
}

async function dibujarEncabezado(doc: jsPDF, subtitulo: string) {
  doc.setFillColor(...FONDO_OSCURO);
  doc.rect(0, 0, 210, 28, "F");

  const logo = await obtenerLogoBase64();
  if (logo) {
    try {
      dibujarLogoCircular(doc, logo, 189, 14, 9);
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

function campo(doc: jsPDF, etiqueta: string, valor: string, y: number): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(etiqueta, 14, y);
  doc.setFont("helvetica", "normal");
  doc.text(valor, 48, y);
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
};

export async function generarPdfHistorial(datos: DatosHistorialPropio) {
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
    formatearFechaLegible(desde) + "  →  " + formatearFechaLegible(hasta),
    y
  );
  y = campo(
    doc,
    "Vitrina de trofeos:",
    `${puntos} pts — 🥉x${medallas.bronce} 🥈x${medallas.plata} 🥇x${medallas.oro} 🌟x${medallas.estrella}`,
    y
  );
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
    y += lineasFechas.length * 5 + 4;
  }
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
        doc.text(`${tienda} — ${cantidad} visita(s)`, 14, y);
        y += 5.5;
      });
    y += 6;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Asistencia y marcaciones:", 14, y);
  y += 7;

  if (marcaciones.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.text("Sin marcaciones en este rango.", 14, y);
    y += 8;
  } else {
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
    y += 6;
  }

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
    formatearFechaLegible(datos.desde) + "  →  " + formatearFechaLegible(datos.hasta),
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
      doc.text(`${v.usuarioNombre} (${v.rol}) — ${v.visitas} visita(s)`, 14, y);
      y += 5.5;
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
};

export async function generarPdfHistorialPersona(datos: DatosHistorialPersona) {
  const doc = new jsPDF();
  await dibujarEncabezado(doc, "Historial de colaborador — Coordinador");

  let y = 40;
  y = campo(doc, "Nombre:", datos.usuarioNombre + " (" + datos.rol + ")", y);
  y = campo(
    doc,
    "Rango:",
    formatearFechaLegible(datos.desde) + "  →  " + formatearFechaLegible(datos.hasta),
    y
  );
  y = campo(
    doc,
    "Puntos:",
    `${datos.puntos.puntos} pts — 🥉x${datos.puntos.medallas.bronce} 🥈x${datos.puntos.medallas.plata} 🥇x${datos.puntos.medallas.oro} 🌟x${datos.puntos.medallas.estrella}`,
    y
  );
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
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Descansó estos días en el rango:", 14, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const textoFechas =
      datos.fechasDescansoEnRango.length === 0
        ? "Ninguno dentro de este rango."
        : datos.fechasDescansoEnRango.map((f) => formatearFechaLegible(f)).join("  ·  ");
    const lineasFechas = doc.splitTextToSize(textoFechas, ANCHO_UTIL);
    doc.text(lineasFechas, 14, y);
    y += lineasFechas.length * 5 + 4;
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

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Marcaciones de entrada / salida:", 14, y);
  y += 7;

  if (datos.marcaciones.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.text("Sin marcaciones en este rango.", 14, y);
    y += 6;
  } else {
    datos.marcaciones.forEach((m) => {
      if (y + 6 > ALTO_PAGINA) {
        doc.addPage();
        y = 20;
      }
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      if (m.tarde) doc.setTextColor(200, 30, 30);
      else doc.setTextColor(0, 0, 0);
      const ingreso = m.horaIngreso ? formatearHora(m.horaIngreso) : "—";
      const salida = m.horaSalida ? formatearHora(m.horaSalida) : "—";
      doc.text(
        `${formatearFechaLegible(m.fecha)} — Ingreso: ${ingreso}${m.tarde ? " (TARDE)" : ""} · Salida: ${salida}`,
        14,
        y
      );
      y += 5.5;
    });
    doc.setTextColor(0, 0, 0);
    y += 4;
  }

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
