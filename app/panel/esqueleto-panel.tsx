// Esqueleto de carga para loading.tsx de cada ruta bajo /panel -- se ve
// mientras el servidor arma la página (sesión + datos iniciales), en vez de
// pantalla en blanco. Reproduce a grandes rasgos la forma de PanelShell
// (barra superior, menú lateral, contenido) con bloques .bloque-shimmer
// (ver globals.css) en lugar de texto real.
export default function EsqueletoPanel() {
  return (
    <div className="relative min-h-screen bg-marca-fondo text-marca-texto font-body">
      <div className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-marca-borde bg-marca-superficie px-4 sm:px-6 py-3">
        <div className="bloque-shimmer h-5 w-40" />
        <div className="flex items-center gap-2 shrink-0">
          <div className="bloque-shimmer h-9 w-9 rounded-[3px]" />
          <div className="bloque-shimmer h-9 w-9 rounded-[3px]" />
          <div className="bloque-shimmer h-9 w-24 rounded-[3px]" />
        </div>
      </div>

      <div className="relative z-10 p-4 sm:p-6 pb-24 lg:pb-6">
        <div className="bloque-shimmer h-16 w-full rounded-2xl mb-4" />

        <div className="flex flex-col lg:flex-row border border-marca-borde rounded-[3px] overflow-hidden">
          <aside className="hidden lg:flex lg:flex-col w-56 shrink-0 bg-marca-superficie border-r border-marca-borde p-2 gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bloque-shimmer h-8 w-full" />
            ))}
          </aside>

          <div className="flex-1 min-w-0 flex flex-col bg-marca-fondo p-4 sm:p-6 gap-3">
            <div className="bloque-shimmer h-5 w-40" />
            <div className="bloque-shimmer h-28 w-full" />
            <div className="flex gap-3">
              <div className="bloque-shimmer h-20 flex-1" />
              <div className="bloque-shimmer h-20 flex-1" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
