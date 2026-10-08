"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, AlertTriangle, CheckCircle2 } from "lucide-react";
import { comprimirFotoComoBase64 } from "@/lib/comprimir-imagen";
import { reproducirSonidoAlerta, reproducirSonidoExito } from "@/lib/sonido";
import {
  obtenerMiBreakDeHoy,
  obtenerMisUltimosBreaks,
  marcarSalidaBreak,
  marcarEntradaBreak,
  marcarNoSalioBreak,
  avisarCincoMinutosBreak,
  type BreakHoy,
  type BreakHistorial,
} from "./break-actions";

const AVISO_ANTES_SEG = 5 * 60;

function horaATexto(horaHHMMSS: string): string {
  const [h, m] = horaHHMMSS.split(":").map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

// Duración real del break (horaLimite - horaSalida) en segundos -- la
// mayoría son los 60 min por defecto, pero Registro puede darle a alguien
// una duración distinta (ver usuarios.duracion_break_min).
function duracionSegundos(horaSalida: string, horaLimite: string): number {
  const [hs, ms] = horaSalida.split(":").map(Number);
  const [hl, ml] = horaLimite.split(":").map(Number);
  return (hl * 60 + ml - (hs * 60 + ms)) * 60;
}

function formatearDuracion(segundos: number): string {
  const minutos = Math.round(segundos / 60);
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return h > 0 ? `de ${h}h ${String(m).padStart(2, "0")}min` : `de ${m}min`;
}

// Segundos restantes hasta horaLimite ("HH:MM:SS"), comparado contra la hora
// real del celular -- igual que el resto de la app, se asume que el celular
// está en hora de Perú (es la hora con la que ya marca entrada/salida).
function segundosRestantes(horaLimite: string): number {
  const ahora = new Date();
  const [h, m, s] = horaLimite.split(":").map(Number);
  const limite = new Date(ahora);
  limite.setHours(h, m, s, 0);
  return Math.round((limite.getTime() - ahora.getTime()) / 1000);
}

function formatearCronometro(segundos: number): string {
  const neg = segundos < 0;
  const abs = Math.abs(segundos);
  const mm = Math.floor(abs / 60);
  const ss = abs % 60;
  return `${neg ? "-" : ""}${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

// Check que se dibuja de un trazo (ver .trazo-check en globals.css), igual
// que en Bitácora de Campo al confirmar una marcación.
function TrazoCheck() {
  return (
    <svg viewBox="0 0 24 24" className="trazo-check marcado w-4 h-4 shrink-0" aria-hidden>
      <path
        d="M4 12.5 L9.5 18 L20 5.5"
        fill="none"
        stroke="rgb(var(--marca-textofuerte))"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function BreakWidget() {
  const [hoy, setHoy] = useState<BreakHoy | null | undefined>(undefined);
  const [historial, setHistorial] = useState<BreakHistorial[]>([]);
  const [restantes, setRestantes] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [confirmado, setConfirmado] = useState(false);
  const [mensaje, setMensaje] = useState<{ texto: string; exito: boolean } | null>(null);
  const inputSalida = useRef<HTMLInputElement>(null);
  const inputEntrada = useRef<HTMLInputElement>(null);
  const avisoEnviado = useRef(false);

  // en_curso: ya salió a break y todavía no marca entrada -- ahí se muestra
  // el cronómetro. completado: ya usó su único break del día -- queda
  // bloqueado, no se deja abrir otro. noSalioHoy: declaró que hoy no sale a
  // break -- no bloquea cambiar de opinión (ver marcarSalidaBreak).
  const activo = hoy && !hoy.horaEntrada && !hoy.noSalio ? hoy : null;
  const completadoHoy = hoy && hoy.horaEntrada ? hoy : null;
  const noSalioHoy = hoy && hoy.noSalio ? hoy : null;

  function cargar() {
    obtenerMiBreakDeHoy().then(setHoy);
    obtenerMisUltimosBreaks(5).then(setHistorial);
  }

  useEffect(cargar, []);

  useEffect(() => {
    if (!activo) return;
    avisoEnviado.current = false;
    const actualizar = () => setRestantes(segundosRestantes(activo.horaLimite!));
    actualizar();
    const intervalo = setInterval(actualizar, 1000);
    return () => clearInterval(intervalo);
  }, [activo]);

  useEffect(() => {
    if (!activo || avisoEnviado.current) return;
    // Se dispara la primera vez que quedan 5 min o menos -- cubre tanto
    // llegar justo a ese punto con el cronómetro abierto como abrir la
    // pantalla cuando ya quedaba menos (el servidor igual evita un segundo
    // correo con aviso_5min_enviado).
    if (restantes <= AVISO_ANTES_SEG) {
      avisoEnviado.current = true;
      avisarCincoMinutosBreak(activo.id).catch(() => {});
      // Un solo aviso sonoro (no una alarma repetida) -- el push del sistema
      // ya avisa aparte; esto es solo un refuerzo mientras la app sigue
      // abierta.
      reproducirSonidoAlerta();
    }
  }, [restantes, activo]);

  async function handleFoto(e: React.ChangeEvent<HTMLInputElement>, tipo: "salida" | "entrada") {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    setMensaje(null);
    setEnviando(true);
    try {
      const foto = await comprimirFotoComoBase64(archivo);
      const resultado =
        tipo === "salida" ? await marcarSalidaBreak(foto) : await marcarEntradaBreak(activo!.id, foto);
      setMensaje({ texto: resultado.mensaje ?? "", exito: resultado.exito });
      if (resultado.exito) {
        reproducirSonidoExito();
        // Deja ver el anillo + check un instante antes de refrescar -- si se
        // llama a cargar() de una, la pantalla cambia de golpe (cronómetro
        // <-> bloqueado) y nunca se alcanza a ver la confirmación.
        setConfirmado(true);
        setTimeout(() => {
          setConfirmado(false);
          cargar();
        }, 600);
      } else {
        reproducirSonidoAlerta();
      }
    } catch (err: any) {
      reproducirSonidoAlerta();
      setMensaje({ texto: err?.message || "No se pudo procesar la foto.", exito: false });
    } finally {
      setEnviando(false);
    }
  }

  async function handleNoSalio() {
    setMensaje(null);
    setEnviando(true);
    try {
      const resultado = await marcarNoSalioBreak();
      setMensaje({ texto: resultado.mensaje ?? "", exito: resultado.exito });
      if (resultado.exito) cargar();
    } catch (err: any) {
      setMensaje({ texto: err?.message || "No se pudo registrar.", exito: false });
    } finally {
      setEnviando(false);
    }
  }

  if (hoy === undefined) return null;

  const vencido = restantes <= 0;
  const duracionSeg = activo ? duracionSegundos(activo.horaSalida!, activo.horaLimite!) : 0;
  const porcentaje = activo ? Math.max(0, Math.min(100, (1 - restantes / duracionSeg) * 100)) : 0;
  const colorAnillo = vencido ? "211 30 43" : "217 178 106";
  // Últimos 5 min o ya pasado de hora: el halo de "calor" detrás del anillo
  // se enciende en vez de solo cambiar de color de golpe.
  const enAlerta = !!activo && (vencido || restantes <= AVISO_ANTES_SEG);

  return (
    <div className="bg-marca-superficie border border-marca-borde rounded-2xl p-5 flex flex-col items-center gap-4">
      <input ref={inputSalida} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleFoto(e, "salida")} />
      <input ref={inputEntrada} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleFoto(e, "entrada")} />

      {completadoHoy ? (
        <>
          <p className="self-start text-xs font-black tracking-widest text-marca-tenue uppercase">Mi Break</p>
          <div className="w-full bg-marca-superficie2 border border-marca-borde rounded-xl p-4 flex items-center gap-3">
            {completadoHoy.sePaso ? (
              <AlertTriangle className="w-6 h-6 text-marca-rojoclaro shrink-0" />
            ) : (
              <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
            )}
            <div>
              <p className="text-[11.5px] font-bold text-marca-texto">Ya usaste tu break de hoy</p>
              <p className="text-[10.5px] text-marca-tenue">
                {horaATexto(completadoHoy.horaSalida!)} → {horaATexto(completadoHoy.horaEntrada!)}
                {completadoHoy.sePaso ? ` · se pasó ${completadoHoy.minutosPasados} min` : " · a tiempo"}
              </p>
            </div>
          </div>
        </>
      ) : noSalioHoy ? (
        <>
          <p className="self-start text-xs font-black tracking-widest text-marca-tenue uppercase">Mi Break</p>
          <div className="w-full bg-marca-superficie2 border border-marca-borde rounded-xl p-4 flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-marca-tenue shrink-0" />
            <div>
              <p className="text-[11.5px] font-bold text-marca-texto">Hoy no saliste a break</p>
              <p className="text-[10.5px] text-marca-tenue">Quedó registrado.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => inputSalida.current?.click()}
            disabled={enviando}
            className="w-full flex items-center justify-center gap-2 border border-marca-borde hover:border-marca-rojoclaro disabled:opacity-50 text-marca-tenue font-bold py-2.5 rounded-full text-[11px] tracking-widest uppercase transition"
          >
            <Camera className="w-3.5 h-3.5" />
            {enviando ? "Guardando..." : "Mejor sí salgo a break"}
          </button>
        </>
      ) : !activo ? (
        <>
          <p className="self-start text-xs font-black tracking-widest text-marca-tenue uppercase">Mi Break</p>
          <div className="relative w-full">
            {confirmado && <span className="confirmacion-anillo" />}
            <button
              type="button"
              onClick={() => inputSalida.current?.click()}
              disabled={enviando || confirmado}
              className="w-full flex items-center justify-center gap-2 bg-marca-rojo hover:bg-marca-rojoclaro disabled:opacity-50 text-marca-textofuerte font-black py-3.5 rounded-full text-xs tracking-widest uppercase transition"
            >
              {confirmado ? (
                <TrazoCheck />
              ) : (
                <>
                  <Camera className="w-4 h-4" />
                  {enviando ? "Guardando..." : "Salir a break"}
                </>
              )}
            </button>
          </div>
          <button
            type="button"
            onClick={handleNoSalio}
            disabled={enviando || confirmado}
            className="w-full text-center text-[10.5px] font-bold text-marca-tenue hover:text-marca-texto underline underline-offset-2 disabled:opacity-50 transition"
          >
            No salí al break
          </button>
        </>
      ) : (
        <>
          <p className="self-start text-xs font-black tracking-widest text-marca-tenue uppercase">En break</p>
          <div className="relative w-[200px] h-[200px] flex items-center justify-center">
            {enAlerta && (
              <span className="anillo-shimmer-halo absolute w-[210px] h-[210px] rounded-full" aria-hidden />
            )}
            <div
              className="relative w-[200px] h-[200px] rounded-full flex items-center justify-center transition-colors"
              style={{
                background: `conic-gradient(rgb(${colorAnillo}) ${porcentaje}%, rgb(var(--marca-borde)) ${porcentaje}%)`,
                boxShadow: enAlerta ? undefined : "0 0 24px 2px rgb(217 178 106 / 0.35)",
              }}
            >
              <div className="w-[170px] h-[170px] rounded-full bg-marca-fondo flex flex-col items-center justify-center gap-1">
                <p className="font-display text-4xl font-bold text-marca-textofuerte">{formatearCronometro(restantes)}</p>
                <p className="text-[10.5px] text-marca-tenue">
                  {vencido ? "pasado el límite" : formatearDuracion(duracionSeg)}
                </p>
              </div>
            </div>
          </div>
          <p className="text-[11.5px] text-marca-texto text-center">
            Saliste a las <b>{horaATexto(activo.horaSalida!)}</b> · vuelve antes de las{" "}
            <b className={vencido ? "text-marca-rojoclaro" : "text-oro"}>{horaATexto(activo.horaLimite!)}</b>
          </p>
          <div className="relative w-full">
            {confirmado && <span className="confirmacion-anillo" />}
            <button
              type="button"
              onClick={() => inputEntrada.current?.click()}
              disabled={enviando || confirmado}
              className="w-full flex items-center justify-center gap-2 bg-marca-rojo hover:bg-marca-rojoclaro disabled:opacity-50 text-marca-textofuerte font-black py-3.5 rounded-full text-xs tracking-widest uppercase transition"
            >
              {confirmado ? (
                <TrazoCheck />
              ) : (
                <>
                  <Camera className="w-4 h-4" />
                  {enviando ? "Guardando..." : "Marcar entrada de break"}
                </>
              )}
            </button>
          </div>
        </>
      )}

      {mensaje && (
        <p className={`text-xs font-bold text-center ${mensaje.exito ? "text-emerald-400" : "text-marca-rojoclaro"}`}>
          {mensaje.texto}
        </p>
      )}

      {historial.length > 0 && (
        <div className="w-full pt-3 border-t border-marca-borde space-y-2">
          <p className="text-[10px] font-black tracking-widest text-marca-tenue uppercase">Mi historial de break</p>
          {historial.map((b) => (
            <div key={b.id} className="flex items-center gap-2 text-[11px]">
              {b.sePaso ? (
                <AlertTriangle className="w-3.5 h-3.5 text-marca-rojoclaro shrink-0" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              )}
              <span className="text-marca-tenue shrink-0">{b.fecha.slice(5)}</span>
              <span className={b.sePaso ? "text-marca-rojoclaro" : "text-marca-texto"}>
                {horaATexto(b.horaSalida)} → {b.horaEntrada ? horaATexto(b.horaEntrada) : "—"}
                {b.sePaso ? ` · se pasó ${b.minutosPasados} min` : ""}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
