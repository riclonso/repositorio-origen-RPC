import { crearLimitadorConcurrencia } from "@/infrastructure/concurrencia/LimitadorConcurrenciaMemoria";

// RF-38: valores fijados con la prueba de carga (`tests/carga-100mb.manual.ts`, resultados en
// `docs/resumen-tecnico.md`). Son independientes de los de Bioestadística (2 procesamientos).

// Validaciones de archivos del notificador simultáneas (en `after()`): cada una puede tomar varios
// cientos de MB con 500.000 filas y varias reglas `FILA_DUPLICADA`.
export const MAXIMO_VALIDACIONES_CARGAS_SIMULTANEAS = 2;

// Descargas con la columna "Fecha y hora de notificación" generadas a la vez. El turno se libera al
// terminar o cortarse el flujo de respuesta, no al devolver el `Response`. El original no pasa por
// aquí (es una copia byte a byte desde disco). Prueba de carga de RF-38: el peor caso (textos únicos) con 2
// validaciones + 2 descargas simultáneas llegó a 1,88 GB de RSS; con 3 descargas superaría ~2,3 GB,
// así que se fija en 2 (el diseño proponía 3).
export const MAXIMO_DESCARGAS_CARGAS_SIMULTANEAS = 2;

export const limitadorValidacionCargas = crearLimitadorConcurrencia(MAXIMO_VALIDACIONES_CARGAS_SIMULTANEAS);
export const limitadorDescargasCargas = crearLimitadorConcurrencia(MAXIMO_DESCARGAS_CARGAS_SIMULTANEAS);
