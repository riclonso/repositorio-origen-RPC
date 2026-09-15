import type { CargaArchivo } from "@/modules/reporte-excel/domain/entities/CargaArchivo";
import type { CargaArchivoRepository } from "@/modules/reporte-excel/domain/repositories/CargaArchivoRepository";

export type ResultadoDarVistoBueno =
  | { ok: true; carga: CargaArchivo }
  | { ok: false; motivo: "NO_ENCONTRADO" }
  | { ok: false; motivo: "CARGA_CON_ERRORES" | "YA_APROBADA" };

// El visto bueno solo lo puede dar el mismo notificador que subió el archivo (dos pasos del
// mismo actor) y es irreversible: no existe caso de uso ni endpoint para deshacerlo.
export async function darVistoBueno(
  id: string,
  usuarioId: string,
  dependencias: { repositorio: CargaArchivoRepository },
): Promise<ResultadoDarVistoBueno> {
  const carga = await dependencias.repositorio.obtenerPorId(id);

  // Ownership explícito por `usuarioId`: una carga que no es del actor se trata como si no
  // existiera, igual que el resto de endpoints de `/api/notificador/cargas/*`.
  if (!carga || carga.usuarioId !== usuarioId) {
    return { ok: false, motivo: "NO_ENCONTRADO" };
  }

  if (carga.estado === "CON_ERRORES") {
    return { ok: false, motivo: "CARGA_CON_ERRORES" };
  }

  if (carga.estado === "APROBADA") {
    return { ok: false, motivo: "YA_APROBADA" };
  }

  const actualizada = await dependencias.repositorio.darVistoBueno(id, usuarioId);

  if (!actualizada) {
    // Cierra la ventana de carrera entre la comprobación de arriba y el UPDATE condicional: otra
    // petición del mismo usuario (doble clic, dos pestañas) ya dio el visto bueno entretanto.
    return { ok: false, motivo: "YA_APROBADA" };
  }

  return { ok: true, carga: actualizada };
}
