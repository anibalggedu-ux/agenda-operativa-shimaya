"use server";

import { supabaseServer } from "@/lib/supabase-server";
import { exigirAccesoRegistro } from "./actions";
import type { ItemChecklist, SeccionChecklist } from "../checklist-visita-actions";

// ---------------------------------------------------------------------
// Edición de la plantilla del checklist de rutina de visita desde Registro.
// Se puede editar la etiqueta de cada pregunta, sus opciones (si es de tipo
// "opciones"), y agregar o quitar preguntas dentro de una sección existente.
// El TIPO de una pregunta (escala, sí/no, opciones, texto, número) no se
// puede cambiar una vez creada -- si hace falta un tipo distinto, se elimina
// y se agrega una pregunta nueva. Las secciones (Caja, Cocina, etc.) son
// fijas por ahora.
// ---------------------------------------------------------------------

async function cargarSecciones(): Promise<{ secciones: SeccionChecklist[]; supabase: ReturnType<typeof supabaseServer> }> {
  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("plantilla_checklist_visita")
    .select("secciones")
    .eq("id", "principal")
    .maybeSingle();

  if (error || !data) throw new Error("No se pudo cargar la plantilla del checklist.");
  return { secciones: data.secciones as unknown as SeccionChecklist[], supabase };
}

export type ResultadoRegistroChecklist = { exito: boolean; mensaje?: string };

export async function actualizarItemChecklistPlantilla(
  seccionClave: string,
  itemClave: string,
  cambios: { etiqueta?: string; opciones?: string[] }
): Promise<ResultadoRegistroChecklist> {
  await exigirAccesoRegistro();
  const { secciones, supabase } = await cargarSecciones();

  let encontrado = false;
  const nuevasSecciones = secciones.map((s) => {
    if (s.clave !== seccionClave) return s;
    return {
      ...s,
      items: s.items.map((it) => {
        if (it.clave !== itemClave) return it;
        encontrado = true;
        return {
          ...it,
          etiqueta: cambios.etiqueta?.trim() ? cambios.etiqueta.trim() : it.etiqueta,
          opciones: cambios.opciones ?? it.opciones,
        };
      }),
    };
  });

  if (!encontrado) return { exito: false, mensaje: "No se encontró la pregunta." };

  const { error } = await supabase
    .from("plantilla_checklist_visita")
    .update({ secciones: nuevasSecciones, actualizado_en: new Date().toISOString() })
    .eq("id", "principal");

  if (error) return { exito: false, mensaje: "No se pudo guardar el cambio." };
  return { exito: true };
}

export async function agregarItemChecklistPlantilla(
  seccionClave: string,
  item: ItemChecklist
): Promise<ResultadoRegistroChecklist> {
  await exigirAccesoRegistro();

  if (!item.clave.trim() || !item.etiqueta.trim()) {
    return { exito: false, mensaje: "Completa la clave y la etiqueta de la pregunta." };
  }
  if (item.tipo === "opciones" && (!item.opciones || item.opciones.length < 2)) {
    return { exito: false, mensaje: "Una pregunta de opción múltiple necesita al menos 2 opciones." };
  }

  const { secciones, supabase } = await cargarSecciones();

  let encontrado = false;
  const nuevasSecciones = secciones.map((s) => {
    if (s.clave !== seccionClave) return s;
    encontrado = true;
    if (s.items.some((it) => it.clave === item.clave)) {
      throw new Error("DUPLICADA");
    }
    return { ...s, items: [...s.items, item] };
  });

  if (!encontrado) return { exito: false, mensaje: "No se encontró la sección." };

  try {
    const { error } = await supabase
      .from("plantilla_checklist_visita")
      .update({ secciones: nuevasSecciones, actualizado_en: new Date().toISOString() })
      .eq("id", "principal");
    if (error) return { exito: false, mensaje: "No se pudo guardar la pregunta." };
  } catch {
    return { exito: false, mensaje: "Ya existe una pregunta con esa clave en esta sección." };
  }

  return { exito: true };
}

export async function eliminarItemChecklistPlantilla(
  seccionClave: string,
  itemClave: string
): Promise<ResultadoRegistroChecklist> {
  await exigirAccesoRegistro();
  const { secciones, supabase } = await cargarSecciones();

  const nuevasSecciones = secciones.map((s) => {
    if (s.clave !== seccionClave) return s;
    return { ...s, items: s.items.filter((it) => it.clave !== itemClave) };
  });

  const { error } = await supabase
    .from("plantilla_checklist_visita")
    .update({ secciones: nuevasSecciones, actualizado_en: new Date().toISOString() })
    .eq("id", "principal");

  if (error) return { exito: false, mensaje: "No se pudo eliminar la pregunta." };
  return { exito: true };
}
