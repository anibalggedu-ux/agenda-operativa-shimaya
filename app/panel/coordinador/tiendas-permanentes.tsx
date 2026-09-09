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
    return <p className="text-marca-tenue text-sm animate-pulse">Cargando tiendas permanentes...</p>;
  }
  if (error) return <p className="text-marca-rojoclaro text-sm">{error}</p>;

  return (
    <div>
      <h3 className="text-xs font-black tracking-widest text-marca-tenue mb-1">
        TIENDAS PERMANENTES
      </h3>
      <p className="text-marca-tenue text-[11px] mb-3">
        Hasta {MAX_TIENDAS_PERMANENTES} tiendas fijas por supervisor/capacitador.
      </p>
      <div className="space-y-2">
        {filas.map((f) => {
          const disponibles = tiendas.filter((t) => !f.tiendas.some((ft) => ft.tiendaId === t.id));
          const lleno = f.tiendas.length >= MAX_TIENDAS_PERMANENTES;
          return (
            <div key={f.usuarioId} className="bg-marca-superficie border border-marca-borde rounded-[3px] p-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p className="text-marca-textofuerte font-bold text-sm">{f.usuarioNombre}</p>
                  <p className="text-marca-tenue text-[11px] uppercase">{f.rol}</p>
                </div>
                {!lleno && (
                  <button
                    onClick={() =>
                      setUsuarioAbierto(usuarioAbierto === f.usuarioId ? null : f.usuarioId)
                    }
                    className="text-marca-rojoclaro hover:text-marca-rojo text-[11px] font-bold uppercase"
                  >
                    + Agregar tienda
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-2 mt-3">
                {f.tiendas.length === 0 ? (
                  <span className="text-marca-tenue text-xs italic">Sin tiendas permanentes.</span>
                ) : (
                  f.tiendas.map((t) => (
                    <span
                      key={t.id}
                      className="bg-emerald-950/30 border border-emerald-700/40 text-emerald-300 text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-2"
                    >
                      {t.tiendaNombre}
                      <button
                        onClick={() => handleQuitar(t.id)}
                        className="text-emerald-500 hover:text-marca-rojoclaro"
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
                    className="flex-1 p-2 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro"
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
                    className="bg-marca-rojo hover:bg-marca-rojoclaro text-marca-textofuerte font-black py-2 px-4 rounded-[3px] text-[11px] tracking-widest uppercase transition"
                  >
                    Guardar
                  </button>
                </div>
              )}

              {mensaje[f.usuarioId] && (
                <p className="text-marca-rojoclaro text-xs font-bold mt-2">{mensaje[f.usuarioId]}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
