import type { CargaArchivoResumenConPublicacion } from "@/modules/reporte-excel/domain/entities/CargaArchivo";
import type { CargaArchivoRepository } from "@/modules/reporte-excel/domain/repositories/CargaArchivoRepository";

// Cantidad de intentos recientes que alimentan la tabla "Intentos fallidos" de cada tarjeta. Es un
// historial de apoyo, no el que decide el estado de la tarjeta.
export const TAMANO_INTENTOS_RECIENTES_PANEL = 25;

// Cargas propias del panel `/notificador` (Server Component inicial y refresco del cliente vía
// GET /api/notificador/cargas?vista=panel). Une dos consultas, sin N+1 ni traer todo el historial:
//
// 1. Los intentos más recientes (`TAMANO_INTENTOS_RECIENTES_PANEL`), para "Intentos fallidos".
// 2. Las cargas que DETERMINAN el estado de cada tarjeta (`APROBADA` candidata a vigente y
//    `PENDIENTE_VISTO_BUENO` finalizada), que antes podían quedar fuera del corte de 25 si el
//    notificador acumulaba muchos intentos, dejando la tarjeta en un estado incorrecto.
//
// Se deduplica por `id` y se mantiene el orden `createdAt desc`.
export async function listarCargasPanelNotificador(
  usuarioId: string,
  dependencias: { repositorio: CargaArchivoRepository },
): Promise<CargaArchivoResumenConPublicacion[]> {
  const [recientes, determinantes] = await Promise.all([
    dependencias.repositorio.listarPropias({ usuarioId, pagina: 1, tamano: TAMANO_INTENTOS_RECIENTES_PANEL }),
    dependencias.repositorio.listarDeterminantesPanelPropias(usuarioId),
  ]);

  const porId = new Map<string, CargaArchivoResumenConPublicacion>();
  for (const carga of [...recientes.filas, ...determinantes]) {
    porId.set(carga.id, carga);
  }

  return Array.from(porId.values()).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}
