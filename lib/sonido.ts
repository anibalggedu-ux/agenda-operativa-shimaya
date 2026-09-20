// Sonido corto de confirmación al registrar algo en Bitácora de Campo
// (marcación de llegada/salida con foto, o al subir una observación). Se
// genera con la Web Audio API en vez de cargar un archivo .mp3: no hay
// ningún asset que mantener ni bajar, y funciona igual en cualquier celular.
//
// El AudioContext se crea una sola vez y se reutiliza — crear uno nuevo en
// cada marcación va agotando los que el navegador permite tener abiertos.
let contexto: AudioContext | null = null;

function obtenerContexto(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!contexto) {
      const Constructor = window.AudioContext || (window as any).webkitAudioContext;
      if (!Constructor) return null;
      contexto = new Constructor();
    }
    return contexto;
  } catch {
    return null;
  }
}

// Un "ding" de dos notas ascendentes, corto (≈250ms) y suave — pensado para
// sonar bien seguido varias veces por día sin volverse molesto.
export function reproducirSonidoExito(): void {
  const ctx = obtenerContexto();
  if (!ctx) return;

  try {
    // Los navegadores suspenden el AudioContext hasta el primer gesto del
    // usuario; a esta altura ya hubo uno (el click que disparó la acción),
    // pero por las dudas se intenta reanudar antes de sonar.
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    const ahora = ctx.currentTime;
    const notas = [880, 1175]; // A5 → D6

    notas.forEach((frecuencia, i) => {
      const inicio = ahora + i * 0.09;
      const osc = ctx.createOscillator();
      const ganancia = ctx.createGain();

      osc.type = "sine";
      osc.frequency.value = frecuencia;

      // Envolvente rápida para que no "chasquee" al empezar ni al cortar.
      ganancia.gain.setValueAtTime(0, inicio);
      ganancia.gain.linearRampToValueAtTime(0.18, inicio + 0.015);
      ganancia.gain.exponentialRampToValueAtTime(0.0001, inicio + 0.22);

      osc.connect(ganancia);
      ganancia.connect(ctx.destination);
      osc.start(inicio);
      osc.stop(inicio + 0.25);
    });
  } catch {
    // Si el navegador bloquea el audio por lo que sea, la marcación u
    // observación ya se guardó igual — el sonido es un plus, nunca algo
    // que deba interrumpir el flujo si falla.
  }
}

// Aviso corto y distinto al "ding" de éxito -- para notificaciones nuevas
// (comentario, reacción o regalo recibido) que aparecen solas mientras la
// persona tiene la app abierta, sin que ella haya hecho nada.
export function reproducirSonidoNotificacion(): void {
  const ctx = obtenerContexto();
  if (!ctx) return;

  try {
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    const ahora = ctx.currentTime;
    const notas = [1046, 784]; // C6 → G5, descendente (distinto al ding ascendente)

    notas.forEach((frecuencia, i) => {
      const inicio = ahora + i * 0.1;
      const osc = ctx.createOscillator();
      const ganancia = ctx.createGain();

      osc.type = "sine";
      osc.frequency.value = frecuencia;

      ganancia.gain.setValueAtTime(0, inicio);
      ganancia.gain.linearRampToValueAtTime(0.16, inicio + 0.015);
      ganancia.gain.exponentialRampToValueAtTime(0.0001, inicio + 0.25);

      osc.connect(ganancia);
      ganancia.connect(ctx.destination);
      osc.start(inicio);
      osc.stop(inicio + 0.28);
    });
  } catch {
    // El sonido es un plus -- nunca debe interrumpir el flujo si falla.
  }
}
