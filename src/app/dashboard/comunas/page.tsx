import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { listarComunas } from "@/modules/comunas/application/use-cases/ListarComunas";
import { prismaComunaRepository } from "@/modules/comunas/infrastructure/repositories/PrismaComunaRepository";
import type { Comuna } from "@/modules/comunas/domain/entities/Comuna";
import { listarProvincias } from "@/modules/provincias/application/use-cases/ListarProvincias";
import { prismaProvinciaRepository } from "@/modules/provincias/infrastructure/repositories/PrismaProvinciaRepository";
import { listarRegiones } from "@/modules/regiones/application/use-cases/ListarRegiones";
import { prismaRegionRepository } from "@/modules/regiones/infrastructure/repositories/PrismaRegionRepository";
import {
  aGruposProvinciaPorRegion,
  aOpcionesRegion,
  etiquetaProvincia,
  etiquetaRegion,
} from "@/shared/components/opciones-territorio";
import { FiltroComunas } from "./filtro-comunas";
import { RUTA_COMUNAS } from "./ruta-comunas";
import { TablaComunas, type FilaComunaVista } from "./tabla-comunas";

export const metadata: Metadata = {
  title: "Comunas - Repositorio RPC - SEREMI de Salud Biobío",
};

type ComunasPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const CLASES_ENLACE_NUEVO =
  "inline-flex items-center justify-center rounded-md bg-gob-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gob-tertiary active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary";

const idFiltroSchema = z.uuid();

// Modo tolerante: un `?region=` o `?provincia=` editado a mano que no es un UUID se ignora (se
// lista sin ese filtro) en vez de romper la pantalla. El Route Handler, en cambio, responde 400.
function leerIdFiltro(valor: string | string[] | undefined): string | undefined {
  const analisis = idFiltroSchema.safeParse(valor);
  return analisis.success ? analisis.data : undefined;
}

function aFilaVista(comuna: Comuna): FilaComunaVista {
  return {
    id: comuna.id,
    nombre: comuna.nombre,
    codigo: comuna.codigo,
    provincia: etiquetaProvincia(comuna.provincia),
    region: etiquetaRegion(comuna.provincia.region),
  };
}

export default async function ComunasPage({ searchParams }: ComunasPageProps) {
  const parametros = await searchParams;
  const comunaCreada = parametros.creado === "1";
  const regionId = leerIdFiltro(parametros.region);
  const provinciaId = leerIdFiltro(parametros.provincia);
  const hayFiltro = regionId !== undefined || provinciaId !== undefined;

  const [comunas, regiones, provincias] = await Promise.all([
    listarComunas({ regionId, provinciaId }, { repositorio: prismaComunaRepository }),
    listarRegiones({ repositorio: prismaRegionRepository }),
    listarProvincias({}, { repositorio: prismaProvinciaRepository }),
  ]);

  const conteo =
    comunas.length === 1 ? "1 comuna registrada" : `${comunas.length} comunas registradas`;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gob-black">Comunas</h1>
          <p className="mt-2 text-sm text-gob-gray-a">
            Catálogo de comunas de Chile por provincia y región.
          </p>
        </div>

        <Link href={`${RUTA_COMUNAS}/nuevo`} className={CLASES_ENLACE_NUEVO}>
          Nueva comuna
        </Link>
      </div>

      <FiltroComunas
        key={`filtro:${regionId ?? ""}:${provinciaId ?? ""}`}
        regionInicial={regionId ?? ""}
        provinciaInicial={provinciaId ?? ""}
        opcionesRegion={aOpcionesRegion(regiones)}
        gruposProvincia={aGruposProvinciaPorRegion(provincias)}
      />

      {comunaCreada ? (
        <p
          role="status"
          className="mt-5 rounded-lg border border-gob-success/30 bg-gob-success/10 px-4 py-3 text-sm font-medium text-gob-gray-a"
        >
          Comuna creada.
        </p>
      ) : null}

      {comunas.length > 0 ? (
        <>
          <p aria-live="polite" className="mt-6 text-sm font-medium text-gob-gray-a">
            {conteo}
          </p>
          <TablaComunas
            filas={comunas.map(aFilaVista)}
            descripcion="Comunas registradas, ordenadas por región y código."
          />
        </>
      ) : (
        <div className="card-sistema mt-6 p-8 text-center">
          <p className="text-base font-semibold text-gob-black">
            {hayFiltro
              ? "No hay comunas que coincidan con los filtros"
              : "Aún no hay comunas registradas"}
          </p>
          <p className="mt-2 text-sm text-gob-gray-a">
            {hayFiltro
              ? "Cambia la región o la provincia, o crea una comuna en el catálogo."
              : "Crea una comuna en el catálogo."}
          </p>
          <div className="mt-4 flex justify-center">
            <Link href={`${RUTA_COMUNAS}/nuevo`} className={CLASES_ENLACE_NUEVO}>
              Crear comuna
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
