import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { listarProvincias } from "@/modules/provincias/application/use-cases/ListarProvincias";
import { prismaProvinciaRepository } from "@/modules/provincias/infrastructure/repositories/PrismaProvinciaRepository";
import type { Provincia } from "@/modules/provincias/domain/entities/Provincia";
import { listarRegiones } from "@/modules/regiones/application/use-cases/ListarRegiones";
import { prismaRegionRepository } from "@/modules/regiones/infrastructure/repositories/PrismaRegionRepository";
import { FiltroProvincias } from "./filtro-provincias";
import { aOpcionesRegion, etiquetaRegion } from "@/shared/components/opciones-territorio";
import { RUTA_PROVINCIAS } from "./ruta-provincias";
import { TablaProvincias, type FilaProvinciaVista } from "./tabla-provincias";

export const metadata: Metadata = {
  title: "Provincias - Repositorio RPC - SEREMI de Salud Biobío",
};

type ProvinciasPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const CLASES_ENLACE_NUEVO =
  "inline-flex items-center justify-center rounded-md bg-gob-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gob-tertiary active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary";

const regionFiltroSchema = z.uuid();

// Modo tolerante: un `?region=` editado a mano que no es un UUID se ignora (lista todas) en vez de
// romper la pantalla. El Route Handler, en cambio, responde 400.
function leerRegionFiltro(valor: string | string[] | undefined): string | undefined {
  const analisis = regionFiltroSchema.safeParse(valor);
  return analisis.success ? analisis.data : undefined;
}

function aFilaVista(provincia: Provincia): FilaProvinciaVista {
  return {
    id: provincia.id,
    nombre: provincia.nombre,
    codigo: provincia.codigo,
    region: etiquetaRegion(provincia.region),
  };
}

export default async function ProvinciasPage({ searchParams }: ProvinciasPageProps) {
  const parametros = await searchParams;
  const provinciaCreada = parametros.creado === "1";
  const regionId = leerRegionFiltro(parametros.region);

  const [provincias, regiones] = await Promise.all([
    listarProvincias({ regionId }, { repositorio: prismaProvinciaRepository }),
    listarRegiones({ repositorio: prismaRegionRepository }),
  ]);

  const conteo =
    provincias.length === 1
      ? "1 provincia registrada"
      : `${provincias.length} provincias registradas`;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gob-black">Provincias</h1>
          <p className="mt-2 text-sm text-gob-gray-a">Catálogo de provincias de Chile por región.</p>
        </div>

        <Link href={`${RUTA_PROVINCIAS}/nuevo`} className={CLASES_ENLACE_NUEVO}>
          Nueva provincia
        </Link>
      </div>

      <FiltroProvincias
        key={`filtro:${regionId ?? ""}`}
        regionInicial={regionId ?? ""}
        opcionesRegion={aOpcionesRegion(regiones)}
      />

      {provinciaCreada ? (
        <p
          role="status"
          className="mt-5 rounded-lg border border-gob-success/30 bg-gob-success/10 px-4 py-3 text-sm font-medium text-gob-gray-a"
        >
          Provincia creada.
        </p>
      ) : null}

      {provincias.length > 0 ? (
        <>
          <p aria-live="polite" className="mt-6 text-sm font-medium text-gob-gray-a">
            {conteo}
          </p>
          <TablaProvincias
            filas={provincias.map(aFilaVista)}
            descripcion="Provincias registradas, ordenadas por región y código."
          />
        </>
      ) : (
        <div className="card-sistema mt-6 p-8 text-center">
          <p className="text-base font-semibold text-gob-black">
            {regionId ? "La región no tiene provincias registradas" : "Aún no hay provincias registradas"}
          </p>
          <p className="mt-2 text-sm text-gob-gray-a">Crea una provincia en el catálogo.</p>
          <div className="mt-4 flex justify-center">
            <Link href={`${RUTA_PROVINCIAS}/nuevo`} className={CLASES_ENLACE_NUEVO}>
              Crear provincia
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
