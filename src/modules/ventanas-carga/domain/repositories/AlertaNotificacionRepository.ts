import type {
  DestinatarioAlertaVista,
  NuevaAlertaNotificacion,
  PaginaLotesAlerta,
  ResumenAlertasVentana,
  TotalAlertaVentana,
} from "@/modules/ventanas-carga/domain/entities/AlertaNotificacion";

export type CategoriaLoteAlerta = "AUTOMATICA" | "MANUAL";

export type FiltroLotesAlerta = {
  ventanaCargaId: string;
  categoria: CategoriaLoteAlerta;
  pagina: number;
  tamano: number;
};

export interface AlertaNotificacionRepository {
  // Inserta todas las filas de un lote en una sola llamada. Usa `skipDuplicates: true`: una
  // colisión contra el índice único parcial de deduplicación automática (`ventanaCargaId`,
  // `usuarioId`, `fechaProgramada` con `tipo = AUTOMATICA` y `resultado = EXITO`) descarta esa
  // fila puntual en silencio, sin fallar el resto del lote.
  crearLote(filas: NuevaAlertaNotificacion[]): Promise<void>;
  // Paginado, separado por categoría (AUTOMATICA vs. MANUAL_MASIVA/MANUAL_INDIVIDUAL agrupadas
  // bajo "MANUAL"): una fila por lote, con los conteos de éxito/error ya agregados.
  listarLotesPorVentana(filtro: FiltroLotesAlerta): Promise<PaginaLotesAlerta>;
  // Destinatarios de varios lotes a la vez (una sola consulta `WHERE loteId IN (...)`), agrupados
  // en el resultado por `loteId`: usado para precargar el acordeón de todos los lotes de la
  // página actual sin una llamada de red por fila.
  listarDestinatariosDeLotes(loteIds: string[]): Promise<Record<string, DestinatarioAlertaVista[]>>;
  // Último envío AUTOMATICO exitoso/con error por ventana, para el badge del tablero de
  // seguimiento (RF-16). Filtrado a `tipo: "AUTOMATICA"` a propósito: el badge distingue
  // "Alertas no configuradas" de "Con errores en el envío"/"Aviso enviado" solo respecto del
  // envío automático (`resolverEstadoAlertaVentana`); un envío MANUAL_MASIVA/MANUAL_INDIVIDUAL no
  // debe afectar este resumen, o una ventana sin envío automático configurado pero con un envío
  // manual fallido mostraría igual "Alertas no configuradas", escondiendo el error.
  obtenerResumenPorVentanas(ventanaCargaIds: string[]): Promise<Record<string, ResumenAlertasVentana>>;
  obtenerTotalesPorVentana(ventanaCargaId: string): Promise<TotalAlertaVentana[]>;
  // IDs de usuario que ya recibieron una alerta AUTOMATICA con resultado EXITO en esta ventana
  // para el día calendario `fechaProgramada`. Una sola consulta por ventana (nunca una por
  // destinatario): `EjecutarEnvioAutomaticoAlertas` la usa para no reintentar un envío que el
  // índice único parcial de todas formas rechazaría, y para evitar el intento de envío
  // innecesario (una carrera real igual queda cerrada por ese índice + `skipDuplicates`).
  //
  // DISCREPANCIA respecto al diseño aprobado: este método no está en la lista de firmas que
  // enumeraba el diseño original de `AlertaNotificacionRepository` (solo mencionaba `crearLote`,
  // `listarLotesPorVentana`, `listarDestinatariosDeLotes`, `obtenerResumenPorVentanas` y
  // `obtenerTotalesPorVentana`). Se agregó porque el propio texto del diseño para
  // `EjecutarEnvioAutomaticoAlertas` exige "verificar si ya existe una fila EXITO con la misma
  // fechaProgramada... antes de intentar enviar", lo cual no es posible sin una consulta agregada
  // por ventana (una consulta por destinatario violaría "nunca N+1").
  listarUsuariosConEnvioExitoso(ventanaCargaId: string, fechaProgramada: Date): Promise<Set<string>>;
}
