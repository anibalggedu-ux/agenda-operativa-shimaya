"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  crearUsuario,
  obtenerUsuariosConAcceso,
  actualizarAccesoRegistro,
  actualizarEstadoUsuario,
  type ResultadoRegistro,
  type UsuarioConAcceso,
} from "./actions";
import { DIAS_SEMANA } from "@/lib/fechas";
import {
  BloqueUbicacionTiendas,
  BloqueDireccionColaboradores,
  BloqueAsistencia,
  BloqueReportes,
  BloqueAsignacionesEspeciales,
  BloqueComunicados,
  BloqueKilometros,
} from "./mantenimiento";
import HorarioPersonalizado from "./horario-personalizado";
import { AccesoAuditoria, PlantillaAuditoria } from "./auditoria-admin";
import SeccionColapsable from "../seccion-colapsable";
import HistorialCambios from "./historial-cambios";
import ActividadUsuarios from "./actividad-usuarios";
import ChecklistVisitaAdmin from "./checklist-visita-admin";

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
  const [diaDescanso, setDiaDescanso] = useState("");
  const [horarioMixtoAbierto, setHorarioMixtoAbierto] = useState(false);
  const [valoresMixto, setValoresMixto] = useState<Record<string, string>>({});

  const diasTrabaja = DIAS_SEMANA.filter((d) => d !== diaDescanso);
  const horarioPorDiaJson = JSON.stringify(
    Object.fromEntries(
      Object.entries(valoresMixto)
        .filter(([dia, hora]) => diasTrabaja.includes(dia) && hora.trim())
        .map(([dia, hora]) => [dia, `${hora}:00`])
    )
  );

  useEffect(() => {
    if (estado.exito) {
      formRef.current?.reset();
      setDiaDescanso("");
      setHorarioMixtoAbierto(false);
      setValoresMixto({});
    }
  }, [estado]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
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

      <div>
        <label className="block text-marca-tenue text-[10px] uppercase font-bold mb-1">
          Dirección de domicilio (opcional)
        </label>
        <input
          type="text"
          name="direccion"
          className="w-full p-3 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro"
          placeholder="Ej. Jr. Las Camelias 320, Los Olivos"
        />
        <p className="text-marca-tenue text-[10px] mt-1">
          Se busca y guarda automáticamente. Si no aparece la haces luego en Dirección de colaboradores.
        </p>
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
            value={diaDescanso}
            onChange={(e) => setDiaDescanso(e.target.value)}
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
          Hora límite de ingreso personalizada (opcional)
        </label>
        <input
          type="time"
          name="horaLimiteIngreso"
          className="w-full p-3 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-sm outline-none focus:border-marca-rojoclaro"
        />
        <p className="text-marca-tenue text-[10px] mt-1">
          Solo si tiene un turno diferido del resto de su rol (no aplica a gerente). Déjalo vacío para usar el
          horario por defecto.
        </p>

        <button
          type="button"
          onClick={() => setHorarioMixtoAbierto((v) => !v)}
          className="mt-2 text-marca-tenue hover:text-marca-texto text-[10px] font-black uppercase tracking-widest transition"
        >
          {horarioMixtoAbierto ? "▲ Ocultar horario mixto por día" : "▼ 🔀 ¿Horario mixto por día?"}
        </button>

        {horarioMixtoAbierto && (
          <div className="border-t border-marca-borde mt-2 pt-3 space-y-2">
            <p className="text-marca-tenue text-[10px]">
              Si entra a horas distintas según el día, ponlas aquí — esto manda sobre la hora límite de arriba,
              día por día. Deja un día vacío para que use esa hora límite (o la de su rol) ese día.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {diasTrabaja.map((dia) => (
                <div key={dia}>
                  <label className="block text-marca-tenue text-[9px] uppercase font-bold mb-0.5">
                    {dia}
                  </label>
                  <input
                    type="time"
                    value={valoresMixto[dia] ?? ""}
                    onChange={(e) =>
                      setValoresMixto((prev) => ({ ...prev, [dia]: e.target.value }))
                    }
                    className="w-full p-2 bg-marca-fondo border border-marca-borde rounded-[3px] text-marca-texto text-xs outline-none focus:border-marca-rojoclaro"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
        <input type="hidden" name="horarioPorDia" value={horarioPorDiaJson} />
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
  const [cambiandoEstadoId, setCambiandoEstadoId] = useState<string | null>(null);
  const [errorEstado, setErrorEstado] = useState<string | null>(null);

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

  async function handleCambiarEstado(usuario: UsuarioConAcceso) {
    const nuevoValor = !usuario.activo;
    if (
      !nuevoValor &&
      !window.confirm(
        `¿Dar de baja a ${usuario.nombre}? No podrá iniciar sesión, pero sus reportes, marcaciones y puntos históricos se conservan. Puedes reactivarlo(a) cuando quieras.`
      )
    ) {
      return;
    }
    setErrorEstado(null);
    setCambiandoEstadoId(usuario.id);
    const resultado = await actualizarEstadoUsuario(usuario.id, nuevoValor);
    if (resultado.exito) {
      setUsuarios((prev) =>
        prev.map((u) => (u.id === usuario.id ? { ...u, activo: nuevoValor } : u))
      );
    } else {
      setErrorEstado(resultado.mensaje || "No se pudo actualizar el estado.");
    }
    setCambiandoEstadoId(null);
  }

  if (cargando) return <p className="text-marca-tenue text-sm animate-pulse">Cargando usuarios...</p>;
  if (error) return <p className="text-marca-rojoclaro text-sm">{error}</p>;

  return (
    <>
      {errorEstado && <p className="text-marca-rojoclaro text-xs font-bold mb-3">{errorEstado}</p>}
      {usuarios.length === 0 ? (
        <p className="text-marca-tenue text-sm italic">No hay otros usuarios registrados.</p>
      ) : (
        <div className="space-y-1.5">
          {usuarios.map((u) => (
            <div
              key={u.id}
              className={`flex flex-wrap items-center justify-between gap-3 bg-marca-fondo border rounded-[3px] px-4 py-3 ${
                u.activo ? "border-marca-borde" : "border-marca-rojo/30 opacity-60"
              }`}
            >
              <span>
                <span className="text-marca-textofuerte font-bold text-sm">{u.nombre}</span>{" "}
                <span className="text-marca-tenue text-[11px] uppercase">({u.rol})</span>
                {!u.activo && (
                  <span className="ml-2 text-marca-rojoclaro text-[10px] font-black uppercase tracking-widest">
                    De baja
                  </span>
                )}
              </span>
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => handleCambiarEstado(u)}
                  disabled={cambiandoEstadoId === u.id}
                  className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-[3px] border transition disabled:opacity-50 ${
                    u.activo
                      ? "border-marca-rojo/40 text-marca-rojoclaro hover:bg-marca-rojo/10"
                      : "border-marca-borde text-marca-tenue hover:text-marca-texto"
                  }`}
                >
                  {u.activo ? "Dar de baja" : "Reactivar"}
                </button>
                <label className="flex items-center gap-2 cursor-pointer">
                  <span className="text-marca-tenue text-[10px] uppercase font-bold">
                    Puede registrar
                  </span>
                  <input
                    type="checkbox"
                    checked={u.puedeRegistrar}
                    disabled={guardandoId === u.id}
                    onChange={() => handleToggle(u)}
                    className="w-4 h-4 accent-marca-rojo"
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function Categoria({ icono, titulo }: { icono: string; titulo: string }) {
  return (
    <div className="flex items-center gap-2 px-1">
      <span className="text-xs">{icono}</span>
      <p className="text-marca-rojoclaro text-[10px] font-black uppercase tracking-widest whitespace-nowrap">
        {titulo}
      </p>
      <span className="flex-1 h-px bg-marca-borde" />
    </div>
  );
}

export default function Registro({ esCoordinador }: { esCoordinador: boolean }) {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Categoria icono="👤" titulo="Personas y accesos" />

        <SeccionColapsable titulo="Nuevo usuario" icono="👤" descripcion="Registra un nuevo colaborador.">
          <FormularioNuevoUsuario />
        </SeccionColapsable>

        {esCoordinador && (
          <SeccionColapsable
            titulo="Personal y acceso a Registro"
            icono="👥"
            descripcion="Quién más puede registrar usuarios, o dar de baja a alguien."
          >
            <GestionAccesos />
          </SeccionColapsable>
        )}

        <SeccionColapsable
          titulo="Acceso a auditorías"
          icono="🔍"
          descripcion="Activa o desactiva quién puede llenar una auditoría."
        >
          <AccesoAuditoria />
        </SeccionColapsable>
      </div>

      <div className="space-y-3">
        <Categoria icono="🏬" titulo="Tiendas y ubicaciones" />

        <BloqueUbicacionTiendas />
        <BloqueDireccionColaboradores />
        <BloqueKilometros />
      </div>

      <div className="space-y-3">
        <Categoria icono="⚙️" titulo="Configuración" />

        <SeccionColapsable
          titulo="Horario de ingreso personalizado"
          icono="⏰"
          descripcion="Configura una hora límite propia para quien tenga un turno diferido del resto."
        >
          <HorarioPersonalizado />
        </SeccionColapsable>

        <SeccionColapsable
          titulo="Plantilla del checklist de auditoría"
          icono="🧾"
          descripcion="Ítems que ve el supervisor al llenar una auditoría, agrupados por categoría."
        >
          <PlantillaAuditoria />
        </SeccionColapsable>

        <SeccionColapsable
          titulo="Checklist de rutina de visita"
          icono="📋"
          descripcion="Preguntas del checklist opcional que llenan capacitadores, supervisores y coordinadores al visitar una tienda."
        >
          <ChecklistVisitaAdmin />
        </SeccionColapsable>
      </div>

      <div className="space-y-3">
        <Categoria icono="🧹" titulo="Corrección de datos" />

        <BloqueAsistencia />
        <BloqueReportes />
        <BloqueAsignacionesEspeciales />
        <BloqueComunicados />
      </div>

      <div className="space-y-3">
        <Categoria icono="🕵️" titulo="Historial" />

        <SeccionColapsable
          titulo="Actividad de usuarios"
          icono="📊"
          descripcion="Quién entra al sistema y genera reportes, con fecha y hora — y quién no."
        >
          <ActividadUsuarios />
        </SeccionColapsable>

        <SeccionColapsable
          titulo="Historial de cambios (auditoría)"
          icono="🕵️"
          descripcion="Quién corrigió o eliminó qué desde Registro, y cuándo — por transparencia."
        >
          <HistorialCambios />
        </SeccionColapsable>
      </div>
    </div>
  );
}
