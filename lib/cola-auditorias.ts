// Cola de auditorías que no se pudieron guardar por falta de señal -- mismo
// problema y misma solución que lib/cola-checklists.ts (estacionamientos
// subterráneos, tiendas con poca cobertura). El formulario de auditoría es
// el más largo de la app (40+ ítems) y ya se somete como FormData a una
// Server Action (crearAuditoria) -- acá se guarda esa misma FormData
// "aplanada" a un objeto plano serializable (mismo formato que ya usaba el
// borrador en auditoria-form.tsx) para poder reconstruirla y reintentar el
// envío real más tarde, sin depender de que el formulario siga abierto. No
// incluye las fotos de evidencia -- esas se suben recién después de que la
// auditoría ya tiene un id, así que si el guardado en sí nunca llegó al
// servidor, tampoco había fotos que reintentar; quedan para agregarlas a
// mano editando la auditoría una vez sincronizada.

export type DatosFormularioAuditoria = Record<string, string | string[]>;

export type AuditoriaPendiente = {
  id: string;
  datos: DatosFormularioAuditoria;
  // Para mostrar en el aviso de "pendientes" sin tener que recargar datos.
  etiqueta: string;
};

const CLAVE = "shimaya_auditorias_pendientes";
const EVENTO_CAMBIO = "shimaya:cola-auditorias-cambio";

export function obtenerAuditoriasPendientes(): AuditoriaPendiente[] {
  if (typeof window === "undefined") return [];
  try {
    const crudo = window.localStorage.getItem(CLAVE);
    return crudo ? JSON.parse(crudo) : [];
  } catch {
    return [];
  }
}

export function agregarAuditoriaPendiente(item: AuditoriaPendiente): void {
  if (typeof window === "undefined") return;
  try {
    const actuales = obtenerAuditoriasPendientes();
    window.localStorage.setItem(CLAVE, JSON.stringify([...actuales, item]));
    window.dispatchEvent(new Event(EVENTO_CAMBIO));
  } catch (error) {
    console.error("No se pudo guardar la auditoría pendiente:", error);
  }
}

export function quitarAuditoriaPendiente(id: string): void {
  if (typeof window === "undefined") return;
  try {
    const restantes = obtenerAuditoriasPendientes().filter((a) => a.id !== id);
    window.localStorage.setItem(CLAVE, JSON.stringify(restantes));
    window.dispatchEvent(new Event(EVENTO_CAMBIO));
  } catch (error) {
    console.error("No se pudo actualizar la cola de auditorías:", error);
  }
}

export function suscribirseACambiosDeColaAuditorias(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENTO_CAMBIO, callback);
  return () => window.removeEventListener(EVENTO_CAMBIO, callback);
}

// Aplana una FormData a un objeto plano serializable en JSON -- "alertas" (y
// cualquier otro campo con más de un valor, como los checkboxes repetidos)
// queda como arreglo, el resto como string. El mismo formato ya se usaba
// para el borrador de auditoria-form.tsx.
export function serializarFormData(form: HTMLFormElement): DatosFormularioAuditoria {
  const datos: DatosFormularioAuditoria = {};
  for (const [clave, valor] of new FormData(form).entries()) {
    if (typeof valor !== "string") continue;
    const previo = datos[clave];
    if (previo === undefined) {
      datos[clave] = valor;
    } else if (Array.isArray(previo)) {
      previo.push(valor);
    } else {
      datos[clave] = [previo, valor];
    }
  }
  return datos;
}

export function construirFormData(datos: DatosFormularioAuditoria): FormData {
  const formData = new FormData();
  for (const [clave, valor] of Object.entries(datos)) {
    if (Array.isArray(valor)) {
      valor.forEach((v) => formData.append(clave, v));
    } else {
      formData.append(clave, valor);
    }
  }
  return formData;
}
