"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Clock } from "lucide-react";
import {
  obtenerMarcacionesBreakEquipo,
  obtenerPendientesBreakEquipo,
  type BreakEquipoItem,
  type BreakPendiente,
} from "../break-actions";
import { hoyPeru } from "@/lib/fechas";

function horaATexto(horaHHMMSS: string): string {
  const [h, m] = horaHHMMSS.split(":").map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

function Foto({ url, rota }: { url: string | null; rota: boolean }) {
  if (!url) {
    return (
      <div className="flex-1 h-24 rounded-lg border border-dashed border-marca-borde flex items-center justify-center">
        <p className="text-[10px] text-marca-tenue">Sin foto</p>
      </div>
    );
  }
  return (
    <img
      src={url}
      alt=""
      className={`flex-1 h-24 rounded-lg object-cover border ${rota ? "border-marca-rojo/40" : "border-marca-borde"}`}
    />
  );
}

export default function MarcacionesBreakEquipo() {
  const [fecha, setFecha] = useState(hoyPeru());
  const [items, setItems] = useState<BreakEquipoItem[] | null>(null);
  const [pendientes, setPendientes] = useState<BreakPendiente[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setItems(null);
    setPendientes(null);
    setError(null);
    obtenerMarcacionesBreakEquipo(fecha)
      .then(setItems)
      .catch((e) => setError(e?.message || "No se pudo cargar las marcaciones de break."));
    obtenerPendientesBreakEquipo(fecha)
      .then(setPendientes)
      .catch(() => setPendientes([]));
  }, [fecha]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-black uppercase tracking-widest text-marca-tenue">Fecha</span>
          <input
            type="date"
            value={fecha}
            max={hoyPeru()}
            onChange={(e) => setFecha(e.target.value)}
            className="bg-marca-superficie border border-marca-borde rounded-[3px] px-3 py-2 text-sm text-marca-texto outline-none focus:border-marca-rojoclaro"
          />
        </label>
      </div>

      {error && (
        <p className="flex items-center gap-1.5 text-marca-rojoclaro text-xs font-bold">
          <AlertTriangle className="w-3.5 h-3.5" /> {error}
        </p>
      )}

      {pendientes !== null && pendientes.length > 0 && (
        <div className="bg-marca-superficie rounded-2xl border border-marca-oro/30 p-3.5">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-oro shrink-0" />
            <p className="text-[11px] font-black tracking-widest text-oro uppercase">
              Todavía no marcan ({pendientes.length})
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {pendientes.map((p) => (
              <span
                key={p.usuarioId}
                className="text-[11px] text-marca-texto bg-marca-superficie2 border border-marca-borde rounded-full px-2.5 py-1"
              >
                {p.usuarioNombre}
              </span>
            ))}
          </div>
        </div>
      )}

      {!error && items === null && <p className="text-marca-tenue text-sm">Cargando...</p>}

      {items !== null && items.length === 0 && (
        <p className="text-marca-tenue text-sm">Nadie marcó un break este día.</p>
      )}

      <div className="space-y-3">
        {(items ?? []).map((b) => (
          <div
            key={b.id}
            className="bg-marca-superficie rounded-2xl border border-marca-borde overflow-hidden"
            style={{
              borderLeft: `4px solid ${
                b.noSalio ? "rgb(139 141 146)" : b.enCurso ? "rgb(217 178 106)" : b.sePaso ? "rgb(211 30 43)" : "rgb(74 222 128)"
              }`,
            }}
          >
            <div className="px-3.5 pt-3 flex items-center justify-between">
              <p className="text-marca-textofuerte font-black text-sm">{b.usuarioNombre}</p>
              {b.noSalio ? (
                <span className="text-[10px] font-black text-marca-tenue uppercase">No salió</span>
              ) : b.enCurso ? (
                <span className="text-[10px] font-black text-oro uppercase">En break</span>
              ) : b.sePaso ? (
                <span className="text-[10px] font-black text-marca-rojoclaro uppercase">+{b.minutosPasados} min</span>
              ) : (
                <span className="text-[10px] font-black text-emerald-400 uppercase">A tiempo</span>
              )}
            </div>
            {b.noSalio ? (
              <p className="px-3.5 pb-3.5 pt-2 text-[11px] text-marca-tenue">Quedó registrado que no salió a break este día.</p>
            ) : (
              <div className="px-3.5 pb-3.5 pt-2 flex gap-2.5">
                <div className="flex-1 flex flex-col gap-1">
                  <Foto url={b.fotoSalidaUrl} rota={false} />
                  <p className="text-[10px] text-marca-tenue text-center">
                    Salida · {b.horaSalida ? horaATexto(b.horaSalida) : "—"}
                  </p>
                </div>
                <div className="flex-1 flex flex-col gap-1">
                  {b.enCurso ? (
                    <div className="h-24 rounded-lg border border-dashed border-marca-oro/40 flex items-center justify-center">
                      <p className="text-[10px] text-marca-tenue">Esperando entrada…</p>
                    </div>
                  ) : (
                    <Foto url={b.fotoEntradaUrl} rota={b.sePaso} />
                  )}
                  <p className={`text-[10px] text-center ${b.sePaso ? "text-marca-rojoclaro font-bold" : "text-marca-tenue"}`}>
                    Entrada · {b.horaEntrada ? horaATexto(b.horaEntrada) : "—"}
                  </p>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
