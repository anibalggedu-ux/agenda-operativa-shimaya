import jsPDF from "jspdf";
import { formatearFechaLegible } from "./fechas";

const AMARILLO: [number, number, number] = [234, 179, 8];
const FONDO_OSCURO: [number, number, number] = [15, 17, 26];
const ANCHO_UTIL = 180;

function dibujarEncabezado(doc: jsPDF, subtitulo: string) {
  doc.setFillColor(...FONDO_OSCURO);
  doc.rect(0, 0, 210, 28, "F");

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

export function generarPdfReporteIndividual(datos: DatosReporteIndividual) {
  const doc = new jsPDF();
  dibujarEncabezado(doc, "Reporte de visita — Supervisor");

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

export function generarPdfHistorial(
  supervisorNombre: string,
  desde: string,
  hasta: string,
  reportes: ReporteHistorialItem[]
) {
  const doc = new jsPDF();
  dibujarEncabezado(doc, "Historial de reportes — Supervisor");

  let y = 40;
  y = campo(doc, "Supervisor:", supervisorNombre, y);
  y = campo(
    doc,
    "Rango:",
    formatearFechaLegible(desde) + "  →  " + formatearFechaLegible(hasta),
    y
  );
  y += 4;

  const ALTO_PAGINA = 280;

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
