"use client";

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { obtenerEstadoConsentimiento, aceptarAvisoPrivacidad } from "./aviso-privacidad-actions";
import { activarNotificacionesPush } from "./push-cliente";

// Pantalla de consentimiento obligatoria (Ley N.° 29733) — se muestra una
// sola vez por usuario, la primera vez que entra después de este cambio.
// No es cerrable (sin X, sin click afuera): mientras no acepte, se queda
// encima de todo lo demás. Vive montada una sola vez en PanelShell, igual
// que SincronizadorOffline, y consulta su propio estado en vez de recibir
// props desde cada page.tsx de portal.
export default function AvisoPrivacidadModal() {
  const [mostrar, setMostrar] = useState(false);
  const [aceptado, setAceptado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    obtenerEstadoConsentimiento()
      .then((r) => setMostrar(r.requiere))
      .catch(() => {});
  }, []);

  async function continuar() {
    setEnviando(true);
    setError(null);
    try {
      // activarNotificacionesPush() se dispara aquí mismo, antes de cualquier
      // await, para no perder el gesto del usuario (click) que el navegador
      // exige para mostrar el permiso de notificaciones -- si se pidiera
      // después de esperar a aceptarAvisoPrivacidad(), algunos navegadores lo
      // bloquean en silencio. Es best-effort: que falle no debe impedir
      // aceptar el aviso (ej. navegador sin soporte push, o permiso denegado).
      const [resultado] = await Promise.all([aceptarAvisoPrivacidad(), activarNotificacionesPush().catch(() => null)]);
      if (resultado.exito) {
        setMostrar(false);
      } else {
        setError("No se pudo registrar tu aceptación. Intenta de nuevo.");
      }
    } catch {
      setError("No se pudo registrar tu aceptación. Intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  if (!mostrar) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4">
      <div className="w-full sm:max-w-md sm:rounded-2xl bg-marca-superficie border border-marca-borde rounded-t-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center gap-2.5 px-5 pt-5 pb-3 shrink-0">
          <span className="flex items-center justify-center w-9 h-9 rounded-full bg-oro/15 text-oro shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </span>
          <p className="font-display text-base font-bold text-marca-textofuerte">Antes de continuar</p>
        </div>

        <div className="px-5 pb-2 overflow-y-auto text-[13px] leading-relaxed text-marca-tenue space-y-3">
          <p>
            Para usar Agenda Operativa Shimaya necesitamos tu autorización para tratar tus datos personales,
            conforme a la Ley N.° 29733.
          </p>
          <p>
            La app recolectará: tu ubicación GPS al marcar llegada y salida, fotos tomadas en ese momento, fotos y
            videos que publiques en el feed interno, fotos de evidencia en checklists de visita, tu horario y días
            de descanso, y tu fecha de nacimiento (opcional, solo para mostrar tu cumpleaños en el feed).
          </p>
          <p>
            Responsable: <span className="text-marca-texto font-semibold">Shimaya S.A.C.</span> (RUC 20600603460).
            Para ejercer tus derechos de acceso, rectificación, cancelación u oposición, escribe a{" "}
            <span className="text-marca-texto font-semibold">anibalggedu@gmail.com</span>.
          </p>
          <p>
            <span className="text-marca-texto font-semibold">Uso responsable de tu cuenta:</span> tu usuario y clave
            son personales e intransferibles — no los compartas con nadie. El contenido interno de la app (fotos,
            videos, reportes, checklists y auditorías) es de uso exclusivo del equipo y no debe compartirse,
            descargarse ni difundirse fuera de la empresa.
          </p>
          <p>
            Puedes leer el texto completo en los{" "}
            <a href="/terminos" target="_blank" rel="noopener noreferrer" className="text-marca-rojoclaro underline font-semibold">
              Términos y condiciones
            </a>{" "}
            y la{" "}
            <a href="/privacidad" target="_blank" rel="noopener noreferrer" className="text-marca-rojoclaro underline font-semibold">
              Política de privacidad
            </a>
            .
          </p>
          <p>
            <span className="text-marca-texto font-semibold">Notificaciones:</span> al aceptar, se activarán las
            notificaciones push en este dispositivo (recordatorios, anuncios, rutas y alertas del equipo) — puedes
            desactivarlas luego desde Mi Agenda.
          </p>
        </div>

        <div className="px-5 pt-2 pb-5 shrink-0 border-t border-marca-borde mt-2">
          <label className="flex items-start gap-2.5 py-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={aceptado}
              onChange={(e) => setAceptado(e.target.checked)}
              className="mt-0.5 w-4 h-4 shrink-0 accent-marca-rojo"
            />
            <span className="text-[12.5px] text-marca-texto">
              He leído lo anterior, autorizo el tratamiento de mis datos personales para los fines descritos, y me
              comprometo a no compartir mi cuenta ni el contenido interno de la app fuera de la empresa. Se me
              enviará una copia a mi correo registrado.
            </span>
          </label>

          {error && <p className="text-[11px] text-marca-rojoclaro mb-2">{error}</p>}

          <button
            type="button"
            onClick={continuar}
            disabled={!aceptado || enviando}
            className="w-full bg-marca-rojo text-white font-bold text-sm py-3 rounded-xl disabled:opacity-40 transition"
          >
            {enviando ? "Guardando…" : "Aceptar y continuar"}
          </button>
          <p className="text-[10.5px] text-marca-tenue mt-2 text-center">
            Estas funciones son necesarias para usar la aplicación.
          </p>
        </div>
      </div>
    </div>
  );
}
