"use client";

import { useEffect, useState } from "react";
import { Shuffle } from "lucide-react";
import {
  obtenerUsuariosConHorario,
  actualizarHoraLimiteIngreso,
  actualizarHorarioPorDia,
  type UsuarioConHorario,
} from "./actions";
import { DIAS_SEMANA } from "@/lib/fechas";

const HORA_LIMITE_DEFECTO: Record<string, string> = {
  capacitador: "11:00am",
  supervisor: "12:00pm",
  coordinador: "12:00pm",
};

export default function HorarioPersonalizado() {
  const [usuarios, setUsuarios] = useState<UsuarioConHorario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [guardandoId, setGuardandoId] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<{ id: string; texto: string; ok: boolean } | null>(null);
  const [expandidoId, setExpandidoId] = useState<string | null>(null);
  const [valoresMixto, setValoresMixto] = useState<Record<string, Record<string, string>>>({});
  const [guardandoMixtoId, setGuardandoMixtoId] = useState<string | null>(null);

  function cargar() {
    setCargando(true);
    obtenerUsuariosConHorario()
      .then((data) => {
        setUsuarios(data);
        const iniciales: Record<string, string> = {};
        const inicialesMixto: Record<string, Record<string, string>> = {};
        data.forEach((u) => {
          iniciales[u.id] = u.horaLimiteIngreso ? u.horaLimiteIngreso.slice(0, 5) : "";
          const mixto: Record<string, string> = {};
          DIAS_SEMANA.forEach((dia) => {
            if (u.horarioPorDia?.[dia]) mixto[dia] = u.horarioPorDia[dia].slice(0, 5);
          });
          inicialesMixto[u.id] = mixto;
        });
        setValores(iniciales);
        setValoresMixto(inicialesMixto);
      })
      .catch((e) => setError(e.message || "Error al cargar usuarios."))
      .finally(() => setCargando(false));
  }

  useEffect(() => {
    cargar();
  }, []);

  async function handleGuardar(u: UsuarioConHorario) {
    const valor = (valores[u.id] ?? "").trim();
    const nuevoValor = valor ? `${valor}:00` : null;
    setGuardandoId(u.id);
    setMensaje(null);
    const resultado = await actualizarHoraLimiteIngreso(u.id, nuevoValor);
    if (resultado.exito) {
      setUsuarios((prev) => prev.map((x) => (x.id === u.id ? { ...x, horaLimiteIngreso: nuevoValor } : x)));
      setMensaje({
        id: u.id,
        texto: nuevoValor ? "Horario guardado." : "Vuelve a usar el horario de su rol.",
        ok: true,
      });
    } else {
      setMensaje({ id: u.id, texto: resultado.mensaje || "No se pudo guardar.", ok: false });
    }
    setGuardandoId(null);
  }

  async function handleGuardarMixto(u: UsuarioConHorario) {
    const diasTrabaja = DIAS_SEMANA.filter((d) => !u.diasDescanso.includes(d));
    const mapa: Record<string, string> = {};
    diasTrabaja.forEach((dia) => {
      const valor = (valoresMixto[u.id]?.[dia] ?? "").trim();
      if (valor) mapa[dia] = `${valor}:00`;
    });
    const horarioPorDia = Object.keys(mapa).length > 0 ? mapa : null;

    setGuardandoMixtoId(u.id);
    setMensaje(null);
    const resultado = await actualizarHorarioPorDia(u.id, horarioPorDia);
    if (resultado.exito) {
      setUsuarios((prev) => prev.map((x) => (x.id === u.id ? { ...x, horarioPorDia } : x)));
      setMensaje({
        id: u.id,
        texto: horarioPorDia ? "Horario mixto guardado." : "Se quitó el horario mixto.",
        ok: true,
      });
    } else {
      setMensaje({ id: u.id, texto: resultado.mensaje || "No se pudo guardar.", ok: false });
    }
    setGuardandoMixtoId(null);
  }

  if (cargando) return <p className="text-marca-tenue text-sm animate-pulse">Cargando usuarios...</p>;
  if (error) return <p className="text-marca-rojoclaro text-sm">{error}</p>;

  return (
    <div className="space-y-3">
      <p className="text-marca-tenue text-xs leading-relaxed">
        Por defecto el límite es <strong className="text-marca-texto">11:00am (Capacitador)</strong> y{" "}
        <strong className="text-marca-texto">12:00pm (Supervisor y Coordinador)</strong>. Si alguien tiene un
        horario diferido (entra o sale distinto al resto), ponle aquí su propia hora — reemplaza la de su rol
        solo para esa persona, en puntos, rankings y alertas de puntualidad. Déjalo vacío y guarda para volver
        a usar el horario de su rol.
      </p>
      <p className="text-marca-tenue text-xs leading-relaxed">
        <strong className="text-marca-texto">¿Horario mixto?</strong> Si alguien entra a horas distintas según
        el día (ej. 12pm miércoles y jueves, 1pm viernes), usa "Horario mixto por día" en su tarjeta — ese
        valor manda sobre la hora plana de arriba, día por día.
      </p>
      {usuarios.length === 0 ? (
        <p className="text-marca-tenue text-sm italic">No hay usuarios con puntualidad configurable.</p>
      ) : (
        <div className="space-y-1.5">
          {usuarios.map((u) => {
            const diasTrabaja = DIAS_SEMANA.filter((d) => !u.diasDescanso.includes(d));
            const expandido = expandidoId === u.id;
            const tieneMixto = !!u.horarioPorDia && Object.keys(u.horarioPorDia).length > 0;
            return (
              <div
                key={u.id}
                className="bg-marca-fondo border border-marca-borde rounded-[3px] px-4 py-3 space-y-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span>
                    <span className="text-marca-textofuerte font-bold text-sm">{u.nombre}</span>{" "}
                    <span className="text-marca-tenue text-[11px] uppercase">
                      ({u.rol} · defecto {HORA_LIMITE_DEFECTO[u.rol] ?? "—"})
                    </span>
                    {tieneMixto && (
                      <span className="inline-flex items-center gap-1 ml-2 text-amber-400 text-[10px] font-black uppercase tracking-widest">
                        <Shuffle className="w-3 h-3" /> horario mixto activo
                      </span>
                    )}
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={valores[u.id] ?? ""}
                      onChange={(e) => setValores((prev) => ({ ...prev, [u.id]: e.target.value }))}
                      className="p-2 bg-marca-superficie2 border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro"
                    />
                    <button
                      type="button"
                      onClick={() => handleGuardar(u)}
                      disabled={guardandoId === u.id}
                      className="text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-[3px] border border-marca-borde text-marca-tenue hover:text-marca-texto transition disabled:opacity-50"
                    >
                      {guardandoId === u.id ? "Guardando..." : "Guardar"}
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setExpandidoId(expandido ? null : u.id)}
                  className="inline-flex items-center gap-1 text-marca-tenue hover:text-marca-texto text-[10px] font-black uppercase tracking-widest transition"
                >
                  {expandido ? (
                    "▲ Ocultar horario mixto por día"
                  ) : (
                    <>
                      <Shuffle className="w-3 h-3" /> Horario mixto por día
                    </>
                  )}
                </button>

                {expandido && (
                  <div className="border-t border-marca-borde pt-2 space-y-2">
                    {diasTrabaja.length === 0 ? (
                      <p className="text-marca-tenue text-[11px] italic">
                        Esta persona descansa todos los días configurados como día laboral — nada que fijar aquí.
                      </p>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {diasTrabaja.map((dia) => (
                            <div key={dia}>
                              <label className="block text-marca-tenue text-[9px] uppercase font-bold mb-0.5">
                                {dia}
                              </label>
                              <input
                                type="time"
                                value={valoresMixto[u.id]?.[dia] ?? ""}
                                onChange={(e) =>
                                  setValoresMixto((prev) => ({
                                    ...prev,
                                    [u.id]: { ...prev[u.id], [dia]: e.target.value },
                                  }))
                                }
                                className="w-full p-2 bg-marca-superficie2 border border-marca-borde rounded-[3px] text-marca-texto text-xs outline-none focus:border-marca-rojoclaro"
                              />
                            </div>
                          ))}
                        </div>
                        <p className="text-marca-tenue text-[10px]">
                          Deja un día vacío para que use la hora plana de arriba ({valores[u.id] || HORA_LIMITE_DEFECTO[u.rol] || "—"}) ese día.
                        </p>
                        <button
                          type="button"
                          onClick={() => handleGuardarMixto(u)}
                          disabled={guardandoMixtoId === u.id}
                          className="text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-[3px] bg-marca-rojo hover:bg-marca-rojoclaro text-marca-textofuerte transition disabled:opacity-50"
                        >
                          {guardandoMixtoId === u.id ? "Guardando..." : "Guardar horario mixto"}
                        </button>
                      </>
                    )}
                  </div>
                )}

                {mensaje?.id === u.id && (
                  <p
                    className={`text-[11px] font-bold ${
                      mensaje.ok ? "text-emerald-400" : "text-marca-rojoclaro"
                    }`}
                  >
                    {mensaje.texto}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
