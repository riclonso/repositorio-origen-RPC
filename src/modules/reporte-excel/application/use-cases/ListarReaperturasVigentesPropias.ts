import { fechaLimiteReapertura, reaperturaVigente } from "@/modules/reporte-excel/domain/entities/CargaArchivoRechazo";
import type { CargaArchivoRepository } from "@/modules/reporte-excel/domain/repositories/CargaArchivoRepository";

export type ReaperturaVigenteVista = {
  ventanaCargaId: string;
  formatoExcelNombre: string;
  anio: number;
  motivo: string;
  fechaLimite: Date;
};

// Banner de `/notificador` (RF nuevo): reaperturas vigentes y todavía no consumidas del
// notificador de la sesión, visibles SOLO para él. La vigencia por fecha (`reaperturaVigente`) se
// evalúa aquí, sobre los registros ya traídos, para no duplicar esa regla en SQL.
export async function listarReaperturasVigentesPropias(
  usuarioId: string,
  dependencias: { repositorio: CargaArchivoRepository },
): Promise<ReaperturaVigenteVista[]> {
  const rechazos = await dependencias.repositorio.listarPendientesPorUsuario(usuarioId);
  const ahora = new Date();

  return rechazos
    .filter((rechazo) => reaperturaVigente(rechazo, { fechaVencimiento: rechazo.ventanaFechaVencimiento }, ahora))
    .map((rechazo) => ({
      ventanaCargaId: rechazo.ventanaCargaId,
      formatoExcelNombre: rechazo.formatoExcelNombre,
      anio: rechazo.anio,
      motivo: rechazo.motivo,
      fechaLimite: fechaLimiteReapertura(rechazo, { fechaVencimiento: rechazo.ventanaFechaVencimiento }),
    }));
}
