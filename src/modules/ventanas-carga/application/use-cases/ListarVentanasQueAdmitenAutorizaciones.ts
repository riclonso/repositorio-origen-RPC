import type { VentanaCargaRepository } from "@/modules/ventanas-carga/domain/repositories/VentanaCargaRepository";
import { ventanaAdmiteAutorizaciones, type VentanaCarga } from "@/modules/ventanas-carga/domain/entities/VentanaCarga";

// RF-36: de un conjunto de ventanas (los ids los resuelve el llamador a partir de las cargas,
// solicitudes o reaperturas propias del notificador), las que todavía admiten solicitudes de
// reemplazo y habilitaciones fuera de plazo: publicadas, no archivadas y no eliminadas, abiertas o
// cerradas por fecha (`ventanaAdmiteAutorizaciones`). La usan el panel del notificador (tarjetas de
// ventanas cerradas con una solicitud o reapertura) y "Mis cargas" (si se ofrece "Solicitar
// reemplazo"). Una sola consulta (`listarPorIds`), sin N+1.
export async function listarVentanasQueAdmitenAutorizaciones(
  idsVentanas: string[],
  dependencias: { repositorio: VentanaCargaRepository },
): Promise<VentanaCarga[]> {
  const ventanas = await dependencias.repositorio.listarPorIds(idsVentanas);
  return ventanas.filter(ventanaAdmiteAutorizaciones);
}
