// Sonidos de la app, estilo "koto japonés": cuerda pulsada con la escala
// miyako-bushi (Mi, Fa, La, Si, Do), para que la app suene a Shimaya. Se
// generan con la Web Audio API en vez de cargar archivos .mp3: no hay ningún
// asset que mantener ni bajar, y funciona igual en cualquier celular.
//
// El AudioContext se crea una sola vez y se reutiliza — crear uno nuevo en
// cada marcación va agotando los que el navegador permite tener abiertos.
let contexto: AudioContext | null = null;
let salida: AudioNode | null = null;

// Volumen de cada nota. Alto a propósito (se usa en cocina, con ruido): el
// compresor de salida evita que se sature cuando suenan varias notas juntas.
const VOLUMEN = 0.45;

function obtenerContexto(): { ctx: AudioContext; destino: AudioNode } | null {
  if (typeof window === "undefined") return null;
  try {
    if (!contexto) {
      const Constructor = window.AudioContext || (window as any).webkitAudioContext;
      if (!Constructor) return null;
      contexto = new Constructor();
      const compresor = contexto.createDynamicsCompressor();
      compresor.threshold.value = -10;
      compresor.knee.value = 6;
      compresor.ratio.value = 4;
      compresor.connect(contexto.destination);
      salida = compresor;
    }
    // Los navegadores suspenden el AudioContext hasta el primer gesto del
    // usuario; a esta altura casi siempre ya hubo uno, pero por las dudas se
    // intenta reanudar antes de sonar.
    if (contexto.state === "suspended") {
      contexto.resume().catch(() => {});
    }
    return { ctx: contexto, destino: salida ?? contexto.destination };
  } catch {
    return null;
  }
}

// Una nota de koto: onda brillante que pasa por un filtro que se va cerrando
// rápido, como una cuerda pulsada que se apaga.
function notaKoto(ctx: AudioContext, destino: AudioNode, frecuencia: number, inicio: number, duracion: number) {
  const osc = ctx.createOscillator();
  const filtro = ctx.createBiquadFilter();
  const ganancia = ctx.createGain();

  osc.type = "sawtooth";
  osc.frequency.value = frecuencia;

  filtro.type = "lowpass";
  filtro.Q.value = 6;
  filtro.frequency.setValueAtTime(frecuencia * 6, inicio);
  filtro.frequency.exponentialRampToValueAtTime(frecuencia * 1.2, inicio + 0.25);

  // Envolvente rápida para que no "chasquee" al empezar ni al cortar.
  ganancia.gain.setValueAtTime(0, inicio);
  ganancia.gain.linearRampToValueAtTime(VOLUMEN, inicio + 0.01);
  ganancia.gain.exponentialRampToValueAtTime(0.0001, inicio + duracion);

  osc.connect(filtro);
  filtro.connect(ganancia);
  ganancia.connect(destino);
  osc.start(inicio);
  osc.stop(inicio + duracion + 0.05);
}

function tocar(notas: number[], paso: number, duracion = 0.5): void {
  const audio = obtenerContexto();
  if (!audio) return;
  try {
    const ahora = audio.ctx.currentTime + 0.02;
    notas.forEach((f, i) => notaKoto(audio.ctx, audio.destino, f, ahora + i * paso, duracion));
  } catch {
    // El sonido es un plus: si el navegador lo bloquea, lo que se guardó ya
    // quedó guardado igual — nunca debe interrumpir el flujo.
  }
}

// Al guardar algo (marcar llegada/salida, reportar, votar, reaccionar,
// comentar): dos notas ascendentes, Mi → La.
export function reproducirSonidoExito(): void {
  tocar([659, 880], 0.1);
}

// Algo nuevo que llegó solo, sin que la persona hiciera nada (comentario,
// reacción o regalo en la campanita): La → Mi, descendente.
export function reproducirSonidoNotificacion(): void {
  tocar([880, 659], 0.1);
}

// Algo salió mal o requiere atención: Mi → Fa (el semitono de la escala
// japonesa, tenso a propósito) y más largo.
export function reproducirSonidoAlerta(): void {
  tocar([330, 349], 0.1, 0.6);
}

// Premio o buen resultado (puntos recibidos, nota alta): arpegio ascendente.
export function reproducirSonidoLogro(): void {
  tocar([659, 698, 880, 988, 1319], 0.085);
}

// Aviso suave de algo pendiente (evento o encuesta nueva): dos La iguales.
export function reproducirSonidoRecordatorio(): void {
  tocar([880, 880], 0.18);
}
