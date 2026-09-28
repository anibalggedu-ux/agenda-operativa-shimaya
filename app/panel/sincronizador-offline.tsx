"use client";

import { useCallback, useEffect, useState } from "react";
import { WifiOff, RefreshCw } from "lucide-react";
import { marcarLlegadaTienda, marcarSalidaTienda } from "./supervisor/actions";
import { marcarLlegadaEvento, marcarSalidaEvento } from "./anuncios-actions";
import { guardarChecklistVisita } from "./checklist-visita-actions";
import {
  obtenerMarcacionesPendientes,
  quitarMarcacionPendiente,
  suscribirseACambiosDeCola,
  type MarcacionPendiente,
} from "@/lib/cola-marcaciones";
import {
  obtenerChecklistsPendientes,
  quitarChecklistPendiente,
  suscribirseACambiosDeColaChecklists,
  type ChecklistPendiente,
} from "@/lib/cola-checklists";

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

async function enviarChecklistPendiente(item: ChecklistPendiente): Promise<{ exito: boolean }> {
  const resultado = await guardarChecklistVisita(item.tiendaId, item.fecha, item.respuestas);
  return { exito: resultado.exito };
}

// Vive montado una sola vez en PanelShell (todos los portales) -- reenvía
// solas cualquier marcación de ingreso/salida y cualquier checklist de
// visita que hayan quedado pendientes por falta de señal (típico en los
// estacionamientos subterráneos de los centros comerciales, o en tiendas
// con poca cobertura), apenas el celular recupera la conexión. La
// marcación usa la hora que el propio celular capturó al momento del
// intento, no la hora en que por fin logra sincronizar -- ver
// lib/cola-marcaciones.ts y lib/cola-checklists.ts.
export default function SincronizadorOffline() {
  const [pendientes, setPendientes] = useState<MarcacionPendiente[]>([]);
  const [checklistsPendientes, setChecklistsPendientes] = useState<ChecklistPendiente[]>([]);
  const [sincronizando, setSincronizando] = useState(false);

  const actualizar = useCallback(() => {
    setPendientes(obtenerMarcacionesPendientes());
    setChecklistsPendientes(obtenerChecklistsPendientes());
  }, []);

  const sincronizar = useCallback(async () => {
    const lista = obtenerMarcacionesPendientes();
    const listaChecklists = obtenerChecklistsPendientes();
    if (lista.length === 0 && listaChecklists.length === 0) return;
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
    for (const item of listaChecklists) {
      try {
        const resultado = await enviarChecklistPendiente(item);
        if (resultado?.exito) {
          quitarChecklistPendiente(item.id);
        }
      } catch {
        break;
      }
    }
    setSincronizando(false);
    actualizar();
  }, [actualizar]);

  useEffect(() => {
    actualizar();
    const desuscribir = suscribirseACambiosDeCola(actualizar);
    const desuscribirChecklists = suscribirseACambiosDeColaChecklists(actualizar);
    window.addEventListener("online", sincronizar);
    // Reintento periódico además del evento "online" -- en varios celulares
    // (sobre todo iOS) ese evento no siempre dispara al recuperar señal.
    const intervalo = setInterval(sincronizar, 30000);
    sincronizar();
    return () => {
      desuscribir();
      desuscribirChecklists();
      window.removeEventListener("online", sincronizar);
      clearInterval(intervalo);
    };
  }, [actualizar, sincronizar]);

  const total = pendientes.length + checklistsPendientes.length;
  if (total === 0) return null;

  const etiqueta =
    pendientes.length > 0 && checklistsPendientes.length > 0
      ? `${total} pendientes por enviar`
      : pendientes.length > 0
        ? `${pendientes.length} marcación${pendientes.length === 1 ? "" : "es"} pendiente${pendientes.length === 1 ? "" : "s"} por enviar`
        : `${checklistsPendientes.length} checklist${checklistsPendientes.length === 1 ? "" : "s"} pendiente${checklistsPendientes.length === 1 ? "" : "s"} por enviar`;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 rounded-full border border-amber-500/50 bg-marca-superficie py-1.5 pl-3 pr-1.5 shadow-lg">
      <WifiOff className="w-3.5 h-3.5 shrink-0 text-amber-400" />
      <p className="text-[11px] font-bold text-amber-300">{etiqueta}</p>
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
