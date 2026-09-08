"use client";

import { useEffect, useState } from "react";
import {
  obtenerTiendasPermanentes,
  obtenerUsuariosYTiendas,
  asignarTiendaPermanente,
  eliminarTiendaPermanente,
  type SupervisorConTiendas,
  type TiendaBasica,
} from "./actions";
import { MAX_TIENDAS_PERMANENTES } from "./constantes";

export default function TiendasPermanentes() {
  const [filas, setFilas] = useState<SupervisorConTiendas[]>([]);
  const [tiendas, setTiendas] = useState<TiendaBasica[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usuarioAbierto, setUsuarioAbierto] = useState<string | null>(null);
  const [tiendaElegida, setTiendaElegida] = useState<Record<string, string>>({});
  const [mensaje, setMensaje] = useState<Record<string, string>>({});

  function cargar() {
    setCargando(true);
    Promise.all([obtenerTiendasPermanentes(), obtenerUsuariosYTiendas()])
      .then(([filas, { tiendas }]) => {
        setFilas(filas);
        setTiendas(tiendas);
      })
      .catch((e) => setError(e.message || "Error al cargar tiendas permanentes."))
      .finally(() => setCargando(false));
  }

  useEffect(() => {
    cargar();
  }, []);

  async function handleAgregar(usuarioId: string) {
    const tiendaId = tiendaElegida[usuarioId];
    if (!tiendaId) return;
    const resultado = await asignarTiendaPermanente(usuarioId, tiendaId);
    if (!resultado.exito) {
      setMensaje((prev) => ({ ...prev, [usuarioId]: resultado.mensaje || "Error" }));
      return;
    }
    setMensaje((prev) => ({ ...prev, [usuarioId]: "" }));
    setUsuarioAbierto(null);
    cargar();
  }

  async function handleQuitar(id: string) {
    await eliminarTiendaPermanente(id);
    cargar();
  }

  if (cargando) {
    return <p className="text-slate-500 text-sm animate-pulse">Cargando tiendas permanentes...</p>;
  }
  if (error) return <p className="text-red-400 text-sm">{error}</p>;

  return (
    <div>
      <h3 className="text-xs font-black tracking-widest text-slate-300 mb-1">
        TIENDAS PERMANENTES
      </h3>
      <p className="text-slate-500 text-[11px] mb-3">
        Hasta {MAX_TIENDAS_PERMANENTES} tiendas fijas por supervisor/capacitador.
      </p>
      <div className="space-y-2">
        {filas.map((f) => {
          const disponibles = tiendas.filter((t) => !f.tiendas.some((ft) => ft.tiendaId === t.id));
          const lleno = f.tiendas.length >= MAX_TIENDAS_PERMANENTES;
          return (
            <div key={f.usuarioId} className="bg-[#0f111a] border border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p className="text-white font-bold text-sm">{f.usuarioNombre}</p>
                  <p className="text-slate-500 text-[11px] uppercase">{f.rol}</p>
                </div>
                {!lleno && (
                  <button
                    onClick={() =>
                      setUsuarioAbierto(usuarioAbierto === f.usuarioId ? null : f.usuarioId)
                    }
                    className="text-red-400 hover:text-red-300 text-[11px] font-bold uppercase"
                  >
                    + Agregar tienda
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-2 mt-3">
                {f.tiendas.length === 0 ? (
                  <span className="text-slate-600 text-xs italic">Sin tiendas permanentes.</span>
                ) : (
                  f.tiendas.map((t) => (
                    <span
                      key={t.id}
                      className="bg-green-950/30 border border-green-700/40 text-green-300 text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-2"
                    >
                      {t.tiendaNombre}
                      <button
                        onClick={() => handleQuitar(t.id)}
                        className="text-green-500 hover:text-red-400"
                        aria-label={`Quitar ${t.tiendaNombre}`}
                      >
                        ×
                      </button>
                    </span>
                  ))
                )}
              </div>

              {usuarioAbierto === f.usuarioId && (
                <div className="flex items-center gap-2 mt-3">
                  <select
                    value={tiendaElegida[f.usuarioId] ?? ""}
                    onChange={(e) =>
                      setTiendaElegida((prev) => ({ ...prev, [f.usuarioId]: e.target.value }))
                    }
                    className="flex-1 p-2 bg-[#0d1117] border border-slate-800 rounded-lg text-white text-sm outline-none focus:border-red-500"
                  >
                    <option value="">Selecciona una tienda...</option>
                    {disponibles.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nombre}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleAgregar(f.usuarioId)}
                    className="bg-red-600 hover:bg-red-500 text-white font-black py-2 px-4 rounded-lg text-[11px] tracking-widest uppercase transition"
                  >
                    Guardar
                  </button>
                </div>
              )}

              {mensaje[f.usuarioId] && (
                <p className="text-yellow-400 text-xs font-bold mt-2">{mensaje[f.usuarioId]}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
