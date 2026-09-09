import LoginForm from "./login-form";

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-marca-fondo text-marca-texto p-4 font-body">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center text-center mb-8">
          {/* Marca de logo temporal — se reemplaza por el logo real de la
              empresa en cuanto lo envíen (PNG/SVG, fondo transparente). */}
          <div className="w-14 h-14 rounded-full bg-marca-rojo text-marca-textofuerte flex items-center justify-center font-display italic text-lg mb-4">
            AS
          </div>
          <h1 className="font-display text-2xl text-marca-textofuerte tracking-wide">
            Agenda Operativa
          </h1>
          <p className="text-[11px] text-marca-rojoclaro uppercase tracking-[0.3em] mt-2 font-data">
            Shimaya
          </p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
