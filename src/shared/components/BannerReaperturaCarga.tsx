import { formatearFechaHora } from "@/shared/utils/fecha";

// Vista liviana de `ReaperturaVigenteVista` (`application/use-cases/ListarReaperturasVigentesPropias`)
// con `fechaLimite` ya como texto ISO: mismo criterio que `CargaResumenVista` en
// `panel-carga-archivo.tsx` para cruzar el límite servidor → cliente, porque este banner ahora vive
// como estado de `PanelCargaArchivo` (Client Component) en vez de renderizarse directo desde el
// Server Component de la página, para poder quitarlo apenas el servidor confirma un "Finalizar y
// enviar" exitoso, sin esperar a que la página se vuelva a cargar.
export type ReaperturaVigentePropiaVista = {
  ventanaCargaId: string;
  formatoExcelNombre: string;
  anio: number;
  motivo: string;
  fechaLimite: string;
};

type BannerReaperturaCargaProps = {
  reaperturas: ReaperturaVigentePropiaVista[];
};

// Alerta visual en `/notificador` (home): visible SOLO para el notificador afectado, cuando tiene
// una carga rechazada con la reapertura de su ventana todavía vigente. Muestra el motivo del
// rechazo y el plazo límite para volver a subir el archivo (ver `reaperturaVigente()`/
// `fechaLimiteReapertura()` en `modules/reporte-excel/domain/entities/CargaArchivoRechazo.ts`).
export function BannerReaperturaCarga({ reaperturas }: BannerReaperturaCargaProps) {
  if (reaperturas.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
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
            <strong>{formatearFechaHora(new Date(reapertura.fechaLimite))}</strong>.
          </p>
        </div>
      ))}
    </div>
  );
}
