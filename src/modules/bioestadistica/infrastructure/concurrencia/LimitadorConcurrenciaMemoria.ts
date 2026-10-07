import type { LimitadorConcurrencia } from "@/modules/bioestadistica/application/ports";

// Semáforo dentro del proceso: a lo más `maximo` tareas a la vez; el resto espera su turno en orden
// de llegada. Acota la memoria y la CPU que consumen los procesamientos de archivos de hasta 200 MB.
// Vive en memoria del proceso (asume una sola instancia, igual que el scheduler de RF-17).
export function crearLimitadorConcurrencia(maximo: number): LimitadorConcurrencia {
  let enCurso = 0;
  const enEspera: Array<() => void> = [];

  async function adquirir(): Promise<void> {
    if (enCurso < maximo) {
      enCurso += 1;
      return;
    }
    // El turno se transfiere directamente al liberar: `enCurso` no baja ni sube en el traspaso.
    await new Promise<void>((resolver) => enEspera.push(resolver));
  }

  function liberar(): void {
    const siguiente = enEspera.shift();
    if (siguiente) siguiente();
    else enCurso -= 1;
  }

  return {
    async ejecutar<T>(tarea: () => Promise<T>): Promise<T> {
      await adquirir();
      try {
        return await tarea();
      } finally {
        liberar();
      }
    },
  };
}

// RF-37: máximo de procesamientos de archivos de Bioestadística simultáneos.
const MAXIMO_PROCESAMIENTOS_SIMULTANEOS = 2;

export const limitadorProcesamientoBioestadistica = crearLimitadorConcurrencia(MAXIMO_PROCESAMIENTOS_SIMULTANEOS);

// RF-37: máximo de revisiones de encabezados simultáneas durante la recepción (dentro de la
// petición). En un xlsx leer la fila 1 exige cargar estilos y textos compartidos completos (hasta
// `TOPE_BYTES_PARTE_XLSX` cada uno), así que también se acota. Es un limitador PROPIO y no el del
// procesamiento: compartirlo haría esperar la respuesta HTTP detrás de procesamientos en segundo
// plano que pueden durar minutos.
const MAXIMO_REVISIONES_ENCABEZADOS_SIMULTANEAS = 2;

export const limitadorRevisionEncabezadosBioestadistica = crearLimitadorConcurrencia(
  MAXIMO_REVISIONES_ENCABEZADOS_SIMULTANEAS,
);
