// Cierra la ventana de carrera entre el chequeo de `obtenerPendientePorCarga` en
// `SolicitarReemplazoCarga` y el `INSERT` real: si dos peticiones concurrentes pasan el chequeo a
// la vez, el índice único parcial `solicitud_reemplazo_carga_carga_pendiente_key` (agregado a mano
// en la migración) rechaza la segunda escritura con un `P2002`, que
// `PrismaSolicitudReemplazoCargaRepository.crear` traduce a este error. Mismo patrón que
// `UsuarioDuplicadoError` en `modules/usuarios/domain/errors/`.
export class SolicitudReemplazoDuplicadaError extends Error {
  constructor() {
    super("Ya existe una solicitud de reemplazo pendiente para esta carga");
    this.name = "SolicitudReemplazoDuplicadaError";
  }
}
