// Semáforo dentro del proceso: a lo más `maximo` tareas a la vez; el resto espera su turno en orden
// de llegada. Acota la memoria y la CPU de las tareas pesadas (procesar o generar archivos de cientos
// de MB). Vive en memoria del proceso (asume una sola instancia, igual que el scheduler de RF-17).
// Compartido por Bioestadística (RF-37) y las cargas del notificador (RF-38).

export type OpcionesEjecucion = {
  // RF-38: espera máxima por un turno. Al vencerse, quien espera SALE de la cola (no consume un turno
  // después) y la tarea se rechaza con `LimitadorOcupadoError`. Sin ella, espera indefinidamente.
  esperaMaximaMs?: number;
};

export type Limitador = {
  ejecutar<T>(tarea: () => Promise<T>, opciones?: OpcionesEjecucion): Promise<T>;
};

// No hubo turno dentro de la espera máxima.
export class LimitadorOcupadoError extends Error {
  constructor() {
    super("No hubo un turno disponible dentro de la espera máxima");
    this.name = "LimitadorOcupadoError";
  }
}

export function crearLimitadorConcurrencia(maximo: number): Limitador {
  let enCurso = 0;
  const enEspera: Array<() => void> = [];

  async function adquirir(esperaMaximaMs: number | undefined): Promise<void> {
    if (enCurso < maximo) {
      enCurso += 1;
      return;
    }
    // El turno se transfiere directamente al liberar: `enCurso` no baja ni sube en el traspaso.
    await new Promise<void>((resolver, rechazar) => {
      let temporizador: ReturnType<typeof setTimeout> | undefined;
      const recibirTurno = () => {
        if (temporizador !== undefined) clearTimeout(temporizador);
        resolver();
      };
      enEspera.push(recibirTurno);
      if (esperaMaximaMs !== undefined) {
        temporizador = setTimeout(() => {
          const posicion = enEspera.indexOf(recibirTurno);
          if (posicion === -1) return;
          enEspera.splice(posicion, 1);
          rechazar(new LimitadorOcupadoError());
        }, esperaMaximaMs);
      }
    });
  }

  function liberar(): void {
    const siguiente = enEspera.shift();
    if (siguiente) siguiente();
    else enCurso -= 1;
  }

  return {
    async ejecutar<T>(tarea: () => Promise<T>, opciones: OpcionesEjecucion = {}): Promise<T> {
      await adquirir(opciones.esperaMaximaMs);
      try {
        return await tarea();
      } finally {
        liberar();
      }
    },
  };
}

// Envuelve un flujo para invocar `alTerminar` UNA vez cuando termina, falla o el cliente lo cancela.
export function alTerminarFlujo(original: ReadableStream<Uint8Array>, alTerminar: () => void): ReadableStream<Uint8Array> {
  let terminado = false;
  const terminarUnaVez = () => {
    if (terminado) return;
    terminado = true;
    alTerminar();
  };
  const lector = original.getReader();

  return new ReadableStream<Uint8Array>({
    async pull(controlador) {
      try {
        const { done, value } = await lector.read();
        if (done) {
          controlador.close();
          terminarUnaVez();
          return;
        }
        controlador.enqueue(value);
      } catch (error) {
        controlador.error(error);
        terminarUnaVez();
      }
    },
    async cancel(motivo) {
      terminarUnaVez();
      await lector.cancel(motivo).catch(() => undefined);
    },
  });
}

// RF-38: ocupa un turno del limitador mientras se CONSUME un flujo, no solo mientras se crea: el turno
// se libera cuando el flujo termina, falla o el cliente lo cancela (p. ej. cierra la descarga). Si
// `crear` lanza, o no hubo turno dentro de la espera máxima, el error se propaga (y no queda nada
// tomado ni en cola).
export async function ejecutarMientrasFluye(
  limitador: Limitador,
  crear: () => Promise<ReadableStream<Uint8Array>>,
  opciones: OpcionesEjecucion = {},
): Promise<ReadableStream<Uint8Array>> {
  let entregar: (flujo: ReadableStream<Uint8Array>) => void = () => undefined;
  let rechazar: (error: unknown) => void = () => undefined;
  const entregado = new Promise<ReadableStream<Uint8Array>>((resolver, fallar) => {
    entregar = resolver;
    rechazar = fallar;
  });

  void limitador
    .ejecutar(async () => {
      const original = await crear();
      await new Promise<void>((liberarTurno) => entregar(alTerminarFlujo(original, liberarTurno)));
    }, opciones)
    .catch((error: unknown) => rechazar(error));

  return entregado;
}

// La clave ya tiene una operación en curso (p. ej. el mismo usuario con otra descarga generada).
export class ClaveOcupadaError extends Error {
  constructor() {
    super("Ya hay una operación en curso para esta clave");
    this.name = "ClaveOcupadaError";
  }
}

// RF-38: exclusión por clave dentro del proceso: a lo más UNA operación en curso por clave (por usuario).
// `adquirir` devuelve la función que la libera (idempotente), o lanza `ClaveOcupadaError`.
export function crearExclusionPorClave(): { adquirir(clave: string): () => void } {
  const ocupadas = new Set<string>();

  return {
    adquirir(clave) {
      if (ocupadas.has(clave)) throw new ClaveOcupadaError();
      ocupadas.add(clave);
      let liberada = false;
      return () => {
        if (liberada) return;
        liberada = true;
        ocupadas.delete(clave);
      };
    },
  };
}
