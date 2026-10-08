import type {
  CargaArchivo,
  CargaArchivoParaDescarga,
  CargaArchivoResumenConPublicacion,
  CargaArchivoResumenPropia,
  CargaArchivoParaProcesar,
  ConsumoFinalizacionCarga,
  DatosNuevaCargaProcesando,
  DatosPublicacionCarga,
  DatosRechazoCargaArchivo,
  FiltroListadoCargasAprobadas,
  FiltroListadoCargasPendientesODecididas,
  FiltroListadoCargasPropias,
  FiltroListadoCargasRechazadas,
  PaginaCargas,
  PaginaCargasConPublicacion,
  ResultadoFinalizarCargaArchivo,
  ResultadoValidacionArchivo,
  UltimaCargaCombinacion,
} from "@/modules/reporte-excel/domain/entities/CargaArchivo";
import type { CargaArchivoRechazo } from "@/modules/reporte-excel/domain/entities/CargaArchivoRechazo";

export interface CargaArchivoRepository {
  // RF-38: crea la carga recién recibida en `PROCESANDO` (0 filas, 0 errores), con el binario ya en
  // disco. Lanza `CargaArchivoEnProcesoError` si el índice parcial `carga_archivo_procesando_key`
  // la rechaza (otra subida simultánea de la misma combinación).
  crearProcesando(datos: DatosNuevaCargaProcesando): Promise<CargaArchivo>;
  // RF-38: lo mínimo que necesita el procesamiento asíncrono, o `null` si la carga no existe.
  obtenerParaProcesar(id: string): Promise<CargaArchivoParaProcesar | null>;
  // RF-38: el procesamiento en curso (`PROCESANDO`) de una combinación (usuario, ventana), o `null`.
  obtenerProcesandoPorUsuarioYVentana(usuarioId: string, ventanaCargaId: string): Promise<UltimaCargaCombinacion | null>;
  // RF-38: en una transacción, `PROCESANDO -> estado resultante` con sus conteos (updateMany condicional
  // por `estado = PROCESANDO`) más los errores. `false` si la carga ya no estaba en `PROCESANDO`
  // (idempotencia: no inserta errores).
  completarProcesamiento(id: string, resultado: ResultadoValidacionArchivo): Promise<boolean>;
  // RF-38: pasa a `CON_ERRORES` (con un error `ARCHIVO_NO_PROCESADO` "La validación se interrumpió")
  // toda carga `PROCESANDO` creada antes de `anterioresA`, opcionalmente solo de una combinación.
  // Condicional por estado: nunca pisa un procesamiento que terminó entretanto. Devuelve sus ids.
  marcarProcesamientosInterrumpidos(filtro: {
    anterioresA: Date;
    usuarioId?: string;
    ventanaCargaId?: string;
  }): Promise<string[]>;
  obtenerPorId(id: string): Promise<CargaArchivo | null>;
  // Filtra `usuarioId` a nivel de consulta SQL, nunca solo en la UI: una carga que no pertenece
  // al actor debe comportarse como si no existiera desde el propio `WHERE`, no por descarte en JS.
  obtenerPropiaPorId(id: string, usuarioId: string): Promise<CargaArchivo | null>;
  // Filtra `estado = APROBADA` a nivel de consulta SQL, mismo criterio que `listarAprobadas`.
  obtenerAprobadaPorId(id: string): Promise<CargaArchivo | null>;
  // Extensión "solicitudes de reemplazo": la carga `APROBADA` VIGENTE de un usuario en una ventana
  // de carga puntual, o `null` si no tiene ninguna. Vigente = la `APROBADA` más reciente (por
  // `vistoBuenoEn`) cuya publicación NO esté desactivada (sin publicación —cargas antiguas sin
  // backfill— o `publicacion.activo = true`): una aprobación ya superada por un reemplazo nunca
  // vuelve a ser la vigente, aunque después se rechace la carga que la reemplazó. Reutilizada por
  // `SolicitarReemplazoCarga`, `resolverAutorizacionReemplazo` (subida y finalización) y
  // `DarVistoBueno`.
  obtenerAprobadaVigentePorUsuarioYVentana(usuarioId: string, ventanaCargaId: string): Promise<CargaArchivo | null>;
  // El intento más reciente (por `createdAt`, cualquier estado) de un usuario en una ventana, o
  // `null`. `FinalizarYEnviarCarga` solo admite finalizar el último intento de su combinación.
  obtenerUltimaPorUsuarioYVentana(usuarioId: string, ventanaCargaId: string): Promise<UltimaCargaCombinacion | null>;
  // Corrección (fin de la autoaprobación): defensa de servidor de `RecibirArchivoCarga` — una
  // `PENDIENTE_VISTO_BUENO` con `finalizadaEn` no nulo de esta combinación (usuario, ventana)
  // todavía no fue decidida (ni aprobada ni rechazada) por ADMIN/REVISOR_REPOSITORIO, así que no
  // admite una subida nueva. El mecanismo PRINCIPAL para evitarlo es de UI (la tarjeta desaparece).
  obtenerPendienteFinalizadaPorUsuarioYVentana(usuarioId: string, ventanaCargaId: string): Promise<CargaArchivo | null>;
  // Incluye `publicacionActiva` (join 1:1 a la publicación, sin N+1) para que el panel del
  // notificador descarte como vigente una `APROBADA` ya superada.
  listarPropias(filtro: FiltroListadoCargasPropias): Promise<PaginaCargasConPublicacion>;
  // Panel del notificador: las cargas que determinan el estado de cada tarjeta y que no pueden
  // quedar fuera por la paginación de `listarPropias` — toda `APROBADA` con publicación activa o
  // sin publicación (candidatas a vigente) y toda `PENDIENTE_VISTO_BUENO` ya finalizada. Acotada
  // por construcción (a lo más una pendiente finalizada y una publicación activa por ventana, más
  // las aprobaciones antiguas sin publicación). Ownership por `usuarioId` en el `WHERE`.
  listarDeterminantesPanelPropias(usuarioId: string): Promise<CargaArchivoResumenConPublicacion[]>;
  // "Mis cargas" (histórico de exitosas): TODAS las `APROBADA`/`RECHAZADA` de un notificador,
  // ordenadas `vistoBuenoEn desc NULLS LAST` (contrato del que depende
  // `agruparCargasAprobadasPorVentana` en `domain/entities/CargaArchivo.ts` para detectar la
  // vigente como la primera ocurrencia de cada `ventanaCargaId`; `NULLS LAST` importa porque una
  // `RECHAZADA` de origen `PENDIENTE_VISTO_BUENO`, RF-22, nunca tuvo `vistoBuenoEn`). Sin paginar
  // en SQL: la agrupación y la paginación de los GRUPOS resultantes ocurren en `application/`,
  // nunca sobre las filas crudas, para que una reemplazada no quede separada de su vigente por un
  // corte de página. Ownership por `usuarioId` siempre en el `WHERE`. Devuelve
  // `CargaArchivoResumenPropia` (no el `CargaArchivoResumen` genérico) porque esta vista sí
  // necesita el motivo de reemplazo/rechazo para "Mis cargas" (`TablaMisCargasExitosas.tsx`).
  listarPropiasAprobadas(usuarioId: string): Promise<CargaArchivoResumenPropia[]>;
  // Filtra siempre `estado = APROBADA` a nivel de consulta SQL, nunca solo en la UI.
  listarAprobadas(filtro: FiltroListadoCargasAprobadas): Promise<PaginaCargas>;
  // Nuevo (fin de la autoaprobación): la tabla "Notificaciones de archivos pendientes de aprobación
  // o rechazo" del detalle de ventana. Trae `APROBADA` y `PENDIENTE_VISTO_BUENO` ya finalizada de
  // esa ventana en el mismo `WHERE`, nunca `CON_ERRORES`/`RECHAZADA` ni una `PENDIENTE_VISTO_BUENO`
  // todavía sin finalizar.
  // Incluye `publicacionActiva` para que la tabla marque como "Reemplazada" (y sin "Rechazar") una
  // `APROBADA` ya superada por un reemplazo.
  listarPendientesODecididas(filtro: FiltroListadoCargasPendientesODecididas): Promise<PaginaCargasConPublicacion>;
  // Cantidad de archivos que el notificador ya finalizó y envió, pero que aún necesitan la
  // decisión de ADMIN/REVISOR_REPOSITORIO. Alimenta la campana de avisos del revisor sin traer
  // filas ni binarios a la barra superior.
  contarPendientesFinalizadas(): Promise<number>;
  // Transición condicional y atómica `PENDIENTE_VISTO_BUENO -> APROBADA`, filtrada por
  // `estado = PENDIENTE_VISTO_BUENO` y `finalizadaEn no nulo` en el mismo `WHERE` (sin
  // restricción de `usuarioId`: corrección que elimina la autoaprobación — quien aprueba es un
  // tercero, ADMIN/REVISOR_REPOSITORIO, nunca el dueño de la carga). Si la carga no existe, no está
  // en ese estado, o no fue finalizada por el notificador, no actualiza ninguna fila y devuelve
  // `null`. Las reglas de negocio (qué mensaje mostrar por cada motivo de rechazo) viven en
  // `application/`, que decide el mensaje comparando contra el estado ya conocido.
  //
  // Extensión "publicación hacia el revisor": en la MISMA transacción que la transición de estado,
  // inserta la cabecera `CargaArchivoPublicada` (RF-38: ya sin filas de detalle) y, si
  // `publicacion.reemplazo` no es nulo, desactiva TODAS las publicaciones activas
  // de la misma combinación (usuario, ventana) distintas de la nueva (`activo = false`,
  // `desactivadaEn`, `reemplazadaPorCargaArchivoId = id`, `motivoDesactivacion`,
  // `motivoDesactivacionTipo = REEMPLAZO`): nunca quedan dos publicaciones activas de la misma
  // combinación, llegue la carga nueva por solicitud de reemplazo o por reapertura tras un rechazo.
  // `aprobadoPorId` es quien realmente aprueba (ADMIN/REVISOR_REPOSITORIO), persistido en
  // `vistoBuenoPorId`.
  darVistoBueno(id: string, aprobadoPorId: string, publicacion: DatosPublicacionCarga): Promise<CargaArchivo | null>;
  // Transición `PENDIENTE_VISTO_BUENO -> PENDIENTE_VISTO_BUENO` (mismo estado) que marca
  // `finalizadaEn` y, en la MISMA transacción, consume las autorizaciones que habilitaron el
  // intento: (1) `updateMany` condicional por `id`, `usuarioId` (ownership), estado y
  // `finalizadaEn IS NULL` → si no calza, `NO_ENCONTRADO`; (2) si otra carga de la combinación ya
  // está finalizada y sin decidir → rollback y `CARGA_PENDIENTE_DECISION` (también ante el índice
  // único parcial, si dos finalizaciones compiten); (3) si `consumo.solicitudReemplazoId`, la marca
  // usada con un `updateMany` condicional (`estado = APROBADA AND utilizadaEn IS NULL`) → si otra
  // petición ya la consumió, rollback y `REEMPLAZO_NO_AUTORIZADO`; (4) consume SIEMPRE las
  // reaperturas pendientes de la combinación (la más reciente queda enlazada a esta carga, el
  // resto solo recibe `reaperturaConsumidaEn`), con la ventana abierta o cerrada.
  finalizar(id: string, usuarioId: string, consumo: ConsumoFinalizacionCarga): Promise<ResultadoFinalizarCargaArchivo>;
  // Única operación que ubica el binario para ADMIN/REVISOR_REPOSITORIO. Devuelve una carga ya
  // `APROBADA` o una `PENDIENTE_VISTO_BUENO` que el notificador finalizó y envió: esto permite
  // revisar el archivo antes de aprobarlo, sin exponer borradores ni cargas con errores. RF-38: la
  // fuente es el disco, o `Bytes` para las cargas anteriores al almacenamiento en disco (soporte
  // permanente; nunca se lee `Bytes` si hay ruta).
  obtenerParaDescarga(id: string): Promise<CargaArchivoParaDescarga | null>;
  // Descarga para el propio notificador desde "Mis cargas": a diferencia de `obtenerParaDescarga`,
  // sin restricción de `estado`, pero con `usuarioId` en el mismo `WHERE` — ownership, nunca
  // filtrado después en JS.
  obtenerPropiaParaDescarga(id: string, usuarioId: string): Promise<CargaArchivoParaDescarga | null>;
  // RF-16 (tablero de seguimiento): cuántos usuarios DISTINTOS "ya reportaron" en cada ventana:
  // tienen una APROBADA vigente que NO está en reemplazo (RF-34). En reemplazo = solicitud de
  // reemplazo utilizable sobre la vigente, archivo de reemplazo finalizado y pendiente de visto
  // bueno, o reapertura que autoriza reemplazarla (mismas reglas que `resolverAutorizacionReemplazo`).
  // Deduplica por usuario, nunca cuenta filas. Devuelve `ventanaCargaId -> cantidad`; las ventanas
  // sin nadie que haya reportado no aparecen como clave.
  contarNotificadoresReportaronPorVentana(ventanaCargaIds: string[], ahora: Date): Promise<Record<string, number>>;
  // Ids de las APROBADA vigentes de la ventana que están en reemplazo (misma regla que el conteo
  // de arriba), para mostrarlas como "Se solicita reemplazo" en el detalle de la ventana.
  listarIdsAprobadasEnReemplazo(ventanaCargaId: string, ahora: Date): Promise<string[]>;

