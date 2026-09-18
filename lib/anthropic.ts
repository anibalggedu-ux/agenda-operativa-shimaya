import Anthropic from "@anthropic-ai/sdk";

// El SDK de Anthropic revienta en el constructor si no encuentra
// ANTHROPIC_API_KEY -- si este cliente se creara a nivel de módulo, CUALQUIER
// página que solo importe una acción de este archivo (aunque nunca llame a la
// IA) se caería entera mientras la variable no esté configurada en Vercel.
// Por eso se crea recién adentro de la función, la primera vez que de verdad
// se necesita.
let cliente: Anthropic | null = null;

export function obtenerClienteAnthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("La IA no está configurada todavía (falta la API key en el servidor).");
  }
  if (!cliente) cliente = new Anthropic();
  return cliente;
}
