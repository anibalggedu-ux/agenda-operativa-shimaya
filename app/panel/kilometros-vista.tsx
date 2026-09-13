"use client";

import { useEffect, useState } from "react";
import { obtenerResumenKilometros, type ResumenKilometros } from "./kilometros-actions";
import { formatearMinutos } from "@/lib/distancia";

export default function KilometrosVista({
  desde,
  hasta,
  mostrarDetalle = false,
}: {
  desde: string;
  hasta: string;
  // El detalle por trayecto (casa → tienda) es para uso administrativo
  // (p. ej. calcular reembolsos de movilidad) — en la vista de ranking no
  // hace falta.
  mostrarDetalle?: boolean;
}) {
  const [datos, setDatos] = useState<ResumenKilometros | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCargando(true);
    setError(null);
    obtenerResumenKilometros(desde, hasta)
      .then(setDatos)
      .catch((e) => setError(e.message || "Error al calcular kilómetros."))
      .finally(() => setCargando(false));
  }, [desde, hasta]);

  if (cargando) {
    return <p className="text-marca-tenue text-sm animate-pulse">Calculando rutas...</p>;
  }
  if (error) {
    return <p className="text-marca-rojoclaro text-sm">{error}</p>;
  }
  if (!datos || datos.filas.length === 0) {
    return (
      <p className="text-marca-tenue text-sm italic">
        No hay visitas registradas en este rango, o falta cargar direcciones (Registro → Ubicación
        de tiendas / Dirección de colaboradores).
      </p>
    );
  }

  const totalSinCalcular = datos.filas.reduce((s, f) => s + f.visitasSinCalcular, 0);

  return (
    <div className="space-y-3">
      {datos.filas.map((f, i) => (
        <div
          key={f.usuarioId}
          className="flex items-center justify-between bg-marca-fondo border border-marca-borde rounded-[3px] p-3 gap-3"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-marca-tenue font-data text-xs w-5 shrink-0">{i + 1}</span>
            <div className="min-w-0">
              <p className="text-marca-textofuerte font-bold text-sm truncate">{f.usuarioNombre}</p>
              <p className="text-marca-tenue text-[10px] uppercase">
                {f.rol} · {f.totalVisitas} visita{f.totalVisitas === 1 ? "" : "s"}
              </p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-marca-rojoclaro font-black text-sm">{f.totalKm} km</p>
            <p className="text-marca-tenue text-[10px]">≈ {formatearMinutos(f.totalMinutos)} manejando</p>
          </div>
        </div>
      ))}

      {totalSinCalcular > 0 && (
        <p className="text-amber-400 text-[11px]">
          ⚠️ {totalSinCalcular} visita{totalSinCalcular === 1 ? "" : "s"} no se pudo calcular por
          falta de dirección (del colaborador o de la tienda) — cárgalas en Registro.
        </p>
      )}

      {mostrarDetalle && datos.detalle.length > 0 && (
        <div className="mt-4">
          <h4 className="text-xs font-black tracking-widest text-marca-tenue mb-2">
            DETALLE POR TRAYECTO
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-marca-tenue text-[10px] uppercase text-left">
                  <th className="py-1.5 pr-3">Colaborador</th>
                  <th className="py-1.5 pr-3">Trayecto</th>
                  <th className="py-1.5 pr-3 text-right">Km (ida)</th>
                  <th className="py-1.5 pr-3 text-right">Tiempo (ida)</th>
                  <th className="py-1.5 pr-3 text-right">Visitas</th>
                  <th className="py-1.5 text-right">Km acumulado</th>
                </tr>
              </thead>
              <tbody>
                {datos.detalle.map((d, i) => (
                  <tr key={i} className="border-t border-marca-borde">
                    <td className="py-1.5 pr-3 text-marca-texto whitespace-nowrap">{d.usuarioNombre}</td>
                    <td className="py-1.5 pr-3 text-marca-texto whitespace-nowrap">
                      {d.origenNombre ? (
                        <>
                          <span className="text-marca-tenue">{d.origenNombre} →</span> {d.tiendaNombre}
                        </>
                      ) : (
                        d.tiendaNombre
                      )}
                    </td>
                    <td className="py-1.5 pr-3 text-right text-marca-tenue">{d.km}</td>
                    <td className="py-1.5 pr-3 text-right text-marca-tenue whitespace-nowrap">
                      {formatearMinutos(d.minutos)}
                    </td>
                    <td className="py-1.5 pr-3 text-right text-marca-tenue">{d.visitas}</td>
                    <td className="py-1.5 text-right text-marca-textofuerte font-bold">{d.kmAcumulado}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
