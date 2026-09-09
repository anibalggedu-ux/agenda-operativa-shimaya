"use client";

export type OpcionGrid = {
  id: string;
  titulo: string;
  subtitulo?: string;
  destacado?: boolean;
  etiquetaDestacado?: string;
};

export default function SelectorGrid({
  opciones,
  seleccionadoId,
  onSeleccionar,
}: {
  opciones: OpcionGrid[];
  seleccionadoId: string | null;
  onSeleccionar: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-72 overflow-y-auto pr-1">
      {opciones.map((o) => {
        const seleccionado = seleccionadoId === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onSeleccionar(o.id)}
            className={`text-left rounded-[3px] border-2 p-3 transition ${
              seleccionado
                ? "border-marca-rojo bg-marca-rojo/20 ring-2 ring-marca-rojo"
                : o.destacado
                  ? "border-emerald-600/60 bg-emerald-950/20 hover:brightness-125"
                  : "border-marca-borde bg-marca-fondo hover:brightness-125"
            }`}
          >
            <p
              className={`font-bold text-sm truncate ${
                seleccionado ? "text-marca-textofuerte" : o.destacado ? "text-emerald-300" : "text-marca-texto"
              }`}
            >
              {o.titulo}
            </p>
            {o.subtitulo && (
              <p className="text-[10px] text-marca-tenue uppercase mt-0.5 truncate">{o.subtitulo}</p>
            )}
            {o.destacado && o.etiquetaDestacado && (
              <p className="text-[10px] text-emerald-400 font-bold mt-1">✓ {o.etiquetaDestacado}</p>
            )}
          </button>
        );
      })}
    </div>
  );
}
