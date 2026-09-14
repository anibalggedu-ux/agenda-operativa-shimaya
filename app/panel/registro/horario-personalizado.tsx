"use client";

import { useEffect, useState } from "react";
import {
  obtenerUsuariosConHorario,
  actualizarHoraLimiteIngreso,
  type UsuarioConHorario,
} from "./actions";

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

  function cargar() {
    setCargando(true);
    obtenerUsuariosConHorario()
      .then((data) => {
        setUsuarios(data);
        const iniciales: Record<string, string> = {};
        data.forEach((u) => {
          iniciales[u.id] = u.horaLimiteIngreso ? u.horaLimiteIngreso.slice(0, 5) : "";
        });
        setValores(iniciales);
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
      {usuarios.length === 0 ? (
        <p className="text-marca-tenue text-sm italic">No hay usuarios con puntualidad configurable.</p>
      ) : (
        <div className="space-y-1.5">
          {usuarios.map((u) => (
            <div
              key={u.id}
              className="flex flex-wrap items-center justify-between gap-3 bg-marca-fondo border border-marca-borde rounded-[3px] px-4 py-3"
            >
              <span>
                <span className="text-marca-textofuerte font-bold text-sm">{u.nombre}</span>{" "}
                <span className="text-marca-tenue text-[11px] uppercase">
                  ({u.rol} · defecto {HORA_LIMITE_DEFECTO[u.rol] ?? "—"})
                </span>
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
              {mensaje?.id === u.id && (
                <p
                  className={`w-full text-[11px] font-bold ${
                    mensaje.ok ? "text-emerald-400" : "text-marca-rojoclaro"
                  }`}
                >
                  {mensaje.texto}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
