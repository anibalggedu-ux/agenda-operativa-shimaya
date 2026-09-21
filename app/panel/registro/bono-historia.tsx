"use client";

import { useEffect, useState } from "react";
import {
  obtenerConfiguracionBonoHistoria,
  actualizarConfiguracionBonoHistoria,
  type ConfiguracionBonoHistoria,
} from "../puntos-actions";

export default function BonoHistoria() {
  const [config, setConfig] = useState<ConfiguracionBonoHistoria | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ texto: string; exito: boolean } | null>(null);

  useEffect(() => {
    obtenerConfiguracionBonoHistoria()
      .then(setConfig)
      .catch(() => setMensaje({ texto: "No se pudo cargar la configuración.", exito: false }))
      .finally(() => setCargando(false));
  }, []);

  async function guardar() {
    if (!config) return;
    setGuardando(true);
    setMensaje(null);
    const resultado = await actualizarConfiguracionBonoHistoria(config.activo, config.puntos);
    setGuardando(false);
    setMensaje({
      texto: resultado.exito ? "Guardado." : resultado.mensaje || "No se pudo guardar.",
      exito: resultado.exito,
    });
  }

  if (cargando) return <p className="text-marca-tenue text-sm animate-pulse">Cargando...</p>;
  if (!config) return <p className="text-marca-rojoclaro text-sm">{mensaje?.texto}</p>;

  return (
    <div className="space-y-4">
      <p className="text-marca-tenue text-[11px]">
        Suma puntos a supervisor, capacitador y coordinador cada día que publiquen al menos una historia (no
        importa cuántas fotos suban ese día, cuenta como un solo día). Gerente no participa del sistema de
        puntos, igual que en el resto de la app.
      </p>

      <label className="flex items-center gap-2.5 cursor-pointer">
        <input
          type="checkbox"
          checked={config.activo}
          onChange={(e) => setConfig({ ...config, activo: e.target.checked })}
          className="w-4 h-4 accent-marca-rojo"
        />
        <span className="text-marca-texto text-sm font-bold">Activar bono por publicar en Historias</span>
      </label>

      <div className="max-w-[200px]">
        <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">
          Puntos por día publicado
        </label>
        <input
          type="number"
          min={0}
          value={config.puntos}
          onChange={(e) => setConfig({ ...config, puntos: Number(e.target.value) })}
          className="w-full p-2.5 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={guardar}
          disabled={guardando}
          className="bg-marca-rojo hover:bg-marca-rojoclaro disabled:opacity-50 text-marca-textofuerte font-black py-2.5 px-4 rounded-[3px] text-[11px] tracking-widest uppercase transition"
        >
          {guardando ? "Guardando..." : "Guardar"}
        </button>
        {mensaje && (
          <p className={`text-[11px] font-bold ${mensaje.exito ? "text-emerald-400" : "text-marca-rojoclaro"}`}>
            {mensaje.texto}
          </p>
        )}
      </div>
    </div>
  );
}
