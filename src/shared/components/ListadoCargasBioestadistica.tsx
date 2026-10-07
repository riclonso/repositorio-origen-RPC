import { listarCargasBioestadisticaAdministracion } from "@/modules/bioestadistica/application/use-cases/ListarCargasBioestadisticaAdministracion";
import {
  ETIQUETAS_TIPO_ARCHIVO_BIOESTADISTICA,
  TIPOS_ARCHIVO_BIOESTADISTICA,
  type TipoArchivoBioestadistica,
} from "@/modules/bioestadistica/domain/entities/TipoArchivoBioestadistica";
import { prismaCargaBioestadisticaRepository } from "@/modules/bioestadistica/infrastructure/repositories/PrismaCargaBioestadisticaRepository";
import { Boton } from "@/shared/components/Boton";
import { CampoSelect, type OpcionSelect } from "@/shared/components/CampoSelect";
import { Paginacion } from "@/shared/components/Paginacion";
import { TablaCargasBioestadistica, type FilaCargaBioestadisticaVista } from "@/shared/components/TablaCargasBioestadistica";
import { formatearFechaHora } from "@/shared/utils/fecha";
import { formatearTamanoArchivo } from "@/shared/utils/tamanoArchivo";

export type FiltroVistaCargasBioestadistica = {
  anio?: number;
  tipoArchivo?: TipoArchivoBioestadistica;
  pagina: number;
  tamano: number;
};

type ListadoCargasBioestadisticaProps = {
  filtro: FiltroVistaCargasBioestadistica;
  // Ruta de la página (`/dashboard/bioestadistica` o `/revisor/bioestadistica`): destino del
  // formulario de filtro.
  rutaBase: string;
  construirHref: (filtro: FiltroVistaCargasBioestadistica) => string;
};

const OPCION_TODOS_LOS_TIPOS: OpcionSelect = { valor: "", etiqueta: "Todos" };

// RF-37: listado administrativo por año de los archivos de Bioestadística (vigentes y reemplazados),
// compartido por ADMIN (`/dashboard`) y REVISOR_REPOSITORIO (`/revisor`). Server Component: el filtro
// es un formulario GET (funciona sin JavaScript) y la paginación, enlaces.
export async function ListadoCargasBioestadistica({ filtro, rutaBase, construirHref }: ListadoCargasBioestadisticaProps) {
  const resultado = await listarCargasBioestadisticaAdministracion(
    { anio: filtro.anio, tipoArchivo: filtro.tipoArchivo, pagina: filtro.pagina, tamano: filtro.tamano },
    { repositorio: prismaCargaBioestadisticaRepository },
  );

  // El año pedido se ofrece aunque todavía no tenga archivos, para no "perder" la selección.
  const anios = [...new Set([...(resultado.anio === null ? [] : [resultado.anio]), ...resultado.aniosConCargas])].toSorted(
    (a, b) => b - a,
  );
  const opcionesAnio: OpcionSelect[] = anios.map((anio) => ({ valor: String(anio), etiqueta: String(anio) }));
  const opcionesTipo: OpcionSelect[] = [
    OPCION_TODOS_LOS_TIPOS,
    ...TIPOS_ARCHIVO_BIOESTADISTICA.map((tipo) => ({ valor: tipo, etiqueta: ETIQUETAS_TIPO_ARCHIVO_BIOESTADISTICA[tipo] })),
  ];

  const filas: FilaCargaBioestadisticaVista[] = resultado.filas.map((carga) => ({
    id: carga.id,
    usuarioNombre: carga.usuarioNombre,
    usuarioRut: carga.usuarioRut,
    establecimientoNombre: carga.establecimientoNombre,
    etiquetaTipo: ETIQUETAS_TIPO_ARCHIVO_BIOESTADISTICA[carga.tipoArchivo],
    vigente: carga.estado === "ACTIVA",
    nombreArchivoOriginal: carga.nombreArchivoOriginal,
    subidoElTexto: formatearFechaHora(carga.createdAt),
    cantidadFilasDatos: carga.cantidadFilasDatos,
    tamanoTexto: formatearTamanoArchivo(carga.tamanoBytes),
  }));

  if (resultado.anio === null) {
    return (
      <div className="mt-6 rounded-lg border border-gob-accent bg-white p-8 text-center">
        <p className="text-base font-semibold text-gob-black">Aún no hay archivos de Bioestadística</p>
        <p className="mt-2 text-sm text-gob-gray-a">Cuando se reporte el primero, aparecerá aquí.</p>
      </div>
    );
  }

  const filtroEfectivo = { ...filtro, anio: resultado.anio };

  return (
    <section>
      <form method="get" action={rutaBase} className="mt-6 grid gap-4 rounded-lg border border-gob-accent bg-white p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <CampoSelect id="filtro-anio-bioestadistica" name="anio" etiqueta="Año" opciones={opcionesAnio} defaultValue={String(resultado.anio)} />
        <CampoSelect
          id="filtro-tipo-bioestadistica"
          name="tipoArchivo"
          etiqueta="Tipo de archivo"
          opciones={opcionesTipo}
          defaultValue={filtro.tipoArchivo ?? ""}
        />
        <Boton type="submit" variante="secundario">
          Filtrar
        </Boton>
      </form>

      <p aria-live="polite" className="mt-4 text-sm font-medium text-gob-gray-a">
        {resultado.paginacion.total === 1 ? "1 archivo encontrado" : `${resultado.paginacion.total} archivos encontrados`}
      </p>

      {filas.length > 0 ? (
        <>
          <TablaCargasBioestadistica filas={filas} />
          <Paginacion
            pagina={resultado.paginacion.pagina}
            tamano={resultado.paginacion.tamano}
            total={resultado.paginacion.total}
            totalPaginas={resultado.paginacion.totalPaginas}
            cantidadEnPagina={filas.length}
            construirHref={(pagina) => construirHref({ ...filtroEfectivo, pagina })}
          />
        </>
      ) : (
        <div className="mt-6 rounded-lg border border-gob-accent bg-white p-8 text-center">
          <p className="text-base font-semibold text-gob-black">No hay archivos para este filtro</p>
          <p className="mt-2 text-sm text-gob-gray-a">Prueba con otro año o tipo de archivo.</p>
        </div>
      )}
    </section>
  );
}
