"use client";

import { useState } from "react";
import { obtenerHistorialReportes, obtenerHistorialMarcaciones } from "./pdf-actions";
import { generarPdfHistorial } from "@/lib/generar-pdf";
import { hoyPeru, sumarDias } from "@/lib/fechas";

export default function HistorialPdf({ supervisorNombre }: { supervisorNombre: string }) {
  const hoy = hoyPeru();
  const [desde, setDesde] = useState<string>(sumarDias(hoy, -7));
  const [hasta, setHasta] = useState<string>(hoy);
  const [generando, setGenerando] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerar() {
    setGenerando(true);
    setError(null);
    try {
      const [reportes, marcaciones] = await Promise.all([
        obtenerHistorialReportes(desde, hasta),
        obtenerHistorialMarcaciones(desde, hasta),
      ]);
      generarPdfHistorial(supervisorNombre, desde, hasta, reportes, marcaciones);
    } catch (e: any) {
      setError(e && e.message ? e.message : "No se pudo generar el PDF.");
    } finally {
      setGenerando(false);
    }
  }

  return (
    <div className="bg-[#0f111a] border-2 border-slate-700/60 rounded-2xl p-5 space-y-4">
      <h3 className="text-xs font-black tracking-widest text-slate-300">
        📄 HISTORIAL EN PDF
      </h3>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">
            Desde
          </label>
          <input
            type="date"
            value={desde}
            max={hasta}
            onChange={(e) => setDesde(e.target.value)}
            className="w-full p-3 bg-[#0d1117] border border-slate-800 rounded-xl text-white text-sm outline-none focus:border-cyan-500"
          />
        </div>
        <div className="flex-1">
          <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">
            Hasta
          </label>
          <input
            type="date"
            value={hasta}
            min={desde}
            max={hoy}
            onChange={(e) => setHasta(e.target.value)}
            className="w-full p-3 bg-[#0d1117] border border-slate-800 rounded-xl text-white text-sm outline-none focus:border-cyan-500"
          />
        </div>
      </div>

      <button
        onClick={handleGenerar}
        disabled={generando}
        className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-black py-3 rounded-xl text-xs tracking-widest uppercase transition"
      >
        {generando ? "Generando..." : "Descargar historial PDF"}
      </button>

      {error && <p className="text-red-400 text-xs font-bold text-center">{error}</p>}
    </div>
  );
}
