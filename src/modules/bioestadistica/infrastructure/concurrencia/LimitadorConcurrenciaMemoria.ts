import { crearLimitadorConcurrencia } from "@/infrastructure/concurrencia/LimitadorConcurrenciaMemoria";

// RF-37: instancias del limitador para Bioestadística. RF-38 movió la implementación a
// `src/infrastructure/concurrencia/` (la comparten las cargas del notificador); los valores no cambian.
export { crearLimitadorConcurrencia };

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
