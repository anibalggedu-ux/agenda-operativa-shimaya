"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { obtenerMapaOperativoHoy, type MapaOperativoHoy, type PersonaEnMapa } from "./actions";
import { formatearFechaLegible } from "@/lib/fechas";
import { UMBRAL_LEJOS_METROS } from "@/lib/distancia-recta";

// Texto del chip de aviso cuando el pin SÍ es el GPS real de la marcación
// (ver p.esUbicacionReal) y quedó lejos de la tienda -- si todavía no marcó,
// el pin ya está en la tienda como respaldo y no hace falta avisar nada acá.
function textoLejos(p: PersonaEnMapa): string | null {
  if (!p.esUbicacionReal || p.distanciaMetros === null || p.distanciaMetros <= UMBRAL_LEJOS_METROS) return null;
  const texto = p.distanciaMetros >= 1000 ? `${(p.distanciaMetros / 1000).toFixed(1)} km` : `${p.distanciaMetros} m`;
  return `⚠️ marcó a ${texto}`;
}

const COLOR_ROL: Record<string, string> = { supervisor: "#e23744", capacitador: "#fbbf24" };
const ETIQUETA_ROL: Record<string, string> = { supervisor: "Supervisor", capacitador: "Capacitador" };

// Iniciales para el pin de quien todavía no tiene foto de perfil (ej. "Juan
// Pérez" -> "JP").
function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "")).toUpperCase();
}

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

      // Un pin por persona (no por tienda): cada quien aparece en su propia
      // ubicación -- la de su marcación de llegada si la trae, o si no la de
      // la tienda/evento como respaldo (ver esUbicacionReal). El pin es su
      // foto de perfil recortada en círculo; sin foto, sus iniciales sobre
      // el color de su rol.
      function iconoPersona(p: PersonaEnMapa): any {
        const color = COLOR_ROL[p.rol] ?? "#8b8d92";
        const contenido = p.fotoUrl
          ? `<img src="${p.fotoUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`
          : `<span style="font-size:11px;font-weight:700;color:#fff;">${iniciales(p.usuarioNombre)}</span>`;
        return L.divIcon({
          className: "",
          html:
            `<div style="width:34px;height:34px;border-radius:50%;border:2.5px solid ${color};` +
            `background:#0d0e10;display:flex;align-items:center;justify-content:center;overflow:hidden;` +
            `box-shadow:0 1px 4px rgba(0,0,0,.5);">${contenido}</div>`,
          iconSize: [34, 34],
          iconAnchor: [17, 17],
          popupAnchor: [0, -17],
        });
      }

      function popupPersona(p: PersonaEnMapa, lugarEmoji: string, lugarNombre: string): string {
        const aviso = textoLejos(p);
        const fotoGrande = p.fotoUrl
          ? `<img src="${p.fotoUrl}" style="width:52px;height:52px;border-radius:50%;object-fit:cover;flex:none;" />`
          : `<div style="width:52px;height:52px;border-radius:50%;background:${COLOR_ROL[p.rol] ?? "#8b8d92"};` +
            `display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;flex:none;">` +
            `${iniciales(p.usuarioNombre)}</div>`;
        return (
          `<div style="font-family:sans-serif;min-width:200px;display:flex;gap:10px;align-items:center;">` +
            fotoGrande +
            `<div>` +
              `<div style="font-weight:700;">${p.usuarioNombre}</div>` +
              `<div style="font-size:11px;color:#6b7280;">${ETIQUETA_ROL[p.rol] ?? p.rol}</div>` +
              `<div style="font-size:11px;margin-top:2px;">${lugarEmoji} ${lugarNombre}</div>` +
              (aviso
                ? `<div style="display:inline-block;margin-top:4px;background:#f59e0b26;color:#b45309;` +
                  `font-size:10px;font-weight:700;padding:2px 7px;border-radius:999px;">${aviso}</div>`
                : !p.esUbicacionReal
                ? `<div style="margin-top:4px;font-size:10px;color:#6b7280;font-style:italic;">Aún no marca llegada -- mostrando la ubicación de la tienda.</div>`
                : "") +
            `</div>` +
          `</div>`
        );
      }

      datos.tiendas.forEach((t) => {
        t.personas.forEach((p) => {
          L.marker([p.lat, p.lon], { icon: iconoPersona(p) })
            .addTo(mapa)
            .bindPopup(popupPersona(p, "📍", t.tiendaNombre));
          bounds.push([p.lat, p.lon]);
        });
      });

      datos.eventos.forEach((ev) => {
        ev.personas.forEach((p) => {
          L.marker([p.lat, p.lon], { icon: iconoPersona(p) })
            .addTo(mapa)
            .bindPopup(popupPersona(p, "📅", ev.mensaje));
          bounds.push([p.lat, p.lon]);
        });
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
      </div>
      <p className="text-marca-tenue text-[10.5px]">
        Cada pin es la foto de perfil (o iniciales) de esa persona, en el lugar donde marcó su llegada -- si
        todavía no marca, se muestra en la ubicación de la tienda o evento como respaldo.
      </p>
    </div>
  );
}
