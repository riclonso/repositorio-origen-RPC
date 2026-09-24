import type { SolicitudReemplazoCargaRepository } from "@/modules/solicitudes-reemplazo/domain/repositories/SolicitudReemplazoCargaRepository";

// Total de solicitudes `PENDIENTE` (ambos orígenes), para el chip de "Solicitudes" en el menú
// lateral de ADMIN/REVISOR_REPOSITORIO (`BarraLateralPanel`, layouts de `/dashboard` y `/revisor`).
export async function contarSolicitudesReemplazoPendientes(dependencias: {
  repositorio: SolicitudReemplazoCargaRepository;
}): Promise<number> {
  return dependencias.repositorio.contarPendientes();
}
