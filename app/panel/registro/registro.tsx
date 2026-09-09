"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  crearUsuario,
  obtenerUsuariosConAcceso,
  actualizarAccesoRegistro,
  type ResultadoRegistro,
  type UsuarioConAcceso,
} from "./actions";
import { DIAS_SEMANA } from "@/lib/fechas";

const ROLES = ["capacitador", "supervisor", "coordinador", "gerente"] as const;

const estadoInicial: ResultadoRegistro = { exito: false };

function BotonRegistrar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full bg-marca-rojo hover:bg-marca-rojoclaro disabled:opacity-50 text-marca-textofuerte font-black py-3 rounded-[3px] text-xs tracking-widest uppercase transition"
    >
      {pending ? "Registrando..." : "Registrar usuario"}
    </button>
  );
}

function FormularioNuevoUsuario() {
  const [estado, formAction] = useFormState(crearUsuario, estadoInicial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (estado.exito) formRef.current?.reset();
  }, [estado]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="bg-marca-superficie border border-marca-rojo/25 rounded-[3px] p-5 space-y-4"
    >
      <h3 className="text-xs font-black tracking-widest text-marca-tenue">NUEVO USUARIO</h3>

      <div>
        <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">
          Nombre y apellido
        </label>
        <input
          name="nombre"
          required
          className="w-full p-3 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro"
          placeholder="Ej. JUAN PÉREZ"
        />
      </div>

      <div>
        <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">
          Correo electrónico
        </label>
        <input
          type="email"
          name="email"
          className="w-full p-3 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro"
          placeholder="correo@ejemplo.com"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">
            Fecha de ingreso a la empresa
          </label>
          <input
            type="date"
            name="fechaIngreso"
            className="w-full p-3 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro"
          />
        </div>
        <div>
          <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">
            Fecha de cumpleaños
          </label>
          <input
            type="date"
            name="fechaNacimiento"
            className="w-full p-3 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">Rol</label>
          <select
            name="rol"
            required
            defaultValue=""
            className="w-full p-3 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro"
          >
            <option value="" disabled>
              Selecciona...
            </option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">
            Día de descanso semanal
          </label>
          <select
            name="diaDescanso"
            defaultValue=""
            className="w-full p-3 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro"
          >
            <option value="">Sin asignar</option>
            {DIAS_SEMANA.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">
          Credencial (clave de acceso)
        </label>
        <input
          type="password"
          name="credencial"
          required
          className="w-full p-3 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro"
          placeholder="Clave para iniciar sesión"
        />
      </div>

      <BotonRegistrar />

      {estado.mensaje && (
        <p
          className={`text-xs font-bold text-center ${
            estado.exito ? "text-emerald-400" : "text-marca-rojoclaro"
          }`}
        >
          {estado.mensaje}
        </p>
      )}
    </form>
  );
}

function GestionAccesos() {
  const [usuarios, setUsuarios] = useState<UsuarioConAcceso[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardandoId, setGuardandoId] = useState<string | null>(null);

  function cargar() {
    setCargando(true);
    obtenerUsuariosConAcceso()
      .then(setUsuarios)
      .catch((e) => setError(e.message || "Error al cargar usuarios."))
      .finally(() => setCargando(false));
  }

  useEffect(() => {
    cargar();
  }, []);

  async function handleToggle(usuario: UsuarioConAcceso) {
    const nuevoValor = !usuario.puedeRegistrar;
    setGuardandoId(usuario.id);
    setUsuarios((prev) =>
      prev.map((u) => (u.id === usuario.id ? { ...u, puedeRegistrar: nuevoValor } : u))
    );
    const resultado = await actualizarAccesoRegistro(usuario.id, nuevoValor);
    if (!resultado.exito) {
      setUsuarios((prev) =>
        prev.map((u) => (u.id === usuario.id ? { ...u, puedeRegistrar: !nuevoValor } : u))
      );
    }
    setGuardandoId(null);
  }

  if (cargando) return <p className="text-marca-tenue text-sm animate-pulse">Cargando usuarios...</p>;
  if (error) return <p className="text-marca-rojoclaro text-sm">{error}</p>;

  return (
    <div className="bg-marca-superficie border border-marca-borde rounded-[3px] p-5">
      <h3 className="text-xs font-black tracking-widest text-marca-tenue mb-1">
        ACCESO A REGISTRO DE USUARIOS
      </h3>
      <p className="text-marca-tenue text-[11px] mb-4">
        Además del Coordinador, marca aquí quién más puede registrar nuevos usuarios.
      </p>
      {usuarios.length === 0 ? (
        <p className="text-marca-tenue text-sm italic">No hay otros usuarios registrados.</p>
      ) : (
        <div className="space-y-1.5">
          {usuarios.map((u) => (
            <label
              key={u.id}
              className="flex items-center justify-between bg-marca-fondo border border-marca-borde rounded-[3px] px-4 py-3 cursor-pointer"
            >
              <span>
                <span className="text-marca-textofuerte font-bold text-sm">{u.nombre}</span>{" "}
                <span className="text-marca-tenue text-[11px] uppercase">({u.rol})</span>
              </span>
              <input
                type="checkbox"
                checked={u.puedeRegistrar}
                disabled={guardandoId === u.id}
                onChange={() => handleToggle(u)}
                className="w-4 h-4 accent-marca-rojo"
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Registro({ esCoordinador }: { esCoordinador: boolean }) {
  return (
    <div className="space-y-6">
      <FormularioNuevoUsuario />
      {esCoordinador && <GestionAccesos />}
    </div>
  );
}
