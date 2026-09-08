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
            className={`text-left rounded-xl border-2 p-3 transition ${
              seleccionado
                ? "border-red-500 bg-red-950/30 ring-2 ring-red-500"
                : o.destacado
                  ? "border-green-600/60 bg-green-950/20 hover:brightness-125"
                  : "border-slate-800 bg-[#0d1117] hover:brightness-125"
            }`}
          >
            <p
              className={`font-bold text-sm truncate ${
                seleccionado ? "text-white" : o.destacado ? "text-green-300" : "text-slate-200"
              }`}
            >
              {o.titulo}
            </p>
            {o.subtitulo && (
              <p className="text-[10px] text-slate-500 uppercase mt-0.5 truncate">{o.subtitulo}</p>
            )}
            {o.destacado && o.etiquetaDestacado && (
              <p className="text-[10px] text-green-400 font-bold mt-1">✓ {o.etiquetaDestacado}</p>
            )}
          </button>
        );
      })}
    </div>
  );
}
