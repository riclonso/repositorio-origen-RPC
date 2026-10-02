import type { CargaArchivo } from "@/modules/reporte-excel/domain/entities/CargaArchivo";
import type { CargaArchivoRepository } from "@/modules/reporte-excel/domain/repositories/CargaArchivoRepository";

export type ResultadoFinalizarYEnviarCarga =
  | { ok: true; carga: CargaArchivo }
  | { ok: false; motivo: "NO_ENCONTRADO" };

// Corrección (fin de la autoaprobación, RF-14/RF-20): reemplaza al viejo "dar visto bueno" del
// propio notificador. Este paso NO aprueba nada: solo marca que el notificador dueño de la carga
// terminó de revisarla y la envía a decisión de un tercero (ADMIN/REVISOR_REPOSITORIO). Mismo
// estado (`PENDIENTE_VISTO_BUENO`), solo se fija `finalizadaEn`. Irreversible (no hay endpoint para
// deshacerlo) y no admite doble finalización.
//
// 404 uniforme si la carga no existe, no es del actor, no está `PENDIENTE_VISTO_BUENO`, o ya tiene
// `finalizadaEn`: no distingue el motivo exacto, mismo criterio de no filtrar detalle interno que
// el resto del módulo.
export async function finalizarYEnviarCarga(
  id: string,
  usuarioId: string,
  dependencias: { repositorio: CargaArchivoRepository },
): Promise<ResultadoFinalizarYEnviarCarga> {
  const carga = await dependencias.repositorio.obtenerPropiaPorId(id, usuarioId);

  if (!carga || carga.estado !== "PENDIENTE_VISTO_BUENO" || carga.finalizadaEn !== null) {
    return { ok: false, motivo: "NO_ENCONTRADO" };
  }

  const actualizada = await dependencias.repositorio.finalizar(id, usuarioId);

  if (!actualizada) {
    // Cierra la ventana de carrera entre la comprobación de arriba y el UPDATE condicional: otra
    // petición del mismo usuario (doble clic, dos pestañas) ya finalizó esta carga entretanto.
    return { ok: false, motivo: "NO_ENCONTRADO" };
  }

  return { ok: true, carga: actualizada };
}
