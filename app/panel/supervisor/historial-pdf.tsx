"use client";

import { useState } from "react";
import { obtenerHistorialReportes, obtenerHistorialMarcaciones, obtenerPerfilParaPdf } from "./pdf-actions";
import { obtenerMisPuntos } from "../puntos-actions";
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
      const [reportes, marcaciones, perfil, misPuntos] = await Promise.all([
        obtenerHistorialReportes(desde, hasta),
        obtenerHistorialMarcaciones(desde, hasta),
        obtenerPerfilParaPdf(),
        obtenerMisPuntos(),
      ]);
      await generarPdfHistorial({
        nombre: supervisorNombre,
        rol: perfil.rol,
        desde,
        hasta,
        reportes,
        marcaciones,
        tiendasPermanentes: perfil.rol === "supervisor" ? perfil.tiendasPermanentes : [],
        diasDescanso: perfil.diasDescanso,
        puntos: misPuntos.puntos,
        medallas: misPuntos.medallas,
      });
    } catch (e: any) {
      setError(e && e.message ? e.message : "No se pudo generar el PDF.");
    } finally {
      setGenerando(false);
    }
  }

  return (
    <div className="bg-marca-superficie border border-marca-rojo/25 rounded-[3px] p-5 space-y-4">
      <h3 className="text-xs font-black tracking-widest text-marca-tenue">
        📄 HISTORIAL EN PDF
      </h3>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">
            Desde
          </label>
          <input
            type="date"
            value={desde}
            max={hasta}
            onChange={(e) => setDesde(e.target.value)}
            className="w-full p-3 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro"
          />
        </div>
        <div className="flex-1">
          <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">
            Hasta
          </label>
          <input
            type="date"
            value={hasta}
            min={desde}
            max={hoy}
            onChange={(e) => setHasta(e.target.value)}
            className="w-full p-3 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro"
          />
        </div>
      </div>

      <button
        onClick={handleGenerar}
        disabled={generando}
        className="w-full bg-marca-rojo hover:bg-marca-rojoclaro disabled:opacity-50 text-marca-textofuerte font-black py-3 rounded-[3px] text-xs tracking-widest uppercase transition"
      >
        {generando ? "Generando..." : "Descargar historial PDF"}
      </button>

      {error && <p className="text-marca-rojoclaro text-xs font-bold text-center">{error}</p>}
    </div>
  );
}
