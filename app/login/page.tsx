import { obtenerNombresUsuarios } from "./actions";
import LoginForm from "./login-form";

export default async function LoginPage() {
  const nombres = await obtenerNombresUsuarios();

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#07080c] text-white p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-black tracking-widest">
            <span className="text-cyan-400">AGENDA</span> OPERATIVA
          </h1>
          <p className="text-[11px] text-slate-500 uppercase tracking-[0.2em] mt-1">
            Shimaya
          </p>
        </div>
        <LoginForm nombres={nombres} />
      </div>
    </main>
  );
}
