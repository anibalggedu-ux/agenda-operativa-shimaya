"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { obtenerMapaOperativoHoy, type MapaOperativoHoy, type PersonaEnMapa } from "./actions";
import { formatearFechaLegible } from "@/lib/fechas";
import { UMBRAL_LEJOS_METROS } from "@/lib/distancia-recta";

// Texto del chip de aviso cuando el GPS de la marcación quedó lejos de la
// tienda — el pin sigue siendo la dirección real de la tienda, esto solo
// avisa junto al nombre de la persona en el popup.
function textoLejos(p: PersonaEnMapa): string | null {
  if (p.distanciaMetros === null || p.distanciaMetros <= UMBRAL_LEJOS_METROS) return null;
  const texto = p.distanciaMetros >= 1000 ? `${(p.distanciaMetros / 1000).toFixed(1)} km` : `${p.distanciaMetros} m`;
  return `⚠️ marcó a ${texto}`;
}

const COLOR_ROL: Record<string, string> = { supervisor: "#e23744", capacitador: "#fbbf24" };
const ETIQUETA_ROL: Record<string, string> = { supervisor: "Supervisor", capacitador: "Capacitador" };
const COLOR_MULTIPLE = "#f7f5f2";
// Los eventos/reuniones se marcan como un rombo celeste -- distinto en forma
// Y color a las tiendas (círculos rojo/ámbar), para no confundir "una tienda
// con un solo capacitador" con "una reunión".
const COLOR_EVENTO = "#60a5fa";

// Centro aproximado de Lima Metropolitana — punto de partida antes de
// ajustar el zoom a las tiendas con actividad hoy.
const CENTRO_LIMA: [number, number] = [-12.06, -77.03];

