"use client";

import { useCallback, useEffect, useState } from "react";
import { WifiOff, RefreshCw } from "lucide-react";
import { marcarLlegadaTienda, marcarSalidaTienda } from "./supervisor/actions";
import { marcarLlegadaEvento, marcarSalidaEvento } from "./anuncios-actions";
import {
  obtenerMarcacionesPendientes,
  quitarMarcacionPendiente,
  suscribirseACambiosDeCola,
  type MarcacionPendiente,
} from "@/lib/cola-marcaciones";

async function enviarPendiente(item: MarcacionPendiente): Promise<{ exito: boolean }> {
  switch (item.accion) {
    case "llegada-tienda":
      return marcarLlegadaTienda(item.rutaActivaId ?? null, item.reporteId ?? null, item.lat, item.lng, item.foto, item.horaCapturadaMs);
    case "salida-tienda":
      return marcarSalidaTienda(item.rutaActivaId ?? null, item.reporteId ?? null, item.lat, item.lng, item.foto, item.horaCapturadaMs);
    case "llegada-evento":
      return marcarLlegadaEvento(item.comunicadoId!, item.lat, item.lng, item.foto, item.horaCapturadaMs);
    case "salida-evento":
      return marcarSalidaEvento(item.comunicadoId!, item.lat, item.lng, item.foto, item.horaCapturadaMs);
  }
}

// Vive montado una sola vez en PanelShell (todos los portales) -- reenvía
// sola cualquier marcación de ingreso/salida que haya quedado pendiente por
// falta de señal (típico en los estacionamientos subterráneos de los
// centros comerciales), apenas el celular recupera la conexión. Usa la hora
// que el propio celular capturó al momento del intento, no la hora en que
// por fin logra sincronizar -- ver lib/marcacion-offline.ts.
export default function SincronizadorOffline() {
  const [pendientes, setPendientes] = useState<MarcacionPendiente[]>([]);
  const [sincronizando, setSincronizando] = useState(false);

  const actualizar = useCallback(() => {
    setPendientes(obtenerMarcacionesPendientes());
  }, []);

  const sincronizar = useCallback(async () => {
    const lista = obtenerMarcacionesPendientes();
    if (lista.length === 0) return;
    setSincronizando(true);
    for (const item of lista) {
      try {
        const resultado = await enviarPendiente(item);
        if (resultado?.exito) {
          quitarMarcacionPendiente(item.id);
        }
      } catch {
        // Sigue sin señal -- se deja en la cola para el próximo intento.
        break;
      }
    }
    setSincronizando(false);
    actualizar();
  }, [actualizar]);

  useEffect(() => {
    actualizar();
    const desuscribir = suscribirseACambiosDeCola(actualizar);
    window.addEventListener("online", sincronizar);
    // Reintento periódico además del evento "online" -- en varios celulares
    // (sobre todo iOS) ese evento no siempre dispara al recuperar señal.
    const intervalo = setInterval(sincronizar, 30000);
    sincronizar();
    return () => {
      desuscribir();
      window.removeEventListener("online", sincronizar);
      clearInterval(intervalo);
    };
  }, [actualizar, sincronizar]);

  if (pendientes.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 rounded-full border border-amber-500/50 bg-marca-superficie py-1.5 pl-3 pr-1.5 shadow-lg">
      <WifiOff className="w-3.5 h-3.5 shrink-0 text-amber-400" />
      <p className="text-[11px] font-bold text-amber-300">
        {pendientes.length} marcación{pendientes.length === 1 ? "" : "es"} pendiente
        {pendientes.length === 1 ? "" : "s"} por enviar
      </p>
      <button
        type="button"
        onClick={sincronizar}
        disabled={sincronizando}
        aria-label="Reintentar ahora"
        className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/15 text-amber-400 disabled:opacity-50"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${sincronizando ? "animate-spin" : ""}`} />
      </button>
    </div>
  );
}
