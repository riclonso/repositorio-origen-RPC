import { listarCargasAprobadas } from "@/modules/reporte-excel/application/use-cases/ListarCargasAprobadas";
import { prismaCargaArchivoRepository } from "@/modules/reporte-excel/infrastructure/repositories/PrismaCargaArchivoRepository";
import { Paginacion } from "@/shared/components/Paginacion";
import { TablaCargasAprobadas, aFilaCargaAprobadaVista } from "@/shared/components/TablaCargasAprobadas";

// Server Component compartido entre `/dashboard/cargas` (ADMIN) y `/revisor/cargas`
// (REVISOR_REPOSITORIO): misma tabla, misma paginación, cada área solo aporta su propia base de
// ruta para el detalle y el botón "siguiente/anterior".
type ListadoCargasAprobadasProps = {
  pagina: number;
  tamano: number;
  rutaBase: string;
  construirHref: (pagina: number) => string;
};

export async function ListadoCargasAprobadas({
  pagina,
  tamano,
  rutaBase,
  construirHref,
}: ListadoCargasAprobadasProps) {
  const resultado = await listarCargasAprobadas(
    { pagina, tamano },
    { repositorio: prismaCargaArchivoRepository },
  );
  const filas = resultado.filas.map(aFilaCargaAprobadaVista);

  if (filas.length === 0) {
    return (
      <div className="mt-6 rounded-lg border border-gob-accent bg-white p-8 text-center">
        <p className="text-base font-semibold text-gob-black">Aún no hay cargas aprobadas</p>
        <p className="mt-2 text-sm text-gob-gray-a">
          Cuando un notificador dé visto bueno a una carga, aparecerá aquí.
        </p>
      </div>
    );
  }

  return (
    <>
      <TablaCargasAprobadas filas={filas} rutaDetalle={(id) => `${rutaBase}/${id}`} />
      <Paginacion
        pagina={resultado.paginacion.pagina}
        tamano={resultado.paginacion.tamano}
        total={resultado.paginacion.total}
        totalPaginas={resultado.paginacion.totalPaginas}
        cantidadEnPagina={filas.length}
        construirHref={construirHref}
      />
    </>
  );
}
