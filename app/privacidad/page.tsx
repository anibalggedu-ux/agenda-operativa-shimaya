import type { Metadata } from "next";
import { PaginaLegal, Seccion } from "../legal/pagina-legal";

export const metadata: Metadata = { title: "Política de privacidad - Agenda Operativa Shimaya" };

export default function Privacidad() {
  return (
    <PaginaLegal titulo="Política de privacidad">
      <Seccion titulo="1. Responsable del tratamiento">
        <p>
          Shimaya S.A.C. (RUC 20600603460) es la responsable de tus datos personales en Agenda Operativa Shimaya, de
          acuerdo con la Ley N.° 29733, Ley de Protección de Datos Personales, y su reglamento.
        </p>
      </Seccion>
      <Seccion titulo="2. Qué datos recolectamos">
        <ul className="list-disc pl-5 space-y-1">
          <li>Datos de tu cuenta: nombre, usuario, rol, correo (si lo registraste) y tiendas asignadas.</li>
          <li>Ubicación GPS al marcar llegada y salida.</li>
          <li>Fotos tomadas en ese momento y fotos de evidencia en checklists de visita.</li>
          <li>Fotos, videos y comentarios que publiques en el feed interno.</li>
          <li>Tu horario, días de descanso, rutas y solicitudes.</li>
          <li>Tu fecha de nacimiento (opcional, solo para mostrar tu cumpleaños en el feed).</li>
          <li>
            Si eres supervisor o capacitador: la ubicación aproximada de tu domicilio (coordenadas redondeadas, sin la
            dirección escrita) se comparte con el sistema interno de Coordinación de Apoyos para proponerte como apoyo
            o capacitador en los locales más cercanos.
          </li>
          <li>Datos técnicos mínimos: tipo de dispositivo y suscripción de notificaciones push.</li>
        </ul>
      </Seccion>
      <Seccion titulo="3. Para qué los usamos">
        <ul className="list-disc pl-5 space-y-1">
          <li>Verificar tu asistencia y tu presencia en los puntos de trabajo.</li>
          <li>Coordinar rutas, turnos, apoyos entre tiendas y descansos.</li>
          <li>Registrar y auditar checklists de visita y mejorar la operación.</li>
          <li>Enviarte recordatorios, anuncios y alertas del equipo.</li>
          <li>Habilitar la comunicación interna y el reconocimiento entre colaboradores.</li>
        </ul>
        <p>No vendemos tus datos ni los usamos para publicidad.</p>
      </Seccion>
      <Seccion titulo="4. Base y consentimiento">
        <p>
          Tratamos estos datos para cumplir la relación laboral y con tu consentimiento, que se solicita al
          ingresar por primera vez y cada vez que el aviso cambia de forma relevante. La ubicación y la cámara solo se
          usan en el momento de la acción (por ejemplo, al marcar), no para seguimiento continuo.
        </p>
      </Seccion>
      <Seccion titulo="5. Con quién los compartimos">
        <p>
          Con el personal autorizado de Shimaya según su rol (supervisores, coordinadores, gerentes y
          administración). También con proveedores que nos prestan servicios técnicos de alojamiento,
          almacenamiento, correo y notificaciones, que actúan por cuenta de Shimaya y pueden operar servidores fuera
          del Perú. Solo compartimos tus datos con autoridades cuando la ley lo exige.
        </p>
      </Seccion>
      <Seccion titulo="6. Cuánto tiempo los conservamos">
        <p>
          Mientras mantengas una relación laboral con Shimaya y el tiempo adicional necesario para cumplir
          obligaciones legales y laborales. Algunos datos operativos, como marcaciones antiguas, se depuran
          periódicamente.
        </p>
      </Seccion>
      <Seccion titulo="7. Seguridad">
        <p>
          Protegemos la información con acceso por usuario y clave, permisos por rol, conexión cifrada y copias de
          seguridad. Ningún sistema es infalible: protege tu clave y avisa si sospechas un uso indebido.
        </p>
      </Seccion>
      <Seccion titulo="8. Tus derechos (ARCO)">
        <p>
          Puedes pedir acceso, rectificación, cancelación u oposición sobre tus datos, y revocar tu consentimiento
          para los usos que no sean necesarios para tu relación laboral. Escribe a{" "}
          <a href="mailto:anibalggedu@gmail.com" className="text-marca-rojoclaro underline">
            anibalggedu@gmail.com
          </a>{" "}
          indicando tu nombre y qué solicitas. Si consideras que no atendimos tu solicitud, puedes acudir a la
          Autoridad Nacional de Protección de Datos Personales.
        </p>
      </Seccion>
      <Seccion titulo="9. Notificaciones y permisos del dispositivo">
        <p>
          Puedes desactivar las notificaciones desde Mi Agenda y retirar los permisos de ubicación o cámara desde
          los ajustes de tu dispositivo. Sin esos permisos, funciones como marcar asistencia no estarán disponibles.
        </p>
      </Seccion>
      <Seccion titulo="10. Cambios">
        <p>
          Si esta política cambia de forma relevante, te lo informaremos dentro de la Aplicación y volveremos a
          pedir tu aceptación.
        </p>
      </Seccion>
    </PaginaLegal>
  );
}
