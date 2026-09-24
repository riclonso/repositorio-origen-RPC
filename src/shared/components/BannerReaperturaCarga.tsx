import { formatearFechaHora } from "@/shared/utils/fecha";
import type { ReaperturaVigenteVista } from "@/modules/reporte-excel/application/use-cases/ListarReaperturasVigentesPropias";

type BannerReaperturaCargaProps = {
  reaperturas: ReaperturaVigenteVista[];
};

// Alerta visual en `/notificador` (home): visible SOLO para el notificador afectado, cuando tiene
// una carga rechazada con la reapertura de su ventana todavía vigente. Muestra el motivo del
// rechazo y el plazo límite para volver a subir el archivo (ver `reaperturaVigente()`/
// `fechaLimiteReapertura()` en `modules/reporte-excel/domain/entities/CargaArchivoRechazo.ts`).
export function BannerReaperturaCarga({ reaperturas }: BannerReaperturaCargaProps) {
  if (reaperturas.length === 0) return null;

  return (
    <div className="mt-6 flex flex-col gap-3">
      {reaperturas.map((reapertura) => (
        <div
          key={reapertura.ventanaCargaId}
          role="alert"
          className="rounded-lg border border-gob-danger bg-white p-4 shadow-sm"
        >
          <p className="text-sm font-semibold text-gob-danger">
            Tu carga de {reapertura.formatoExcelNombre} ({reapertura.anio}) fue rechazada
          </p>
          <p className="mt-1 text-sm text-gob-gray-a">Motivo: {reapertura.motivo}</p>
          <p className="mt-1 text-sm text-gob-gray-a">
            Puedes volver a subir un archivo para esta combinación hasta el{" "}
            <strong>{formatearFechaHora(reapertura.fechaLimite)}</strong>.
          </p>
        </div>
      ))}
    </div>
  );
}
