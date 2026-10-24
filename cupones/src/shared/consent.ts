// Texto de consentimiento promocional. El servidor guarda SU copia del texto según la
// versión que el cliente declara haber mostrado; nunca confía en texto enviado por el navegador.

export const CONSENT_TEXT_VERSION = "2026-10-v1";

export const CONSENT_TEXT =
  "Acepto que Shimaya Ramen use mis datos de contacto únicamente para enviarme avisos de " +
  "próximas promociones. Puedo pedir que dejen de contactarme en cualquier momento.";

/** El consentimiento SIEMPRE parte desmarcado: escribir un teléfono o correo no equivale a aceptar. */
export const CONSENT_DEFAULT_CHECKED = false;

export const CONSENT_TEXTS: Record<string, string> = {
  [CONSENT_TEXT_VERSION]: CONSENT_TEXT,
};
