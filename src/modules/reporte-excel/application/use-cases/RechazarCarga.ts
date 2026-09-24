import type { CargaArchivo } from "@/modules/reporte-excel/domain/entities/CargaArchivo";
import type { CargaArchivoRepository } from "@/modules/reporte-excel/domain/repositories/CargaArchivoRepository";

export type DatosRechazarCarga = {
  rechazadoPorId: string;
  motivo: string;
};

export type ResultadoRechazarCarga =
  // `estadoOrigen` viaja para que el Route Handler pueda auditar de qué estado venía la carga
  // (`APROBADA` o `PENDIENTE_VISTO_BUENO`), sin tener que volver a consultarlo.
  | { ok: true; carga: CargaArchivo; estadoOrigen: "APROBADA" | "PENDIENTE_VISTO_BUENO" }
  | { ok: false; motivo: "NO_ENCONTRADO" }
  | { ok: false; motivo: "NO_RECHAZABLE" };

// Rechazo unilateral de una carga (a diferencia de `RevisarSolicitudReemplazo`, no hay una
// solicitud previa: cualquier ADMIN o REVISOR_REPOSITORIO decide directamente). Ampliado (RF-20)
// para cubrir dos orígenes: una carga ya `APROBADA`, o una `PENDIENTE_VISTO_BUENO` que el
// notificador ya finalizó y envió pero que todavía nadie aprobó. Es irreversible; mismo criterio
// que el visto bueno: no existe caso de uso ni endpoint para deshacerlo. La reapertura de la
// ventana para el notificador afectado la registra el repositorio en la misma transacción que la
// transición de estado, para ambos orígenes por igual.
export async function rechazarCarga(
  id: string,
  datos: DatosRechazarCarga,
  dependencias: { repositorio: CargaArchivoRepository },
): Promise<ResultadoRechazarCarga> {
  const carga = await dependencias.repositorio.obtenerPorId(id);

  if (!carga) {
    return { ok: false, motivo: "NO_ENCONTRADO" };
  }

  if (carga.estado !== "APROBADA" && !(carga.estado === "PENDIENTE_VISTO_BUENO" && carga.finalizadaEn !== null)) {
    return { ok: false, motivo: "NO_RECHAZABLE" };
  }

  const estadoOrigen: "APROBADA" | "PENDIENTE_VISTO_BUENO" = carga.estado === "APROBADA" ? "APROBADA" : "PENDIENTE_VISTO_BUENO";

  const actualizada = await dependencias.repositorio.rechazar(id, {
    rechazadoPorId: datos.rechazadoPorId,
    motivo: datos.motivo,
  });

  if (!actualizada) {
    // Cierra la ventana de carrera: otra petición concurrente ya cambió el estado de esta carga
    // (por ejemplo, alguien ya la aprobó o ya la rechazó).
    return { ok: false, motivo: "NO_RECHAZABLE" };
  }

  return { ok: true, carga: actualizada, estadoOrigen };
}
