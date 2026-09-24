import { listarCargasPendientesODecididas } from "@/modules/reporte-excel/application/use-cases/ListarCargasPendientesODecididas";
import { prismaCargaArchivoRepository } from "@/modules/reporte-excel/infrastructure/repositories/PrismaCargaArchivoRepository";
import { formatearFechaHora } from "@/shared/utils/fecha";
import { Paginacion } from "@/shared/components/Paginacion";
import { TablaCargasVentana, type FilaCargaVentanaVista } from "@/shared/components/TablaCargasVentana";

type ListadoCargasVentanaProps = {
  ventanaCargaId: string;
  pagina: number;
  tamano: number;
  construirHref: (pagina: number) => string;
};

// Server Component compartido entre `/dashboard/ventanas-carga/[id]` y
// `/revisor/ventanas-carga/[id]`: lista las cargas `APROBADA` y `PENDIENTE_VISTO_BUENO` ya
// finalizadas de una ventana puntual (corrección: fin de la autoaprobación, ver
// `ListarCargasPendientesODecididas`). El filtro se aplica siempre a nivel de consulta SQL
// (`listarPendientesODecididas` en `PrismaCargaArchivoRepository`), nunca en la UI.
export async function ListadoCargasVentana({
  ventanaCargaId,
  pagina,
  tamano,
  construirHref,
}: ListadoCargasVentanaProps) {
  const resultado = await listarCargasPendientesODecididas(
    { ventanaCargaId, pagina, tamano },
    { repositorio: prismaCargaArchivoRepository },
  );

  const filas: FilaCargaVentanaVista[] = resultado.filas.map((carga) => ({
    id: carga.id,
    usuarioNombre: carga.usuarioNombre,
    usuarioRut: carga.usuarioRut,
    nombreArchivoOriginal: carga.nombreArchivoOriginal,
    estado: carga.estado,
    fechaReporte: formatearFechaHora(carga.createdAt),
  }));

  if (filas.length === 0) {
    return (
      <div className="mt-6 rounded-lg border border-gob-accent bg-white p-8 text-center">
        <p className="text-base font-semibold text-gob-black">Aún no hay notificaciones</p>
        <p className="mt-2 text-sm text-gob-gray-a">
          Cuando un notificador finalice y envíe una carga de esta ventana, aparecerá aquí para su
          aprobación o rechazo.
        </p>
      </div>
    );
  }

  return (
    <>
      <TablaCargasVentana filas={filas} />
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
