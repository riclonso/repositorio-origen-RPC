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
  titulo?: string;
  descripcion?: string;
};

// Server Component compartido entre `/dashboard` y `/revisor` (RF-16, tablero de seguimiento):
// mismo listado para ambos perfiles, mismo criterio que `ListadoVentanasCarga`/`TablaFormatosExcel`
// entre ambas áreas. `ahora` se genera aquí, en el servidor, nunca recibido del cliente.
export async function TableroSeguimientoVentanas({
  rutaBase,
  titulo = "Ventanas de carga activas",
  descripcion,
}: TableroSeguimientoVentanasProps) {
  const resumenes = await obtenerResumenSeguimientoVentanasAbiertas({
    repositorioVentanas: prismaVentanaCargaRepository,
    repositorioFormatos: prismaFormatoExcelRepository,
    repositorioCargas: prismaCargaArchivoRepository,
    // RF-17: badge de alertas de cada tarjeta, resuelto con 2 `groupBy` adicionales dentro de
    // `obtenerResumenPorVentanas` (nunca una consulta por tarjeta).
    repositorioAlertas: prismaAlertaNotificacionRepository,
  });

  return (
    <section aria-labelledby="titulo-seguimiento-ventanas" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h2 id="titulo-seguimiento-ventanas" className="text-xl font-bold tracking-tight text-gob-tertiary">
              {titulo}
            </h2>
            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-gob-primary px-2 text-xs font-bold text-white">
              {resumenes.length}
            </span>
          </div>
          {descripcion ? <p className="mt-1.5 text-sm text-gob-gray-a">{descripcion}</p> : null}
        </div>
        <span className="text-xs font-semibold uppercase tracking-wide text-[#58738e]">Ventanas abiertas</span>
      </div>

      {resumenes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gob-accent bg-white px-6 py-8">
          <p className="text-base font-semibold text-gob-tertiary">No hay ventanas de carga activas</p>
          <p className="mt-1 text-sm text-gob-gray-a">Cuando se habilite una ventana, su avance aparecerá aquí.</p>
        </div>
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
