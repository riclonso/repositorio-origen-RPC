import { obtenerResumenSeguimientoVentanasAbiertas } from "@/modules/ventanas-carga/application/use-cases/ObtenerResumenSeguimientoVentanasAbiertas";
import { prismaVentanaCargaRepository } from "@/modules/ventanas-carga/infrastructure/repositories/PrismaVentanaCargaRepository";
import { prismaAlertaNotificacionRepository } from "@/modules/ventanas-carga/infrastructure/repositories/PrismaAlertaNotificacionRepository";
import { prismaFormatoExcelRepository } from "@/modules/formatos-excel/infrastructure/repositories/PrismaFormatoExcelRepository";
import { prismaCargaArchivoRepository } from "@/modules/reporte-excel/infrastructure/repositories/PrismaCargaArchivoRepository";
import { TarjetaSeguimientoVentana } from "@/shared/components/TarjetaSeguimientoVentana";

type TableroSeguimientoVentanasProps = {
  // Base de la ruta de detalle de ventanas de carga; cada área aporta la suya
  // (`/dashboard/ventanas-carga` o `/revisor/ventanas-carga`), mismo criterio que `rutaBase` en
  // `ListadoVentanasCarga`.
  rutaBase: string;
};

// Server Component compartido entre `/dashboard` y `/revisor` (RF-16, tablero de seguimiento):
// mismo listado para ambos perfiles, mismo criterio que `ListadoVentanasCarga`/`TablaFormatosExcel`
// entre ambas áreas. `ahora` se genera aquí, en el servidor, nunca recibido del cliente.
export async function TableroSeguimientoVentanas({ rutaBase }: TableroSeguimientoVentanasProps) {
  const resumenes = await obtenerResumenSeguimientoVentanasAbiertas({
    repositorioVentanas: prismaVentanaCargaRepository,
    repositorioFormatos: prismaFormatoExcelRepository,
    repositorioCargas: prismaCargaArchivoRepository,
    // RF-17: badge de alertas de cada tarjeta, resuelto con 2 `groupBy` adicionales dentro de
    // `obtenerResumenPorVentanas` (nunca una consulta por tarjeta).
    repositorioAlertas: prismaAlertaNotificacionRepository,
  });

  return (
    <section aria-labelledby="titulo-seguimiento-ventanas" className="flex flex-col gap-4">
      <h2 id="titulo-seguimiento-ventanas" className="text-base font-semibold text-gob-tertiary">
        Ventanas de carga abiertas
      </h2>

      {resumenes.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gob-accent bg-white p-6 text-sm text-gob-gray-a">
          No hay ventanas de carga abiertas en este momento.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {resumenes.map((resumen) => (
            <TarjetaSeguimientoVentana
              key={resumen.ventanaCargaId}
              resumen={resumen}
              rutaBase={rutaBase}
            />
          ))}
        </div>
      )}
    </section>
  );
}
