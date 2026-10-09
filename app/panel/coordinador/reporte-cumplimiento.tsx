"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Clock, LogOut, Coffee, Hourglass, FileText, ClipboardList, FileDown } from "lucide-react";
import {
  obtenerReporteNoCumplimiento,
  type ReporteNoCumplimiento,
  type FilaCumplimiento,
} from "./reporte-cumplimiento-actions";
import { hoyPeru, sumarDias, formatearFechaCorta } from "@/lib/fechas";
import { generarPdfNoCumplimiento } from "@/lib/generar-pdf";
import BloqueColapsable from "../bloque-colapsable";
import EstadoVacio from "../estado-vacio";

function Lista({ filas, sufijo, vacio }: { filas: FilaCumplimiento[]; sufijo: string; vacio: string }) {
  if (filas.length === 0) return <EstadoVacio mensaje={vacio} />;
  return (
    <div className="space-y-1.5">
      {filas.map((f) => (
        <div key={f.usuarioId} className="bg-marca-fondo border border-marca-borde rounded-[3px] px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-marca-texto text-sm">
              {f.usuarioNombre} <span className="text-marca-tenue text-[11px] uppercase">({f.rol})</span>
            </span>
            {sufijo && (
              <span className="text-marca-rojoclaro font-black text-sm shrink-0">
                {f.fechas.length} {sufijo}
                {f.fechas.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
          {f.fechas.length > 0 && (
            <p className="text-marca-tenue text-[11px] mt-1 capitalize">
              {f.fechas.map((fecha) => formatearFechaCorta(fecha)).join(" · ")}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

export default function ReporteCumplimiento() {
  const [desde, setDesde] = useState(sumarDias(hoyPeru(), -7));
  const [hasta, setHasta] = useState(hoyPeru());
  const [datos, setDatos] = useState<ReporteNoCumplimiento | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generandoPdf, setGenerandoPdf] = useState(false);

  useEffect(() => {
    setCargando(true);
    setError(null);
    obtenerReporteNoCumplimiento(desde, hasta)
      .then(setDatos)
      .catch((e) => setError(e.message || "No se pudo cargar el reporte."))
      .finally(() => setCargando(false));
  }, [desde, hasta]);

  async function handleDescargarPdf() {
    if (!datos || generandoPdf) return;
    setGenerandoPdf(true);
    try {
      await generarPdfNoCumplimiento(datos);
    } finally {
      setGenerandoPdf(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="flex items-center gap-1.5 text-xs font-black tracking-widest text-marca-tenue">
          <AlertTriangle className="w-3.5 h-3.5 text-marca-rojoclaro" /> REPORTE DE NO CUMPLIMIENTO
        </h3>
        <p className="text-marca-tenue text-[11px] mt-1">
          Solo supervisores y capacitadores — coordinador, gerente y cuentas genéricas no entran aquí.
        </p>
      </div>

      <div className="bg-marca-superficie border border-marca-borde rounded-[3px] p-4 flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">Desde</label>
          <input
            type="date"
            value={desde}
            max={hasta}
            onChange={(e) => setDesde(e.target.value)}
            className="w-full p-2.5 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro"
          />
        </div>
        <div className="flex-1">
          <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">Hasta</label>
          <input
            type="date"
            value={hasta}
            min={desde}
            max={hoyPeru()}
            onChange={(e) => setHasta(e.target.value)}
            className="w-full p-2.5 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro"
          />
        </div>
      </div>

      {error && <p className="text-marca-rojoclaro text-sm">{error}</p>}
      {cargando && <p className="text-marca-tenue text-sm animate-pulse">Cargando reporte...</p>}

      {!cargando && !error && datos && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={handleDescargarPdf}
            disabled={generandoPdf}
            className="w-full flex items-center justify-center gap-1.5 bg-marca-rojo hover:bg-marca-rojoclaro disabled:opacity-50 text-marca-textofuerte font-black py-2.5 rounded-[3px] text-[11px] tracking-widest uppercase transition"
          >
            <FileDown className="w-3.5 h-3.5" /> {generandoPdf ? "Generando..." : "Descargar PDF"}
          </button>

          <BloqueColapsable icono={<Clock />} titulo="TARDANZAS" badge={`${datos.tardanzas.length}`}>
            <Lista filas={datos.tardanzas} sufijo="tardanza" vacio="Nadie llegó tarde en este rango." />
          </BloqueColapsable>

          <BloqueColapsable icono={<LogOut />} titulo="NO MARCÓ SALIDA" badge={`${datos.sinSalida.length}`}>
            <Lista
              filas={datos.sinSalida}
              sufijo="día"
              vacio="Todos marcaron su salida en este rango."
            />
          </BloqueColapsable>

          <BloqueColapsable icono={<Coffee />} titulo="NO MARCÓ BREAK" badge={`${datos.sinBreak.length}`}>
            <Lista
              filas={datos.sinBreak}
              sufijo="día"
              vacio="Todos marcaron su break (o avisaron que no salían) en este rango."
            />
          </BloqueColapsable>

          <BloqueColapsable icono={<Hourglass />} titulo="SE PASÓ DEL TIEMPO DE BREAK" badge={`${datos.sePasoBreak.length}`}>
            <Lista
              filas={datos.sePasoBreak}
              sufijo="vez"
              vacio="Nadie se pasó de su tiempo de break en este rango."
            />
          </BloqueColapsable>

          <BloqueColapsable icono={<FileText />} titulo="NO HACE OBSERVACIONES" badge={`${datos.sinObservaciones.length}`}>
            <Lista
              filas={datos.sinObservaciones}
              sufijo="día"
              vacio="Todos enviaron su reporte los días que trabajaron en este rango."
            />
          </BloqueColapsable>

          <BloqueColapsable icono={<ClipboardList />} titulo="NO HACE CHECKLIST" badge={`${datos.sinChecklist.length}`}>
            <Lista
              filas={datos.sinChecklist}
              sufijo=""
              vacio="Todos enviaron al menos un checklist en este rango."
            />
          </BloqueColapsable>
        </div>
      )}
    </div>
  );
}
