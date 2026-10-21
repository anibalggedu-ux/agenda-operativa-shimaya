"use client";

// Mismo propósito que app/error.tsx, pero para un error dentro del layout
// raíz mismo (muy raro, pero posible) -- Next.js exige que este archivo
// dibuje su propio <html>/<body> porque reemplaza TODO el documento,
// layout incluido, así que no puede depender de globals.css ni de las
// variables de marca (--marca-*) definidas ahí -- por eso los estilos acá
// van en línea, a mano, con los mismos tonos oscuros del resto de la app.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="es">
      <body style={{ margin: 0, background: "#0a0a0b", color: "#efe9df", fontFamily: "sans-serif" }}>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <div style={{ maxWidth: 380, textAlign: "center" }}>
            <h1 style={{ fontWeight: 900, fontSize: 14, textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>
              Algo no cargó bien
            </h1>
            <p style={{ color: "#928a7e", fontSize: 14, marginTop: 12 }}>
              Puede ser que estés sin señal. Probá de nuevo.
            </p>
            <button
              onClick={() => reset()}
              style={{
                marginTop: 16,
                background: "rgb(211 30 43)",
                color: "#f8f3eb",
                fontWeight: 900,
                padding: "10px 20px",
                borderRadius: 3,
                border: "none",
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                cursor: "pointer",
              }}
            >
              Reintentar
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
