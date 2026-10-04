"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { eliminarSuscripcionPush, tieneSuscripcionPush } from "../notificaciones-push-actions";
import { activarNotificacionesPush, soportaPush } from "../push-cliente";

// Banner para activar notificaciones push reales (suenan aunque la app esté
// cerrada o la pantalla apagada) -- a diferencia de RecordatorioChecker, que
// solo avisa mientras la app está abierta. Vive arriba de Mi Agenda; no sale
// en navegadores que no soportan Push API (ej. Safari fuera de "Agregar a
// pantalla de inicio" en iOS viejo).
export default function NotificacionesToggle() {
  const [soportado, setSoportado] = useState(false);
  const [activo, setActivo] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  useEffect(() => {
    const soporta = soportaPush();
    setSoportado(soporta);
    if (!soporta) return;

    navigator.serviceWorker
      .register("/sw.js")
      .then(async (registro) => {
        const sub = await registro.pushManager.getSubscription();
        if (!sub) return;
        const yaGuardada = await tieneSuscripcionPush(sub.endpoint).catch(() => false);
        setActivo(yaGuardada);
      })
      .catch(() => {});
  }, []);

  async function activar() {
    setCargando(true);
    setMensaje(null);
    try {
      const resultado = await activarNotificacionesPush();
      if (resultado.exito) setActivo(true);
      else setMensaje(resultado.mensaje || "No se pudo activar.");
    } catch (err: any) {
      setMensaje(err?.message || "No se pudo activar las notificaciones.");
    } finally {
      setCargando(false);
    }
  }

  async function desactivar() {
    setCargando(true);
    try {
      const registro = await navigator.serviceWorker.getRegistration();
      const sub = await registro?.pushManager.getSubscription();
      if (sub) {
        await eliminarSuscripcionPush(sub.endpoint);
        await sub.unsubscribe();
      }
      setActivo(false);
    } finally {
      setCargando(false);
    }
  }

  if (!soportado) return null;

  return (
    <div className="bg-marca-superficie border border-marca-oro/30 rounded-[3px] px-3.5 py-2.5 mb-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {activo ? (
            <Bell className="w-4 h-4 text-marca-oro shrink-0" />
          ) : (
            <BellOff className="w-4 h-4 text-marca-tenue shrink-0" />
          )}
          <p className="text-[11.5px] text-marca-texto font-bold truncate">
            {activo ? "Notificaciones activadas" : "Avisarme aunque tenga la app cerrada"}
          </p>
        </div>
        <button
          onClick={activo ? desactivar : activar}
          disabled={cargando}
          className={`shrink-0 text-[10.5px] font-black uppercase tracking-wide px-3 py-1.5 rounded-[3px] transition disabled:opacity-50 ${
            activo ? "border border-marca-borde text-marca-tenue" : "bg-marca-rojo text-white"
          }`}
        >
          {cargando ? "..." : activo ? "Desactivar" : "Activar"}
        </button>
      </div>
      {mensaje && <p className="text-marca-rojoclaro text-[10.5px] mt-2">{mensaje}</p>}
    </div>
  );
}
