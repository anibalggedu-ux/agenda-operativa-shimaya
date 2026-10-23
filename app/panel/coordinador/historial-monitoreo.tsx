"use client";

import { useEffect, useState } from "react";
import { Camera } from "lucide-react";
import { obtenerAsistenciaGeneral, type AsistenciaGeneral } from "./actions";
import { formatearFechaLegible, formatearHora, hoyPeru, inicioMesPeru } from "@/lib/fechas";

function SelectorFechas({
  desde,
  hasta,
  onDesde,
  onHasta,
}: {
  desde: string;
  hasta: string;
  onDesde: (v: string) => void;
  onHasta: (v: string) => void;
}) {
  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <div className="flex-1">
        <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">Desde</label>
        <input
          type="date"
          value={desde}
          max={hasta}
          onChange={(e) => onDesde(e.target.value)}
          className="w-full p-2.5 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro"
        />
      </div>
      <div className="flex-1">
        <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">Hasta</label>
        <input
          type="date"
          value={hasta}
          min={desde}
          onChange={(e) => onHasta(e.target.value)}
          className="w-full p-2.5 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro"
        />
      </div>
    </div>
  );
}

function Marcacion({
  hora,
  ubicacion,
  fotoUrl,
}: {
  hora: string | null;
  ubicacion: string | null;
  fotoUrl?: string | null;
}) {
  if (!hora) return <span className="text-marca-tenue">—</span>;
  return (
    <>
      {ubicacion ? (
        <a
          href={ubicacion}
          target="_blank"
          rel="noopener noreferrer"
          className="text-marca-rojoclaro hover:text-marca-rojo underline font-bold"
        >
          {formatearHora(hora)}
        </a>
      ) : (
        <span>{formatearHora(hora)}</span>
      )}
      {fotoUrl && (
        <a href={fotoUrl} target="_blank" rel="noopener noreferrer" className="ml-1 inline-flex" title="Ver foto">
          <Camera className="w-3 h-3" />
        </a>
      )}
    </>
  );
}

export default function HistorialMonitoreo() {
  const [desde, setDesde] = useState(inicioMesPeru());
  const [hasta, setHasta] = useState(hoyPeru());
  const [busqueda, setBusqueda] = useState("");

  const [asistencia, setAsistencia] = useState<AsistenciaGeneral[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Un rango largo puede traer cientos de marcaciones -- se muestran de a
  // tandas en vez de todas de una, aunque igual quepan en el scroll interno.
  const PASO_PAGINA = 25;
  const [mostrar, setMostrar] = useState(PASO_PAGINA);

  useEffect(() => {
    setCargando(true);
    setError(null);
    setMostrar(PASO_PAGINA);
    obtenerAsistenciaGeneral(desde, hasta)
      .then(setAsistencia)
      .catch((e) => setError(e.message || "Error al cargar el monitoreo operativo."))
      .finally(() => setCargando(false));
  }, [desde, hasta]);

  const filtrada = busqueda.trim()
    ? asistencia.filter((a) => a.usuarioNombre.toLowerCase().includes(busqueda.trim().toLowerCase()))
    : asistencia;

  return (
    <div className="space-y-6">
      <div className="bg-marca-superficie border border-marca-borde rounded-[3px] p-4 space-y-3">
        <SelectorFechas desde={desde} hasta={hasta} onDesde={setDesde} onHasta={setHasta} />
        <div>
          <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">
            Buscar por nombre
          </label>
          <input
            type="text"
            value={busqueda}
            onChange={(e) => {
              setBusqueda(e.target.value);
              setMostrar(PASO_PAGINA);
            }}
            placeholder="Ej. Freddy"
            className="w-full p-2.5 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro"
          />
        </div>
      </div>

      <p className="text-marca-tenue text-[11px] italic">
        ¿Buscas el ranking de tiendas visitadas? Se movió a Central Analítica → pestaña Tiendas, para no
        repetirlo en dos lugares con selectores de fecha independientes.
      </p>

      {error && <p className="text-marca-rojoclaro text-sm">{error}</p>}
      {cargando && <p className="text-marca-tenue text-sm animate-pulse">Cargando monitoreo operativo...</p>}

      {!cargando && !error && (
        <div>
          <h3 className="text-xs font-black tracking-widest text-marca-tenue mb-3">
            REGISTROS DE ASISTENCIA ({filtrada.length})
          </h3>
          {filtrada.length === 0 ? (
            <p className="text-marca-tenue text-sm italic">
              {busqueda.trim() ? "Nadie con ese nombre en este rango de fechas." : "Sin marcaciones en este rango de fechas."}
            </p>
          ) : (
            <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
              {filtrada.slice(0, mostrar).map((a, i) => (
                <div
                  key={i}
                  className={`flex items-center justify-between rounded-[3px] p-3 border gap-3 ${
                    a.tarde ? "border-marca-rojo/40 bg-marca-rojo/10" : "border-marca-borde bg-marca-superficie"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-marca-textofuerte font-bold text-sm truncate">{a.usuarioNombre}</p>
                    <p className="text-marca-tenue text-[11px] uppercase">{a.rol}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-marca-tenue text-[11px] capitalize">
                      {formatearFechaLegible(a.fecha)}
                    </p>
                    <p className={`text-xs font-bold ${a.tarde ? "text-marca-rojoclaro" : "text-marca-texto"}`}>
                      Ingreso:{" "}
                      <Marcacion
                        hora={a.horaIngreso}
                        ubicacion={a.ubicacionIngreso}
                        fotoUrl={a.fotoIngresoUrl}
                      />
                      {a.tarde ? " (TARDE)" : ""} · Salida:{" "}
                      <Marcacion hora={a.horaSalida} ubicacion={a.ubicacionSalida} fotoUrl={a.fotoSalidaUrl} />
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
          {filtrada.length > mostrar && (
            <button
              type="button"
              onClick={() => setMostrar((m) => m + PASO_PAGINA)}
              className="w-full mt-2 text-marca-rojoclaro hover:text-marca-rojo text-[11px] font-bold uppercase tracking-widest py-2 border border-marca-borde rounded-[3px] transition"
            >
              Mostrar {Math.min(PASO_PAGINA, filtrada.length - mostrar)} más ({filtrada.length - mostrar} restantes)
            </button>
          )}
        </div>
      )}
    </div>
  );
}
