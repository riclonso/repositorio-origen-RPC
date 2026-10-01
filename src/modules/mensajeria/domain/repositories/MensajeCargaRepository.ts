import type {
  ConversacionVentanaResumen,
  DatosNuevoMensajeCarga,
  EtiquetaVentanaMensajes,
  HiloVentana,
  InterlocutorNotificador,
  LadoMensaje,
  MensajeCarga,
  MensajeHilo,
  ResumenMensajesInicio,
} from "@/modules/mensajeria/domain/entities/MensajeCarga";

export type FiltroMarcarLeidos = {
  notificadorId: string;
  ventanaCargaId: string;
  // Lado de los mensajes que se marcan (el contrario a quien lee).
  ladoAutor: LadoMensaje;
  // Solo se marcan los mensajes con `creadoEn <= hasta`: lo que el cliente realmente mostró.
  hasta: Date;
  leidoEn: Date;
};

export type FiltroResumenMensajes = {
  // Presente solo en el inicio del notificador: acota a su propio hilo.
  notificadorId?: string;
  // Lado cuyos mensajes sin leer se cuentan (el contrario a quien consulta).
  ladoNoLeido: LadoMensaje;
  // Acota SOLO el conteo de totales (`porVentana`) a las ventanas con tarjeta. El de no leídos
  // nunca se acota: el banner necesita también las ventanas cerradas.
  ventanaCargaIdsConTarjeta?: string[];
};

export type FiltroNoLeidosAnteriores = {
  notificadorId: string;
  ventanaCargaId: string;
  ladoAutor: LadoMensaje;
  creadoAntesDe: Date;
};

export interface MensajeCargaRepository {
  crear(datos: DatosNuevoMensajeCarga): Promise<MensajeHilo>;
  // El mensaje más reciente del hilo de un notificador en una ventana, opcionalmente de un lado.
  obtenerUltimoMensaje(notificadorId: string, ventanaCargaId: string, ladoAutor?: LadoMensaje): Promise<MensajeCarga | null>;
  // Mensajes sin leer de un lado en el hilo de un notificador EN UNA VENTANA, creados estrictamente
  // antes de `creadoAntesDe`. Lo usa la regla anti-ráfaga del correo de aviso (por ventana): con el
  // corte por fecha, de dos envíos concurrentes solo el primero se considera "primer no leído".
  contarNoLeidosAnteriores(filtro: FiltroNoLeidosAnteriores): Promise<number>;
  // Los `tope` mensajes más recientes, devueltos en orden cronológico ascendente.
  listarHilo(notificadorId: string, ventanaCargaId: string, tope: number): Promise<HiloVentana>;
  // Notificadores con conversación en una ventana. Conteos con `groupBy`, nunca una consulta por
  // notificador.
  listarConversacionesVentana(ventanaCargaId: string): Promise<ConversacionVentanaResumen[]>;
  obtenerInterlocutorNotificador(notificadorId: string): Promise<InterlocutorNotificador | null>;
  // Idempotente: devuelve cuántas filas cambiaron.
  marcarLeidos(filtro: FiltroMarcarLeidos): Promise<number>;
  // Totales y no leídos por ventana, con dos `groupBy` (nunca una consulta por ventana). Las
  // ventanas sin mensajes no aparecen como clave.
  resumirPorVentana(filtro: FiltroResumenMensajes): Promise<ResumenMensajesInicio>;
  obtenerEtiquetasVentanas(ventanaCargaIds: string[]): Promise<EtiquetaVentanaMensajes[]>;
}
