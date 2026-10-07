import type {
  DatosEdicionVentanaCarga,
  DatosNuevaVentanaCarga,
  ResumenVigenciaAnio,
  VentanaCarga,
} from "@/modules/ventanas-carga/domain/entities/VentanaCarga";
import type { NotificadorPendiente } from "@/modules/ventanas-carga/domain/entities/AlertaNotificacion";

export type TipoEliminacionVentanaCarga = "HARD" | "SOFT";

export type DatosConfiguracionAlertasVentanaCarga = {
  diasAnticipacionInicio: number | null;
  intervaloRepeticionDias: number | null;
};

export interface VentanaCargaRepository {
  crear(datos: DatosNuevaVentanaCarga): Promise<VentanaCarga>;
  // Lista completa (incluye eliminadas, para trazabilidad): como mucho unas pocas filas por año,
  // no hay volumen que justifique paginar.
  listar(): Promise<VentanaCarga[]>;
  obtenerPorId(id: string): Promise<VentanaCarga | null>;
  // Para el chequeo de unicidad al crear y para resolver la ventana elegida por el notificador al
  // subir un archivo (fusiona la resolución de la ventana con el chequeo de coincidencia de
  // formato): excluye siempre las ventanas eliminadas (`eliminadaEn: null` en el `WHERE`), así que
  // un año/formato con la única ventana eliminada se ve como "sin ventana para ese año y formato".
  obtenerPorAnioYFormato(anio: number, formatoExcelId: string): Promise<VentanaCarga | null>;
  // RF-36: varias ventanas por id en UNA consulta (sin N+1), incluidas eliminadas, archivadas y
  // borradores. La usan el panel del notificador (tarjetas de ventanas cerradas con solicitud o
  // reapertura) y "Mis cargas" (si la ventana todavía admite solicitar un reemplazo).
  listarPorIds(ids: string[]): Promise<VentanaCarga[]>;
  // Ventanas disponibles para un notificador en `ahora`: ni eliminadas, dentro de su rango de
  // fechas Y publicadas (RF-15 ampliación) — exclusión real en el propio `WHERE`, no solo en la
  // UI. Devuelve las entidades completas (incluye `formatoExcelId`), no solo el año: el llamador
  // necesita cruzar por formato exacto contra los formatos asignados al notificador.
  listarDisponibles(ahora: Date): Promise<VentanaCarga[]>;
  // RF-37: por cada año pedido que tenga al menos una ventana publicada, no archivada y no eliminada
  // (abierta o cerrada por fecha), su máximo `fechaVencimiento` y su máximo `diasVigenciaReemplazo`.
  // Los años sin ninguna ventana así no aparecen. Una sola consulta agrupada, sin N+1.
  listarDiasVigenciaPorAnio(anios: number[]): Promise<ResumenVigenciaAnio[]>;
  // `anio` es inmutable después de creada: se editan las fechas y el `formatoExcelId`, incluso si
  // la ventana ya tiene cargas asociadas (decisión explícita, ver diseño de RF-15).
  actualizar(id: string, datos: DatosEdicionVentanaCarga): Promise<VentanaCarga | null>;
  // Activa/desactiva la publicación de una ventana (RF-15 ampliación), simétrico entre ADMIN y
  // REVISOR_REPOSITORIO. `null` si el id no existe, mismo patrón que `actualizar`.
  cambiarPublicacion(id: string, publicada: boolean): Promise<VentanaCarga | null>;
  // Archiva/desarchiva una ventana, apagando (o dejando como está) `publicada` en la MISMA
  // escritura atómica (una sola sentencia SQL): `publicada` viaja ya resuelta por el caso de uso
  // (`publicacionResultanteAlArchivar`), este método no decide esa regla. `null` si el id no existe.
  cambiarArchivado(id: string, datos: { archivada: boolean; publicada: boolean }): Promise<VentanaCarga | null>;
  // Elimina la ventana: física (`DELETE`) si no tiene cargas asociadas, o lógica
  // (`eliminadaEn`/`eliminadaPorId`) si el `ON DELETE RESTRICT` de `CargaArchivo.ventanaCargaId`
  // rechaza el `DELETE` porque ya tiene alguna. `null` si el id no existe. La decisión hard/soft
  // la toma la propia base de datos (el `RESTRICT`), no un conteo previo: evita la ventana de
  // carrera de contar "0 cargas" y que una llegue justo antes del `DELETE`.
  eliminar(id: string, eliminadoPorId: string): Promise<{ tipo: TipoEliminacionVentanaCarga } | null>;
  // RF-17 (alertas por email): activa/desactiva el envío automático. `null` si el id no existe.
  configurarAlertas(
    id: string,
    datos: DatosConfiguracionAlertasVentanaCarga,
  ): Promise<VentanaCarga | null>;
  // RF-17: persiste el HTML ya sanitizado (`sanitizarPlantillaAlertaHtml`); este método no
  // sanitiza ni valida nada, esa responsabilidad es de `application/`. `null` si el id no existe.
  actualizarPlantillaAlerta(id: string, plantillaAlertaSanitizada: string): Promise<VentanaCarga | null>;
  // RF-17: notificadores NOTIFICADOR_RPC activos, asignados al formato de la ventana, sin ninguna
  // `CargaArchivo` APROBADA en ella todavía. Una sola consulta, nunca N+1.
  listarNotificadoresPendientes(ventanaCargaId: string): Promise<NotificadorPendiente[]>;
}
