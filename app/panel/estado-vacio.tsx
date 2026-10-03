// Estado vacío con un poco de personalidad: un ícono en vez de dejar solo
// una línea de texto en cursiva. Se usa en los lugares con más tráfico
// ("todavía no hay nada acá") en vez del antiguo <p className="italic">.
export default function EstadoVacio({ mensaje }: { mensaje: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgb(var(--marca-oro))" strokeWidth="1.6">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
      <p className="text-marca-tenue text-[12.5px] max-w-xs">{mensaje}</p>
    </div>
  );
}
