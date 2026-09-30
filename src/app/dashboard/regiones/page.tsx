import type { Metadata } from "next";
import Link from "next/link";
import { listarRegiones } from "@/modules/regiones/application/use-cases/ListarRegiones";
import { prismaRegionRepository } from "@/modules/regiones/infrastructure/repositories/PrismaRegionRepository";
import type { Region } from "@/modules/regiones/domain/entities/Region";
import { RUTA_REGIONES } from "./ruta-regiones";
import { TablaRegiones, type FilaRegionVista } from "./tabla-regiones";

export const metadata: Metadata = {
  title: "Regiones - Repositorio RPC - SEREMI de Salud Biobío",
};

type RegionesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const CLASES_ENLACE_NUEVO =
  "inline-flex items-center justify-center rounded-md bg-gob-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gob-tertiary active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary";

function aFilaVista(region: Region): FilaRegionVista {
  return {
    id: region.id,
    nombre: region.nombre,
    codigo: region.codigo,
    numero: region.numero,
  };
}

export default async function RegionesPage({ searchParams }: RegionesPageProps) {
  const parametros = await searchParams;
  const regionCreada = parametros.creado === "1";

  const regiones = await listarRegiones({ repositorio: prismaRegionRepository });

  const conteo =
    regiones.length === 1 ? "1 región registrada" : `${regiones.length} regiones registradas`;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gob-black">Regiones</h1>
          <p className="mt-2 text-sm text-gob-gray-a">Catálogo de regiones de Chile.</p>
        </div>

        <Link href={`${RUTA_REGIONES}/nuevo`} className={CLASES_ENLACE_NUEVO}>
          Nueva región
        </Link>
      </div>

      {regionCreada ? (
        <p
          role="status"
          className="mt-5 rounded-lg border border-gob-success/30 bg-gob-success/10 px-4 py-3 text-sm font-medium text-gob-gray-a"
        >
          Región creada.
        </p>
      ) : null}

      {regiones.length > 0 ? (
        <>
          <p aria-live="polite" className="mt-6 text-sm font-medium text-gob-gray-a">
            {conteo}
          </p>
          <TablaRegiones
            filas={regiones.map(aFilaVista)}
            descripcion="Regiones registradas, ordenadas por número."
          />
        </>
      ) : (
        <div className="card-sistema mt-6 p-8 text-center">
          <p className="text-base font-semibold text-gob-black">Aún no hay regiones registradas</p>
          <p className="mt-2 text-sm text-gob-gray-a">Crea la primera región del catálogo.</p>
          <div className="mt-4 flex justify-center">
            <Link href={`${RUTA_REGIONES}/nuevo`} className={CLASES_ENLACE_NUEVO}>
              Crear región
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
