import LoginForm from "./login-form";

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-marca-fondo text-marca-texto p-4 font-body">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center text-center mb-8">
          {/* El logo ya viene recortado en círculo (JPEG sin transparencia
              real), así que se enmarca en un círculo del mismo tamaño para
              que el cuadrado blanco de las esquinas no se muestre. */}
          <div className="w-20 h-20 rounded-full overflow-hidden mb-4 ring-1 ring-marca-rojo/40">
            <img
              src="/logo-shimaya.jpeg"
              alt="Shimaya Ramen"
              className="w-full h-full object-cover"
            />
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
