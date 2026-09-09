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
      className="w-full bg-marca-rojo hover:bg-marca-rojoclaro disabled:opacity-50 text-marca-textofuerte font-semibold py-3.5 rounded-[3px] text-xs tracking-[0.15em] uppercase transition font-body"
    >
      {pending ? "Validando..." : "Ingresar al sistema"}
    </button>
  );
}

export default function LoginForm() {
  const [estado, formAction] = useFormState(iniciarSesionAction, estadoInicial);

  return (
    <form
      action={formAction}
      className="bg-gradient-to-b from-marca-superficie to-[#131417] border border-marca-rojo/30 rounded-[3px] p-8"
    >
      <label className="block text-marca-tenue text-[10px] uppercase font-semibold mb-2 tracking-[0.08em] font-body">
        Credencial
      </label>
      <input
        type="password"
        name="clave"
        required
        autoFocus
        placeholder="••••••••"
        className="w-full p-3.5 mb-7 bg-marca-fondo border border-marca-rojo/35 rounded-[3px] text-marca-textofuerte text-sm tracking-[0.15em] outline-none focus:border-marca-rojoclaro font-data"
      />

      <BotonIngresar />

      {estado.mensaje && (
        <p className="text-marca-rojoclaro mt-4 text-xs font-semibold text-center bg-marca-rojo/10 py-2.5 rounded-[3px] border border-marca-rojo/30 font-body">
          {estado.mensaje}
        </p>
      )}
    </form>
  );
}
