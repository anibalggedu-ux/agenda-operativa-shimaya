"use client";

import { useEffect, useRef, useState } from "react";
import { obtenerUsuariosParaMencion, type UsuarioParaMencion } from "./actions";

// Textarea con autocompletado de @menciones -- al escribir "@" y letras,
// ofrece una lista de colaboradores activos para tocar en vez de tener que
// acertar el nombre a mano. El servidor (ver notificarMencionesHistoria en
// actions.ts) resuelve el texto final de la misma forma al publicar, así
// que elegir de la lista no es obligatorio: escribir "@antony" a mano
// también funciona.
export default function TextareaMenciones({
  value,
  onChange,
  placeholder,
  rows,
  maxLength,
  disabled,
  className,
}: {
  value: string;
  onChange: (valor: string) => void;
  placeholder?: string;
  rows?: number;
  maxLength: number;
  disabled?: boolean;
  className?: string;
}) {
  const [usuarios, setUsuarios] = useState<UsuarioParaMencion[]>([]);
  const [sugerencias, setSugerencias] = useState<UsuarioParaMencion[]>([]);
  const [inicioToken, setInicioToken] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    obtenerUsuariosParaMencion()
      .then(setUsuarios)
      .catch(() => setUsuarios([]));
  }, []);

  function manejarCambio(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const nuevo = e.target.value.slice(0, maxLength);
    onChange(nuevo);

    const cursor = e.target.selectionStart ?? nuevo.length;
    const hastaCursor = nuevo.slice(0, cursor);
    const match = hastaCursor.match(/@([a-zA-ZÀ-ÿ0-9_]*)$/);
    if (match && usuarios.length > 0) {
      const consulta = match[1].toLowerCase();
      setInicioToken(cursor - match[0].length);
      setSugerencias(
        (consulta
          ? usuarios.filter((u) => u.nombre.toLowerCase().includes(consulta))
          : usuarios
        ).slice(0, 5)
      );
    } else {
      setInicioToken(null);
      setSugerencias([]);
    }
  }

  function elegirSugerencia(u: UsuarioParaMencion) {
    if (inicioToken === null || !textareaRef.current) return;
    const cursor = textareaRef.current.selectionStart ?? value.length;
    const primerNombre = u.nombre.trim().split(/\s+/)[0];
    const nuevo = (value.slice(0, inicioToken) + `@${primerNombre} ` + value.slice(cursor)).slice(0, maxLength);
    onChange(nuevo);
    setSugerencias([]);
    setInicioToken(null);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={manejarCambio}
        onBlur={() => window.setTimeout(() => setSugerencias([]), 150)}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        className={className}
      />
      {sugerencias.length > 0 && (
        <div className="absolute left-0 right-0 bottom-full mb-1 bg-marca-superficie2 border border-marca-borde rounded-[3px] overflow-hidden shadow-lg z-10 max-h-40 overflow-y-auto">
          {sugerencias.map((u) => (
            <button
              key={u.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => elegirSugerencia(u)}
              className="w-full text-left px-3 py-2 text-xs text-marca-texto hover:bg-marca-rojo/10 transition"
            >
              @{u.nombre}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
