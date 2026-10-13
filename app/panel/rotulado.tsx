import { Tag } from "lucide-react";

// Acceso directo a "Rotulado" (app aparte de la empresa, para armar
// rótulos/etiquetas de tienda). Pestaña propia del menú, visible para los 4
// roles -- a diferencia de Apoyos/Libro/Propinas, no vive dentro de Central
// Analítica porque capacitador no tiene acceso a esa pestaña.
const URL_ROTULADO = "https://shimaya-rotulos.shimaya-formatos.workers.dev/";

export default function Rotulado() {
  return (
    <div className="bg-marca-superficie border border-marca-borde rounded-[3px] p-6 flex flex-col items-center text-center gap-3 max-w-md mx-auto">
      <span className="text-marca-rojoclaro">
        <Tag className="w-8 h-8" />
      </span>
      <div>
        <h3 className="text-marca-textofuerte font-display text-lg font-semibold">Rotulado</h3>
        <p className="text-marca-tenue text-xs mt-1">
          Arma los rótulos y etiquetas de tu tienda.
        </p>
      </div>
      <a
        href={URL_ROTULADO}
        target="_blank"
        rel="noopener"
        className="w-full bg-marca-rojo hover:bg-marca-rojoclaro text-marca-textofuerte font-black py-2.5 rounded-[3px] text-xs tracking-widest uppercase transition flex items-center justify-center"
      >
        Abrir Rotulado
      </a>
    </div>
  );
}
