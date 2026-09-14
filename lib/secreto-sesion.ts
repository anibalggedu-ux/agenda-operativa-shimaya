// El rol del usuario viaja dentro de un JWT FIRMADO con este secreto. Si el
// secreto fuera adivinable, cualquiera podria fabricarse una sesion de gerente.
//
// Antes, tanto lib/session.ts como middleware.ts hacian:
//   process.env.SESSION_SECRET || "cambia-este-secreto-en-produccion"
// Ese fallback esta a la vista en un repo PUBLICO: si por lo que sea la
// variable no estuviera cargada en Vercel, la app firmaba las sesiones con un
// texto conocido y el candado de roles quedaba abierto sin que nadie lo notara.
//
// Ahora en produccion la app se niega a arrancar si falta SESSION_SECRET
// (falla ruidosa y visible en vez de un hueco silencioso). En desarrollo
// local se permite un valor por defecto para no obligar a configurar el .env
// solo para levantar el proyecto.
function obtenerSecreto(): string {
  const secreto = process.env.SESSION_SECRET;
  if (secreto && secreto.length > 0) return secreto;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET no esta configurado. Cargalo en las variables de entorno " +
        "antes de desplegar: sin el, las sesiones se firmarian con un secreto " +
        "publico y cualquiera podria falsificar un rol."
    );
  }

  return "secreto-solo-para-desarrollo-local-no-usar-en-produccion";
}

export const SECRETO_SESION = new TextEncoder().encode(obtenerSecreto());
