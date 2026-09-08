"use client";

import { useState } from "react";
import GpsMarcador from "../supervisor/gps-marcador";
import SelectorTiendas from "../supervisor/selector-tiendas";
import HistorialPdf from "../supervisor/historial-pdf";
import AsignarRutas from "./asignar-rutas";
import AsignacionesEspeciales from "./asignaciones-especiales";
import TiendasPermanentes from "./tiendas-permanentes";
import DescansosSemanales from "./descansos-semanales";
import EstadoPersonalHoy from "./estado-personal-hoy";
import Anuncios from "./anuncios";
import Reportes from "./reportes";
import MisPuntosWidget from "../mis-puntos-widget";

type Pestana = "rutas" | "mi-ruta" | "reportes" | "personal" | "anuncios";

const PESTANAS: { id: Pestana; etiqueta: string }[] = [
  { id: "rutas", etiqueta: "Rutas" },
  { id: "mi-ruta", etiqueta: "Mi Ruta" },
  { id: "reportes", etiqueta: "Reportes" },
  { id: "personal", etiqueta: "Personal" },
  { id: "anuncios", etiqueta: "Anuncios" },
];

export default function PanelTabs({ nombre }: { nombre: string }) {
  const [pestana, setPestana] = useState<Pestana>("rutas");

  return (
    <div>
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {PESTANAS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPestana(p.id)}
            className={`px-4 py-2 rounded-lg text-xs font-black tracking-widest uppercase transition shrink-0 ${
              pestana === p.id
                ? "bg-red-600 text-white"
                : "bg-[#181b29] border border-slate-700 text-slate-400 hover:bg-[#22273a]"
            }`}
          >
            {p.etiqueta}
          </button>
        ))}
      </div>

      {pestana === "rutas" && <AsignarRutas />}

      {pestana === "mi-ruta" && (
        <div className="space-y-6">
          <MisPuntosWidget />
          <GpsMarcador />
          <SelectorTiendas supervisorNombre={nombre} />
          <HistorialPdf supervisorNombre={nombre} />
        </div>
      )}

      {pestana === "reportes" && <Reportes />}

      {pestana === "personal" && (
        <div className="space-y-8">
          <EstadoPersonalHoy />
          <AsignacionesEspeciales />
          <TiendasPermanentes />
          <DescansosSemanales />
        </div>
      )}

      {pestana === "anuncios" && <Anuncios />}
    </div>
  );
}