  // Rechazo de cargas aprobadas, ampliado (RF-20) a también cubrir una `PENDIENTE_VISTO_BUENO` ya
  // finalizada (antes de que alguien la apruebe): transición condicional y atómica hacia
  // `RECHAZADA`, filtrada por `estado IN (APROBADA, PENDIENTE_VISTO_BUENO con finalizadaEn no nulo)`
  // en el mismo `WHERE` (sin restricción de `usuarioId`: cualquier ADMIN/REVISOR_REPOSITORIO puede
  // rechazar cualquier carga). Si la carga no existe o ya no está en ese estado, no actualiza
  // ninguna fila y devuelve `null`. En la MISMA transacción crea el `CargaArchivoRechazo` y, solo si
  // el estado de origen era `APROBADA` (una `PENDIENTE_VISTO_BUENO` nunca llegó a publicarse),
  // desactiva la `CargaArchivoPublicada` correspondiente (`motivoDesactivacionTipo = RECHAZO`). Una
  // `APROBADA` ya superada por un reemplazo (publicación desactivada) NO es rechazable: devuelve
  // `null`, igual que una carga en un estado no rechazable.
  rechazar(id: string, datos: DatosRechazoCargaArchivo): Promise<CargaArchivo | null>;
  // La reapertura vigente (si existe) de un usuario en una ventana de carga puntual: la carga
  // `RECHAZADA` más reciente de ese usuario en esa ventana cuyo `CargaArchivoRechazo` todavía no
  // consumió su reapertura. La vigencia por fecha se evalúa en `application/` con
  // `reaperturaVigente()`, sobre el registro ya traído, para no duplicar esa regla en SQL.
  obtenerReaperturaPendientePorUsuarioYVentana(usuarioId: string, ventanaCargaId: string): Promise<CargaArchivoRechazo | null>;
  // Todas las reaperturas de un usuario que todavía NO consumió (`reaperturaConsumidaEn IS NULL`),
  // vencidas o no: la vigencia por fecha se evalúa en `application/`, mismo criterio que
  // `obtenerReaperturaPendientePorUsuarioYVentana`. La usa el banner de `/notificador` (RF nuevo).
  listarPendientesPorUsuario(usuarioId: string): Promise<CargaArchivoRechazo[]>;
  // Filtra siempre `estado = RECHAZADA` a nivel de consulta SQL, mismo criterio que `listarAprobadas`.
  listarRechazadas(filtro: FiltroListadoCargasRechazadas): Promise<PaginaCargas>;
}
