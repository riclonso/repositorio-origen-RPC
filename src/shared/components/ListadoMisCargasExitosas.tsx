import { listarCargasPropiasExitosas } from "@/modules/reporte-excel/application/use-cases/ListarCargasPropiasExitosas";
import { prismaCargaArchivoRepository } from "@/modules/reporte-excel/infrastructure/repositories/PrismaCargaArchivoRepository";
import { Paginacion } from "@/shared/components/Paginacion";
import { TablaMisCargasExitosas } from "@/shared/components/TablaMisCargasExitosas";
import { aGrupoCargaExitosaVista } from "@/shared/components/mis-cargas-exitosas";

// Server Component de "Mis cargas" (histórico de exitosas), exclusivo de `/notificador/cargas`:
// `usuarioId` siempre viene de la sesión resuelta en la página, nunca de un parámetro manipulable
// en la URL (solo `page`/`pageSize` lo son). Mismo patrón que `ListadoCargasAprobadas`.
type ListadoMisCargasExitosasProps = {
  usuarioId: string;
  pagina: number;
  tamano: number;
  construirHref: (pagina: number) => string;
};

export async function ListadoMisCargasExitosas({
  usuarioId,
  pagina,
  tamano,
  construirHref,
}: ListadoMisCargasExitosasProps) {
  const resultado = await listarCargasPropiasExitosas(
    { usuarioId, pagina, tamano },
    { repositorio: prismaCargaArchivoRepository },
  );
  const grupos = resultado.grupos.map(aGrupoCargaExitosaVista);

  if (grupos.length === 0) {
    return (
      <div className="mt-6 rounded-lg border border-gob-accent bg-white p-8 text-center">
        <p className="text-base font-semibold text-gob-black">Aún no tienes cargas exitosas</p>
        <p className="mt-2 text-sm text-gob-gray-a">
          Cuando des visto bueno a una carga, aparecerá aquí.
        </p>
      </div>
    );
  }

  return (
    <>
      <TablaMisCargasExitosas grupos={grupos} rutaBase="/notificador/cargas" />
      <Paginacion
        pagina={resultado.paginacion.pagina}
        tamano={resultado.paginacion.tamano}
        total={resultado.paginacion.total}
        totalPaginas={resultado.paginacion.totalPaginas}
        cantidadEnPagina={grupos.length}
        construirHref={construirHref}
      />
    </>
  );
}
