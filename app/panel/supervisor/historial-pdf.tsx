"use client";

import { useState } from "react";
import {
  obtenerHistorialReportes,
  obtenerHistorialMarcaciones,
  obtenerPerfilParaPdf,
  obtenerMisAutoasignaciones,
  obtenerMisAsignacionesEspeciales,
} from "./pdf-actions";
import { obtenerMisPuntos } from "../puntos-actions";
import { obtenerMisKilometros } from "../kilometros-actions";
import { generarPdfHistorial } from "@/lib/generar-pdf";
import { hoyPeru, sumarDias } from "@/lib/fechas";

export default function HistorialPdf({ supervisorNombre }: { supervisorNombre: string }) {
  const hoy = hoyPeru();
  const [desde, setDesde] = useState<string>(sumarDias(hoy, -7));
  const [hasta, setHasta] = useState<string>(hoy);
  const [generando, setGenerando] = useState<false | "descargar" | "vista_previa">(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerar(modo: "descargar" | "vista_previa") {
    // Se abre la pestaña YA (vacía) dentro del propio click, antes de
    // cualquier await — si se abre después de esperar los datos, la mayoría
    // de navegadores la bloquea como pop-up por no venir de un gesto directo
    // del usuario. Después solo se le cambia la URL cuando el PDF esté listo.
    const ventana = modo === "vista_previa" ? window.open("", "_blank") : null;

    setGenerando(modo);
    setError(null);
    try {
      const [reportes, marcaciones, perfil, misPuntos, kilometros, autoasignaciones, asignacionesEspeciales] =
        await Promise.all([
          obtenerHistorialReportes(desde, hasta),
          obtenerHistorialMarcaciones(desde, hasta),
          obtenerPerfilParaPdf(),
          obtenerMisPuntos(),
          obtenerMisKilometros(desde, hasta),
          obtenerMisAutoasignaciones(desde, hasta),
          obtenerMisAsignacionesEspeciales(desde, hasta),
        ]);
      const resultado = await generarPdfHistorial(
        {
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
          totalKm: kilometros.filas[0]?.totalKm ?? 0,
          totalMinutos: kilometros.filas[0]?.totalMinutos ?? 0,
          kmPorTienda: kilometros.detalle.map((d) => ({
            tiendaNombre: d.origenNombre ? `${d.origenNombre} -> ${d.tiendaNombre}` : d.tiendaNombre,
            km: d.kmAcumulado,
            minutos: d.minutos * d.visitas,
            visitas: d.visitas,
          })),
          rachaActual: misPuntos.rachaActual,
          autoasignaciones,
          asignacionesEspeciales,
        },
        modo
      );
      if (modo === "vista_previa" && resultado) {
        if (ventana) ventana.location.href = resultado;
        else window.open(resultado, "_blank");
      }
    } catch (e: any) {
      ventana?.close();
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

      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={() => handleGenerar("vista_previa")}
          disabled={!!generando}
          className="flex-1 border border-marca-rojo/50 hover:border-marca-rojo text-marca-rojoclaro hover:text-marca-textofuerte disabled:opacity-50 font-black py-3 rounded-[3px] text-xs tracking-widest uppercase transition"
        >
          {generando === "vista_previa" ? "Abriendo..." : "👁️ Vista previa"}
        </button>
        <button
          onClick={() => handleGenerar("descargar")}
          disabled={!!generando}
          className="flex-1 bg-marca-rojo hover:bg-marca-rojoclaro disabled:opacity-50 text-marca-textofuerte font-black py-3 rounded-[3px] text-xs tracking-widest uppercase transition"
        >
          {generando === "descargar" ? "Generando..." : "Descargar historial PDF"}
        </button>
      </div>

      {error && <p className="text-marca-rojoclaro text-xs font-bold text-center">{error}</p>}
    </div>
  );
}
