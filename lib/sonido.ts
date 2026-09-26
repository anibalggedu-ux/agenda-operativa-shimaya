// Sonidos de la app, estilo "koto japonés": cuerda pulsada con la escala
// miyako-bushi (Mi, Fa, La, Si, Do), para que la app suene a Shimaya. Se
// generan con la Web Audio API en vez de cargar archivos .mp3: no hay ningún
// asset que mantener ni bajar, y funciona igual en cualquier celular.
//
// Cada sonido vibra además el celular (donde el navegador lo permite:
// Android sí, iPhone no), para cuando está en silencio o hay mucho ruido.
// Cada persona puede apagar el sonido y/o la vibración desde Mi perfil.
//
// El AudioContext se crea una sola vez y se reutiliza — crear uno nuevo en
// cada marcación va agotando los que el navegador permite tener abiertos.
let contexto: AudioContext | null = null;
let salida: AudioNode | null = null;

// Volumen alto a propósito (la app se usa en cocina, con ruido). El
// compresor + ganancia final lo lleva al máximo que aguanta el parlante sin
// distorsionar, y cada nota suena doblada una octava arriba, que es el rango
// que mejor reproducen los parlantes de celular.
const VOLUMEN_NOTA = 0.9;
const GANANCIA_FINAL = 1.8;

// ---- Preferencias (por celular) ----
const CLAVE_SIN_SONIDO = "shimaya_sin_sonido";
const CLAVE_SIN_VIBRACION = "shimaya_sin_vibracion";

function leerPreferencia(clave: string): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(clave) === "1";
  } catch {
    return false;
  }
}

function guardarPreferencia(clave: string, valor: boolean): void {
  try {
    if (valor) window.localStorage.setItem(clave, "1");
    else window.localStorage.removeItem(clave);
  } catch {
    // Sin almacenamiento (modo privado): la preferencia dura solo esta visita.
  }
}

export function sonidoActivado(): boolean {
  return !leerPreferencia(CLAVE_SIN_SONIDO);
}

export function vibracionActivada(): boolean {
  return !leerPreferencia(CLAVE_SIN_VIBRACION);
}

export function cambiarSonido(activado: boolean): void {
  guardarPreferencia(CLAVE_SIN_SONIDO, !activado);
}

export function cambiarVibracion(activada: boolean): void {
  guardarPreferencia(CLAVE_SIN_VIBRACION, !activada);
}

// ---- Audio ----
function obtenerContexto(): { ctx: AudioContext; destino: AudioNode } | null {
  if (typeof window === "undefined") return null;
  try {
    if (!contexto) {
      const Constructor = window.AudioContext || (window as any).webkitAudioContext;
      if (!Constructor) return null;
      contexto = new Constructor();
      const compresor = contexto.createDynamicsCompressor();
      compresor.threshold.value = -18;
      compresor.knee.value = 4;
      compresor.ratio.value = 8;
      compresor.attack.value = 0.002;
      compresor.release.value = 0.15;
      const final = contexto.createGain();
      final.gain.value = GANANCIA_FINAL;
      compresor.connect(final);
      final.connect(contexto.destination);
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
function notaKoto(
  ctx: AudioContext,
  destino: AudioNode,
  frecuencia: number,
  inicio: number,
  duracion: number,
  volumen: number
) {
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
  ganancia.gain.linearRampToValueAtTime(volumen, inicio + 0.01);
  ganancia.gain.exponentialRampToValueAtTime(0.0001, inicio + duracion);

  osc.connect(filtro);
  filtro.connect(ganancia);
  ganancia.connect(destino);
  osc.start(inicio);
  osc.stop(inicio + duracion + 0.05);
}

function vibrar(patron: number | number[]): void {
  if (!vibracionActivada()) return;
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(patron);
  } catch {
    // No todos los celulares/navegadores vibran (iPhone no); no pasa nada.
  }
}

function tocar(notas: number[], paso: number, vibracion: number | number[], duracion = 0.5): void {
  vibrar(vibracion);
  if (!sonidoActivado()) return;
  const audio = obtenerContexto();
  if (!audio) return;
  try {
    const ahora = audio.ctx.currentTime + 0.02;
    notas.forEach((f, i) => {
      const inicio = ahora + i * paso;
      notaKoto(audio.ctx, audio.destino, f, inicio, duracion, VOLUMEN_NOTA);
      notaKoto(audio.ctx, audio.destino, f * 2, inicio, duracion * 0.8, VOLUMEN_NOTA * 0.45);
    });
  } catch {
    // El sonido es un plus: si el navegador lo bloquea, lo que se guardó ya
    // quedó guardado igual — nunca debe interrumpir el flujo.
  }
}

// Al guardar algo (marcar llegada/salida, reportar, votar, reaccionar,
// comentar, publicar historia): dos notas ascendentes, Mi → La.
export function reproducirSonidoExito(): void {
  tocar([659, 880], 0.1, 40);
}

// Algo nuevo que llegó solo, sin que la persona hiciera nada (comentario,
// reacción, solicitud pendiente): La → Mi, descendente.
export function reproducirSonidoNotificacion(): void {
  tocar([880, 659], 0.1, [60, 60, 60]);
}

// Algo salió mal o requiere atención: Mi → Fa (el semitono de la escala
// japonesa, tenso a propósito), más largo y con vibración marcada.
export function reproducirSonidoAlerta(): void {
  tocar([659, 698], 0.12, [200, 80, 200], 0.6);
}

// Premio o buen resultado (puntos recibidos, nota alta): arpegio ascendente.
// También dispara la animación de celebración (ver app/panel/celebracion.tsx,
// que escucha este mismo evento) — así los 4 lugares que ya llamaban a este
// sonido (checklist Excelente, auditoría Excelente, regalo de puntos y
// racha de historias) se benefician sin tocar cada pantalla.
export function reproducirSonidoLogro(): void {
  tocar([659, 698, 880, 988, 1319], 0.085, [40, 40, 40, 40, 120]);
  try {
    window.dispatchEvent(new Event("shimaya:celebracion"));
  } catch {}
}

// Aviso suave de algo pendiente (evento o encuesta nueva): dos La iguales.
export function reproducirSonidoRecordatorio(): void {
  tocar([880, 880], 0.18, [80, 100, 80]);
}

// El navegador no deja sonar nada hasta que la persona toca la pantalla por
// primera vez. Para avisos que aparecen al abrir la app (evento o encuesta
// nueva), se espera a ese primer toque y recién ahí suena — una sola vez.
export function reproducirAlPrimerToque(reproducir: () => void): void {
  if (typeof window === "undefined") return;
  if (contexto && contexto.state === "running") {
    reproducir();
    return;
  }
  const alTocar = () => {
    window.removeEventListener("pointerdown", alTocar);
    reproducir();
  };
  window.addEventListener("pointerdown", alTocar, { once: true });
}

// Recordatorio que suena una sola vez por sesión (no cada vez que se vuelve a
// la pantalla), al primer toque. "clave" identifica qué se está recordando.
export function recordarUnaVez(clave: string): void {
  try {
    const marca = `shimaya_recordado_${clave}`;
    if (window.sessionStorage.getItem(marca)) return;
    window.sessionStorage.setItem(marca, "1");
  } catch {
    // Sin almacenamiento: puede repetirse, no pasa nada.
  }
  reproducirAlPrimerToque(reproducirSonidoRecordatorio);
}
