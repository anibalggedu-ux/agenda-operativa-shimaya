import LoginForm from "./login-form";
import { esTemporadaHalloween } from "@/lib/fechas";

export default function LoginPage() {
  // Octubre: Shimayito aterriza en versión zombie (descolorido, tambaleante,
  // con telarañas) antes de recuperar su color normal -- mismo mecanismo de
  // siempre (animar-intro-mascota), solo con un modificador de clase.
  const halloween = esTemporadaHalloween();
  return (
    <main className="min-h-screen flex items-center justify-center bg-marca-fondo text-marca-texto p-4 font-body">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center text-center mb-8">
          {/* La mascota aparece unos instantes ANTES que el logo oficial: se
              superpone encima, "aterriza" con un rebote y un sello rojo
              pulsa detrás suyo, y al desvanecerse deja ver el logo de
              Shimaya Ramen de siempre (estático, sin cambios) debajo. */}
          <div className="relative w-40 h-40 mb-4 flex items-center justify-center">
            <div
              aria-hidden="true"
              className="animar-intro-sello absolute inset-0 rounded-full bg-marca-rojo blur-2xl"
            />
            {halloween && (
              <>
                <svg
                  aria-hidden
                  viewBox="0 0 60 60"
                  className="telarana-login absolute -top-2 -left-2 w-12 h-12 text-marca-tenue/40 pointer-events-none"
                >
                  <path
                    d="M0 0 L60 0 M0 0 L0 60 M0 0 L22 2 M0 0 L2 22 M0 0 L40 4 M0 0 L4 40 M2 22 L22 2 M4 40 L40 4"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    fill="none"
                  />
                </svg>
                <svg
                  aria-hidden
                  viewBox="0 0 60 60"
                  className="telarana-login absolute -top-2 -right-2 w-12 h-12 text-marca-tenue/40 pointer-events-none"
                  style={{ transform: "scaleX(-1)" }}
                >
                  <path
                    d="M0 0 L60 0 M0 0 L0 60 M0 0 L22 2 M0 0 L2 22 M0 0 L40 4 M0 0 L4 40 M2 22 L22 2 M4 40 L40 4"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    fill="none"
                  />
                </svg>
              </>
            )}
            <img
              src="/logo-shimaya-personaje.png"
              alt=""
              aria-hidden="true"
              className={`animar-intro-mascota absolute inset-0 w-full h-full object-contain drop-shadow-lg ${
                halloween ? "animar-intro-mascota-zombie" : ""
              }`}
            />
            {/* El logo oficial: mismo círculo recortado de siempre, sin
                ningún cambio — solo arranca invisible y se revela cuando la
                mascota termina de desvanecerse. */}
            <div className="animar-logo-oficial relative w-20 h-20 rounded-full overflow-hidden ring-1 ring-marca-rojo/40">
              <img
                src="/logo-shimaya.jpeg"
                alt="Shimaya Ramen"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
          <div className="animar-intro-titulo">
            <h1 className="font-display text-2xl text-marca-textofuerte tracking-wide">
              Agenda Operativa
            </h1>
            <p className="text-[11px] text-marca-rojoclaro uppercase tracking-[0.3em] mt-2 font-data">
              Shimaya
            </p>
          </div>
        </div>
        <div className="animar-intro-form">
          <LoginForm />
        </div>
        <p className="mt-6 text-center text-[11px] text-marca-tenue">
          <a href="/terminos" className="underline">Términos y condiciones</a>
          {" · "}
          <a href="/privacidad" className="underline">Política de privacidad</a>
        </p>
      </div>
    </main>
  );
}
