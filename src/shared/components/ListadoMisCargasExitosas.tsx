import { listarCargasPropiasExitosas } from "@/modules/reporte-excel/application/use-cases/ListarCargasPropiasExitosas";
import { prismaCargaArchivoRepository } from "@/modules/reporte-excel/infrastructure/repositories/PrismaCargaArchivoRepository";
import { listarSolicitudesReemplazoPropias } from "@/modules/solicitudes-reemplazo/application/use-cases/ListarSolicitudesReemplazoPropias";
import { prismaSolicitudReemplazoCargaRepository } from "@/modules/solicitudes-reemplazo/infrastructure/repositories/PrismaSolicitudReemplazoCargaRepository";
import { listarVentanasQueAdmitenAutorizaciones } from "@/modules/ventanas-carga/application/use-cases/ListarVentanasQueAdmitenAutorizaciones";
import { prismaVentanaCargaRepository } from "@/modules/ventanas-carga/infrastructure/repositories/PrismaVentanaCargaRepository";
import { Paginacion } from "@/shared/components/Paginacion";
import { TablaMisCargasExitosas } from "@/shared/components/TablaMisCargasExitosas";
import { aGrupoCargaExitosaVista, resolverEstadoReemplazoGrupo } from "@/shared/components/mis-cargas-exitosas";

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
  const [resultado, solicitudesPropias] = await Promise.all([
    listarCargasPropiasExitosas({ usuarioId, pagina, tamano }, { repositorio: prismaCargaArchivoRepository }),
    // RF-36: estado de las solicitudes de reemplazo de cada fila vigente, en UNA consulta.
    listarSolicitudesReemplazoPropias(usuarioId, { repositorio: prismaSolicitudReemplazoCargaRepository }),
  ]);

  // RF-36: qué ventanas de esta página todavía admiten pedir un reemplazo (abiertas o vencidas por
  // fecha; no archivadas, despublicadas ni eliminadas). Una sola consulta para toda la página.
  const ventanasQueAdmiten = await listarVentanasQueAdmitenAutorizaciones(
    [...new Set(resultado.grupos.map((grupo) => grupo.vigente.ventanaCargaId))],
    { repositorio: prismaVentanaCargaRepository },
  );
  const idsVentanasQueAdmiten = new Set(ventanasQueAdmiten.map((ventana) => ventana.id));
  const ahora = new Date();

  const grupos = resultado.grupos.map((grupo) =>
    aGrupoCargaExitosaVista(
      grupo,
      resolverEstadoReemplazoGrupo(grupo.vigente, solicitudesPropias.solicitudes, idsVentanasQueAdmiten, ahora),
    ),
  );

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
      <TablaMisCargasExitosas grupos={grupos} />
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
