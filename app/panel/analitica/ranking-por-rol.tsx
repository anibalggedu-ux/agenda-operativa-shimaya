"use client";

type Fila = { nombre: string; valor: number };

function Columna({
  titulo,
  filas,
  sufijo,
  vacio,
}: {
  titulo: string;
  filas: Fila[];
  sufijo: string;
  vacio: string;
}) {
  return (
    <div className="bg-[#0d1117] border border-slate-800 rounded-xl p-4">
      <h4 className="text-xs font-black tracking-widest text-slate-300 mb-3">{titulo}</h4>
      {filas.length === 0 ? (
        <p className="text-slate-500 text-sm italic">{vacio}</p>
      ) : (
        <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
          {filas.map((f, i) => (
            <div
              key={f.nombre}
              className="flex items-center justify-between bg-[#07080c] border border-slate-800 rounded-lg px-3 py-2"
            >
              <span className="text-sm text-white truncate">
                <span className="text-slate-600 font-black mr-2">{i + 1}.</span>
                {f.nombre}
              </span>
              <span className="text-yellow-400 font-black text-xs shrink-0 ml-2">
                {f.valor} {sufijo}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function RankingPorRol({
  supervisores,
  capacitadores,
  sufijo,
  vacio,
}: {
  supervisores: Fila[];
  capacitadores: Fila[];
  sufijo: string;
  vacio: string;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Columna titulo="SUPERVISORES" filas={supervisores} sufijo={sufijo} vacio={vacio} />
      <Columna titulo="CAPACITADORES" filas={capacitadores} sufijo={sufijo} vacio={vacio} />
    </div>
  );
}
