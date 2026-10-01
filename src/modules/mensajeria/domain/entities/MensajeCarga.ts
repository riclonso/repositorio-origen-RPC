// RF-31: mensajería entre el equipo revisor (REVISOR_REPOSITORIO, bandeja compartida) y cada
// NOTIFICADOR_RPC. Un hilo continuo por notificador; cada mensaje queda etiquetado con la carga
// sobre la que se escribió y, por ella, con su ventana de carga.

// Tope de caracteres de un mensaje. Mismo valor que `VarChar(1000)` de `mensaje_carga.contenido`.
export const LONGITUD_MAXIMA_MENSAJE = 1000;

// Máximo de mensajes devueltos por hilo y ventana (los más recientes). Si hay más, el hilo se
// marca con `hayMasAntiguos`.
export const TOPE_MENSAJES_HILO = 200;

export const LADOS_MENSAJE = ["REVISOR", "NOTIFICADOR"] as const;
export type LadoMensaje = (typeof LADOS_MENSAJE)[number];

// La lectura siempre la hace el lado contrario al autor: el revisor lee lo que escribió el
// notificador y viceversa.
export function ladoContrario(lado: LadoMensaje): LadoMensaje {
  return lado === "REVISOR" ? "NOTIFICADOR" : "REVISOR";
}

export type MensajeCarga = {
  id: string;
  cargaArchivoId: string;
  ventanaCargaId: string;
  // Clave del hilo: copia de `carga_archivo.usuarioId`, nunca recibida del cliente.
  notificadorId: string;
  autorId: string;
  ladoAutor: LadoMensaje;
  contenido: string;
  creadoEn: Date;
  // NULL = el lado contrario al autor todavía no lo leyó.
  leidoEn: Date | null;
};

// Mensaje tal como se muestra en un hilo: con el nombre del autor y el archivo que lo etiqueta,
// resueltos con un JOIN acotado en la misma consulta del hilo.
export type MensajeHilo = MensajeCarga & {
  autorNombre: string;
  nombreArchivoOriginal: string;
};

export type HiloVentana = {
  // Orden cronológico ascendente (el más antiguo primero), máximo `TOPE_MENSAJES_HILO`.
  mensajes: MensajeHilo[];
  hayMasAntiguos: boolean;
};

export type DatosNuevoMensajeCarga = {
  cargaArchivoId: string;
  ventanaCargaId: string;
  notificadorId: string;
  autorId: string;
  ladoAutor: LadoMensaje;
  contenido: string;
  creadoEn: Date;
};

// Columna izquierda del modal del revisor: un notificador con el que existe conversación en una
// ventana.
export type ConversacionVentanaResumen = {
  notificadorId: string;
  nombreCompleto: string;
  rut: string;
  // Mensajes del notificador todavía sin leer por el equipo revisor.
  noLeidos: number;
  ultimoMensajeEn: Date;
};

export type InterlocutorNotificador = {
  id: string;
  nombreCompleto: string;
  rut: string;
};

// Conteo por ventana para los avisos de los inicios. `noLeidos` cuenta solo los mensajes del lado
// contrario a quien consulta.
export type ResumenMensajesVentana = {
  total: number;
  noLeidos: number;
};

export type ResumenMensajesPorVentana = Record<string, ResumenMensajesVentana>;

// Resumen para un inicio: `porVentana` (total + no leídos) solo para las ventanas que tienen
// tarjeta, y `noLeidosPorVentana` para TODAS, incluidas las cerradas, que alimenta el banner.
export type ResumenMensajesInicio = {
  porVentana: ResumenMensajesPorVentana;
  noLeidosPorVentana: Record<string, number>;
};

// Etiqueta visible de una ventana para el banner de mensajes sin leer en ventanas que no tienen
// tarjeta en el inicio (cerradas o no listadas).
export type EtiquetaVentanaMensajes = {
  ventanaCargaId: string;
  formatoExcelNombre: string;
  anio: number;
};
