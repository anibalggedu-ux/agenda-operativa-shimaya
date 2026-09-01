"use client";

import { useFormState, useFormStatus } from "react-dom";
import { iniciarSesionAction, type ResultadoLogin } from "./actions";

const estadoInicial: ResultadoLogin = { exito: false };

function BotonIngresar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-black py-3.5 rounded-xl text-xs tracking-widest uppercase transition"
    >
      {pending ? "Validando..." : "Ingresar al Sistema"}
    </button>
  );
}

export default function LoginForm({ nombres }: { nombres: string[] }) {
  const [estado, formAction] = useFormState(iniciarSesionAction, estadoInicial);

  return (
    <form
      action={formAction}
      className="bg-[#0f111a] border-2 border-cyan-500/40 rounded-2xl p-6 shadow-[0_0_25px_rgba(0,242,254,0.15)]"
    >
      <label className="block text-slate-400 text-[10px] uppercase font-bold mb-2 tracking-wider">
        Usuario
      </label>
      <select
        name="nombre"
        required
        className="w-full p-3 mb-4 bg-[#0d1117] border border-slate-800 rounded-xl text-white text-sm outline-none focus:border-cyan-500"
      >
        <option value="">Seleccione su nombre</option>
        {nombres.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>

      <label className="block text-slate-400 text-[10px] uppercase font-bold mb-2 tracking-wider">
        Credencial / Clave
      </label>
      <input
        type="password"
        name="clave"
        required
        className="w-full p-3 mb-6 bg-[#0d1117] border border-slate-800 rounded-xl text-white text-sm outline-none focus:border-cyan-500"
        placeholder="****"
      />

      <BotonIngresar />

      {estado.mensaje && (
        <p className="text-yellow-400 mt-4 text-xs font-bold text-center bg-yellow-950/20 py-2 rounded-lg border border-yellow-900/40">
          {estado.mensaje}
        </p>
      )}
    </form>
  );
}
