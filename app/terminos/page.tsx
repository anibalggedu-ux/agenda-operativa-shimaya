import type { Metadata } from "next";
import { PaginaLegal, Seccion } from "../legal/pagina-legal";

export const metadata: Metadata = { title: "Términos y condiciones - Agenda Operativa Shimaya" };

export default function Terminos() {
  return (
    <PaginaLegal titulo="Términos y condiciones de uso">
      <Seccion titulo="1. Quiénes somos y qué es esta aplicación">
        <p>
          Agenda Operativa Shimaya (la &quot;Aplicación&quot;) es una herramienta interna de Shimaya S.A.C. (RUC
          20600603460, en adelante &quot;Shimaya&quot;) para coordinar la operación de sus tiendas: rutas, marcaciones
          de llegada y salida, checklists de visita, auditorías, horarios, comunicados y comunicación entre
          colaboradores.
        </p>
      </Seccion>
      <Seccion titulo="2. Quién puede usarla">
        <p>
          Solo los colaboradores de Shimaya a quienes la empresa les haya creado una cuenta. La Aplicación es de uso
          laboral: no es un servicio público ni de uso personal.
        </p>
      </Seccion>
      <Seccion titulo="3. Tu cuenta">
        <ul className="list-disc pl-5 space-y-1">
          <li>Tu usuario y tu clave son personales e intransferibles. No los compartas ni los prestes.</li>
          <li>Eres responsable de lo que se haga con tu cuenta. Si crees que alguien la usó, avisa de inmediato.</li>
          <li>Shimaya puede suspender o cerrar una cuenta cuando termina la relación laboral o por mal uso.</li>
        </ul>
      </Seccion>
      <Seccion titulo="4. Uso correcto">
        <p>Te comprometes a:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Registrar información real y completa: marcaciones, checklists, reportes y fotos de evidencia.</li>
          <li>Marcar tu llegada y salida solo estando en el lugar, sin manipular la ubicación del dispositivo.</li>
          <li>Tratar con respeto a tus compañeros en el feed, comentarios y mensajes.</li>
          <li>No publicar contenido ofensivo, discriminatorio, ilegal o ajeno al trabajo.</li>
          <li>No intentar acceder a información, funciones o cuentas que no te corresponden.</li>
        </ul>
      </Seccion>
      <Seccion titulo="5. Contenido interno y confidencialidad">
        <p>
          Las fotos, videos, reportes, checklists, auditorías, horarios, cifras y demás información de la Aplicación
          son de uso exclusivo del equipo de Shimaya. No deben copiarse, descargarse, compartirse ni difundirse fuera
          de la empresa (por ejemplo, en redes sociales o grupos externos) sin autorización escrita.
        </p>
        <p>
          El contenido que publiques (fotos, videos, comentarios) lo puede ver el equipo según los permisos de cada
          rol. Shimaya puede usarlo internamente para fines operativos, de capacitación y reconocimiento del equipo.
        </p>
      </Seccion>
      <Seccion titulo="6. Ubicación, fotos y notificaciones">
        <p>
          Para marcar asistencia y verificar visitas, la Aplicación usa la ubicación GPS y la cámara de tu
          dispositivo en el momento de la acción. También puede enviarte notificaciones push (recordatorios,
          anuncios, rutas y alertas del equipo), que puedes desactivar desde Mi Agenda. El detalle de cómo se tratan
          estos datos está en la{" "}
          <a href="/privacidad" className="text-marca-rojoclaro underline">
            Política de privacidad
          </a>
          .
        </p>
      </Seccion>
      <Seccion titulo="7. Acceso de supervisión">
        <p>
          Los supervisores, coordinadores y gerentes pueden consultar información operativa de las tiendas, incluidos
          los horarios y apoyos, mediante accesos de solo lectura desde la Aplicación. Estos accesos son temporales,
          están ligados a tu sesión y quedan sujetos a las mismas reglas de confidencialidad.
        </p>
      </Seccion>
      <Seccion titulo="8. Incumplimientos">
        <p>
          El uso indebido de la Aplicación (datos falsos, suplantación, filtración de información, acoso o intento de
          vulnerar la seguridad) puede dar lugar a medidas disciplinarias conforme al Reglamento Interno de Trabajo y
          a la normativa laboral peruana, además de las acciones legales que correspondan.
        </p>
      </Seccion>
      <Seccion titulo="9. Disponibilidad y cambios en la Aplicación">
        <p>
          Hacemos lo posible para que la Aplicación funcione siempre, pero puede haber interrupciones por
          mantenimiento o fallas de terceros (internet, proveedores). Shimaya puede modificar, añadir o retirar
          funciones. La Aplicación se ofrece como herramienta de apoyo; las decisiones laborales siguen siendo de la
          empresa.
        </p>
      </Seccion>
      <Seccion titulo="10. Cambios en estos términos">
        <p>
          Podemos actualizar estos términos. Cuando el cambio sea relevante te lo informaremos dentro de la
          Aplicación y podremos pedirte que lo aceptes de nuevo. Seguir usándola después de un cambio implica que
          lo aceptas.
        </p>
      </Seccion>
      <Seccion titulo="11. Ley aplicable y contacto">
        <p>
          Estos términos se rigen por las leyes de la República del Perú. Para consultas, reclamos o ejercer tus
          derechos, escribe a{" "}
          <a href="mailto:anibalggedu@gmail.com" className="text-marca-rojoclaro underline">
            anibalggedu@gmail.com
          </a>
          .
        </p>
      </Seccion>
    </PaginaLegal>
  );
}