export default function MapaOperativo() {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<any>(null);
  const [datos, setDatos] = useState<MapaOperativoHoy | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    obtenerMapaOperativoHoy()
      .then(setDatos)
      .catch((e) => setError(e.message || "No se pudo cargar el mapa operativo."))
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => {
    if (!datos || !contenedorRef.current) return;
    let cancelado = false;

    import("leaflet").then((L) => {
      if (cancelado || !contenedorRef.current) return;

      // Si ya existe un mapa de un render previo (ej. al recargar datos), se
      // destruye antes de crear uno nuevo — Leaflet no permite reinicializar
      // el mismo contenedor.
      mapaRef.current?.remove();

      const mapa = L.map(contenedorRef.current, { scrollWheelZoom: true }).setView(CENTRO_LIMA, 11);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; colaboradores de <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18,
      }).addTo(mapa);

      const bounds: [number, number][] = [];

      datos.tiendas.forEach((t) => {
        const multiple = t.personas.length > 1;
        const color = multiple ? COLOR_MULTIPLE : COLOR_ROL[t.personas[0]?.rol] ?? "#8b8d92";

        const marcador = L.circleMarker([t.lat, t.lon], {
          radius: multiple ? 12 : 9,
          color: "#0d0e10",
          weight: 2,
          fillColor: color,
          fillOpacity: 0.95,
        }).addTo(mapa);

        const listaPersonas = t.personas
          .map((p) => {
            const aviso = textoLejos(p);
            return (
              `<div style="margin-top:4px;display:flex;align-items:flex-start;gap:6px;">` +
              `<span style="width:8px;height:8px;border-radius:50%;background:${COLOR_ROL[p.rol] ?? "#8b8d92"};flex:none;margin-top:4px;"></span>` +
              `<div><div><b>${p.usuarioNombre}</b> — ${ETIQUETA_ROL[p.rol] ?? p.rol}</div>` +
              (aviso
                ? `<div style="display:inline-block;margin-top:2px;background:#f59e0b26;color:#b45309;` +
                  `font-size:10px;font-weight:700;padding:2px 7px;border-radius:999px;">${aviso}</div>`
                : "") +
              `</div></div>`
            );
          })
          .join("");

        marcador.bindPopup(
          `<div style="font-family:sans-serif;min-width:190px;">` +
            `<div style="font-weight:700;margin-bottom:4px;">📍 ${t.tiendaNombre}</div>` +
            listaPersonas +
            `</div>`
        );

        bounds.push([t.lat, t.lon]);
      });

      datos.eventos.forEach((ev) => {
        const icono = L.divIcon({
          className: "",
          html:
            `<div style="width:16px;height:16px;background:${COLOR_EVENTO};border:2px solid #0d0e10;` +
            `transform:rotate(45deg);"></div>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        });

        const marcador = L.marker([ev.lat, ev.lon], { icon: icono }).addTo(mapa);

        const listaPersonas = ev.personas
          .map(
            (p) =>
              `<div style="margin-top:4px;display:flex;align-items:center;gap:6px;">` +
              `<span style="width:8px;height:8px;border-radius:50%;background:${COLOR_ROL[p.rol] ?? "#8b8d92"};flex:none;"></span>` +
              `<span><b>${p.usuarioNombre}</b> — ${ETIQUETA_ROL[p.rol] ?? p.rol}</span></div>`
          )
          .join("");

        marcador.bindPopup(
          `<div style="font-family:sans-serif;min-width:190px;">` +
            `<div style="font-weight:700;margin-bottom:4px;">📅 ${ev.mensaje}</div>` +
            listaPersonas +
            `</div>`
        );

        bounds.push([ev.lat, ev.lon]);
      });

      if (bounds.length > 0) {
        mapa.fitBounds(bounds as any, { padding: [40, 40], maxZoom: 14 });
      }

      mapaRef.current = mapa;
    });

    return () => {
      cancelado = true;
    };
  }, [datos]);

  useEffect(() => {
    return () => {
      mapaRef.current?.remove();
      mapaRef.current = null;
    };
  }, []);

  if (cargando) {
    return <p className="text-marca-tenue text-sm animate-pulse">Cargando mapa operativo...</p>;
  }
  if (error) {
    return <p className="text-marca-rojoclaro text-sm">{error}</p>;
  }
  if (!datos || (datos.tiendas.length === 0 && datos.eventos.length === 0)) {
    return (
      <p className="text-marca-tenue text-sm italic">
        Sin asignaciones ubicables hoy (falta cargar la dirección de la tienda, o nadie tiene ruta ni evento hoy).
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-marca-borde border border-marca-borde rounded-[3px] overflow-hidden">
        <div className="bg-marca-superficie p-3">
          <p className="text-marca-tenue text-[9.5px] uppercase font-bold">Colaboradores en campo</p>
          <p className="font-display text-xl text-marca-textofuerte">{datos.totalPersonas}</p>
        </div>
        <div className="bg-marca-superficie p-3">
          <p className="text-marca-tenue text-[9.5px] uppercase font-bold">Tiendas con visita hoy</p>
          <p className="font-display text-xl text-marca-textofuerte">{datos.tiendas.length}</p>
        </div>
        <div className="bg-marca-superficie p-3">
          <p className="text-marca-tenue text-[9.5px] uppercase font-bold">Eventos/reuniones hoy</p>
          <p className="font-display text-xl text-marca-textofuerte">{datos.eventos.length}</p>
        </div>
        <div className="bg-marca-superficie p-3">
          <p className="text-marca-tenue text-[9.5px] uppercase font-bold">Fecha</p>
          <p className="font-display text-sm text-marca-textofuerte capitalize mt-1">
            {formatearFechaLegible(datos.fecha)}
          </p>
        </div>
      </div>

      <div
        ref={contenedorRef}
        className="rounded-[3px] border border-marca-borde overflow-hidden"
        style={{ height: 480, width: "100%" }}
      />

      <div className="flex flex-wrap gap-4 text-[11.5px] text-marca-tenue">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: COLOR_ROL.supervisor }} />
          Supervisor
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: COLOR_ROL.capacitador }} />
          Capacitador
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="w-3 h-3 rounded-full inline-block border-2"
            style={{ background: COLOR_MULTIPLE, borderColor: "#8b8d92" }}
          />
          Varias personas en la misma tienda
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="w-2.5 h-2.5 inline-block border-2"
            style={{ background: COLOR_EVENTO, borderColor: "#0d0e10", transform: "rotate(45deg)" }}
          />
          Evento / reunión
        </span>
      </div>
    </div>
  );
}
