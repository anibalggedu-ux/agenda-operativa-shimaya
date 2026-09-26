"use client";

import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import {
  obtenerNotificaciones,
  obtenerNotificacionesPendientes,
  marcarNotificacionesVistas,
  type NotificacionItem,
} from "./social-actions";
import { reproducirSonidoLogro, reproducirSonidoNotificacion } from "@/lib/sonido";
import { marcarActividad } from "../presencia-actions";

// Cada cuánto se fija si hay algo nuevo mientras la persona tiene la app
// abierta -- no es tiempo real (no hay websockets), pero alcanza para que
// el sonido y el numerito se sientan "vivos" sin tener que recargar.
const INTERVALO_REVISION_MS = 45_000;

function tiempoRelativo(iso: string): string {
  const minutos = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutos < 1) return "recién";
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  return `hace ${dias} d`;
}

export default function CampanaNotificaciones() {
  const [pendientes, setPendientes] = useState(0);
  const [items, setItems] = useState<NotificacionItem[]>([]);
  const [abierta, setAbierta] = useState(false);
  const pendientesRef = useRef(0);
  const contenedorRef = useRef<HTMLDivElement>(null);

  function revisar() {
    // De paso marca "En línea" (solo si la pantalla está a la vista).
    if (document.visibilityState === "visible") marcarActividad().catch(() => {});
    obtenerNotificacionesPendientes()
      .then((n) => {
        // Si entre lo nuevo hay un regalo de puntos, suena "logro"; si no,
        // la notificación de siempre.
        if (n > pendientesRef.current) {
          obtenerNotificaciones(n)
            .then((lista) => {
              if (lista.some((it) => it.mensaje.startsWith("te regaló"))) reproducirSonidoLogro();
              else reproducirSonidoNotificacion();
            })
            .catch(() => reproducirSonidoNotificacion());
        }
        pendientesRef.current = n;
        setPendientes(n);
      })
      .catch(() => {});
  }

  useEffect(() => {
    revisar();
    const intervalo = setInterval(revisar, INTERVALO_REVISION_MS);
    // Al volver a la app (desbloquear el celular), marcar al tiro.
    const alVolver = () => {
      if (document.visibilityState === "visible") marcarActividad().catch(() => {});
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", alVolver);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function alHacerClickFuera(e: MouseEvent) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) {
        setAbierta(false);
      }
    }
    if (abierta) document.addEventListener("mousedown", alHacerClickFuera);
    return () => document.removeEventListener("mousedown", alHacerClickFuera);
  }, [abierta]);

  async function alAbrir() {
    const yaAbierta = abierta;
    setAbierta(!yaAbierta);
    if (yaAbierta) return;

    obtenerNotificaciones().then(setItems).catch(() => {});
    if (pendientesRef.current > 0) {
      await marcarNotificacionesVistas().catch(() => {});
      pendientesRef.current = 0;
      setPendientes(0);
    }
  }

  return (
    <div className="relative" ref={contenedorRef}>
      <button
        type="button"
        onClick={alAbrir}
        aria-label="Notificaciones"
        className="relative bg-marca-superficie2 border border-marca-borde text-marca-tenue w-9 h-9 rounded-[3px] hover:text-marca-texto transition shrink-0 flex items-center justify-center"
      >
        <Bell className="w-4 h-4" />
        {pendientes > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] px-1 flex items-center justify-center rounded-full bg-marca-rojo text-white text-[9px] font-black">
            {pendientes > 9 ? "9+" : pendientes}
          </span>
        )}
      </button>

      {abierta && (
        <div className="fixed right-3 left-3 sm:left-auto top-16 z-40 sm:w-80 max-h-[70vh] overflow-y-auto bg-marca-superficie2 border border-marca-borde rounded-[3px] shadow-lg">
          <p className="px-3 py-2.5 border-b border-marca-borde text-[11px] font-black tracking-widest text-marca-tenue">
            NOTIFICACIONES
          </p>
          {items.length === 0 ? (
            <p className="px-3 py-4 text-marca-tenue text-xs">No tienes notificaciones nuevas.</p>
          ) : (
            items.map((n) => (
              <div key={n.id} className="px-3 py-2.5 border-b border-marca-borde last:border-b-0 text-xs bg-marca-rojo/5">
                <p className="text-marca-texto">
                  <span className="font-bold">{n.usuarioNombre}</span> <span className="text-marca-tenue">{n.mensaje}</span>
                </p>
                <p className="text-marca-tenue text-[10px] mt-0.5">{tiempoRelativo(n.creadoEn)}</p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
