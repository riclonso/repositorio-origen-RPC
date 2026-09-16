import Link from "next/link";
import type {
  Establecimiento,
  FiltroListadoEstablecimientos,
} from "@/modules/establecimiento/domain/entities/Establecimiento";
import { listarEstablecimientos } from "@/modules/establecimiento/application/use-cases/ListarEstablecimientos";
import { prismaEstablecimientoRepository } from "@/modules/establecimiento/infrastructure/repositories/PrismaEstablecimientoRepository";
import { RUTA_ESTABLECIMIENTOS, construirRutaEstablecimientos } from "./ruta-establecimientos";
import { PaginacionEstablecimientos } from "./paginacion-establecimientos";
import {
  TablaEstablecimientos,
  type FilaEstablecimientoVista,
} from "./tabla-establecimientos";

// La fecha se formatea en el servidor y con zona horaria fija: si la formateara el navegador, la
// hidratación mostraría un valor distinto según la zona del equipo del funcionario.
const formateadorFecha = new Intl.DateTimeFormat("es-CL", {
  timeZone: "America/Santiago",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const CLASES_ENLACE_VACIO =
  "inline-flex items-center justify-center rounded-md bg-gob-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gob-tertiary active:translate-y-[1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary";

function aFilaVista(establecimiento: Establecimiento): FilaEstablecimientoVista {
  return {
    id: establecimiento.id,
    rut: establecimiento.rut,
    nombre: establecimiento.nombre,
    direccion: establecimiento.direccion,
    tipoNombre: establecimiento.tipoNombre,
    activo: establecimiento.activo,
    creadoEl: formateadorFecha.format(establecimiento.createdAt),
  };
}

function EstadoVacio({
  titulo,
  detalle,
  accion,
}: {
  titulo: string;
  detalle: string;
  accion: React.ReactNode;
}) {
  return (
    <div className="card-sistema mt-6 p-8 text-center">
      <p className="text-base font-semibold text-gob-black">{titulo}</p>
      <p className="mt-2 text-sm text-gob-gray-a">{detalle}</p>
      <div className="mt-4 flex justify-center">{accion}</div>
    </div>
  );
}

type ListadoEstablecimientosProps = {
  filtro: FiltroListadoEstablecimientos;
};

export async function ListadoEstablecimientos({ filtro }: ListadoEstablecimientosProps) {
  const resultado = await listarEstablecimientos(filtro, {
    repositorio: prismaEstablecimientoRepository,
  });
  const { filas, paginacion } = resultado;

  const hayFiltros =
    filtro.termino !== undefined || filtro.tipo !== undefined || filtro.activo !== undefined;

  const conteo =
    paginacion.total === 1
      ? "1 establecimiento encontrado"
      : `${paginacion.total} establecimientos encontrados`;

  const descripcionTabla = hayFiltros
    ? `Establecimientos que coinciden con los filtros aplicados. Página ${paginacion.pagina} de ${paginacion.totalPaginas}.`
    : `Establecimientos registrados. Página ${paginacion.pagina} de ${paginacion.totalPaginas}.`;

  return (
    <section>
      <p aria-live="polite" className="mt-6 text-sm font-medium text-gob-gray-a">
        {conteo}
      </p>

      {filas.length > 0 ? (
        <>
          <TablaEstablecimientos filas={filas.map(aFilaVista)} descripcion={descripcionTabla} />
          <PaginacionEstablecimientos
            paginacion={paginacion}
            filtro={filtro}
            cantidadEnPagina={filas.length}
          />
        </>
      ) : null}

      {filas.length === 0 && paginacion.total === 0 && !hayFiltros ? (
        <EstadoVacio
          titulo="Aún no hay establecimientos registrados"
          detalle="Registra el primer establecimiento para comenzar."
          accion={
            <Link href={`${RUTA_ESTABLECIMIENTOS}/nuevo`} className={CLASES_ENLACE_VACIO}>
              Nuevo establecimiento
            </Link>
          }
        />
      ) : null}

      {filas.length === 0 && paginacion.total === 0 && hayFiltros ? (
        <EstadoVacio
          titulo={
            filtro.termino
              ? `No se encontraron establecimientos para "${filtro.termino}"`
              : "No se encontraron establecimientos con esos filtros"
          }
          detalle="Revisa el texto buscado o quita los filtros para ver el listado completo."
          accion={
            <Link href={RUTA_ESTABLECIMIENTOS} className={CLASES_ENLACE_VACIO}>
              Limpiar filtros
            </Link>
          }
        />
      ) : null}

      {filas.length === 0 && paginacion.total > 0 ? (
        <EstadoVacio
          titulo="Esta página no tiene resultados"
          detalle={`La búsqueda tiene ${paginacion.total} resultados repartidos en ${paginacion.totalPaginas} páginas.`}
          accion={
            <Link href={construirRutaEstablecimientos(filtro, 1)} className={CLASES_ENLACE_VACIO}>
              Ir a la página 1
            </Link>
          }
        />
      ) : null}
    </section>
  );
}
