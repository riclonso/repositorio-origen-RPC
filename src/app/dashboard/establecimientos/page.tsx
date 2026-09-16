import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { listarTiposEstablecimiento } from "@/modules/tipoEstablecimiento/application/use-cases/ListarTiposEstablecimiento";
import { prismaTipoEstablecimientoRepository } from "@/modules/tipoEstablecimiento/infrastructure/repositories/PrismaTipoEstablecimientoRepository";
import type { FiltroListadoEstablecimientos } from "@/modules/establecimiento/domain/entities/Establecimiento";
import {
  FILTRO_LISTADO_POR_DEFECTO,
  listadoEstablecimientosSchema,
} from "@/modules/establecimiento/schemas/listado-establecimientos.schema";
import { EsqueletoTablaEstablecimientos } from "./esqueleto-tabla-establecimientos";
import { aOpcionesTipo } from "./opciones-tipo";
import { FiltrosEstablecimientos } from "./filtros-establecimientos";
import { ListadoEstablecimientos } from "./listado-establecimientos";
import { RUTA_ESTABLECIMIENTOS, construirRutaEstablecimientos } from "./ruta-establecimientos";

export const metadata: Metadata = {
  title: "Establecimientos - Repositorio RPC - SEREMI de Salud Biobío",
};

type EstablecimientosPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function EstablecimientosPage({ searchParams }: EstablecimientosPageProps) {
  const parametros = await searchParams;
  const establecimientoCreado = parametros.creado === "1";

  // Modo tolerante: una URL editada a mano por el operador cae a los valores por defecto en vez de
  // romper la pantalla. El Route Handler, en cambio, responde 400.
  const analisis = listadoEstablecimientosSchema.safeParse(parametros);
  const filtro: FiltroListadoEstablecimientos = analisis.success
    ? analisis.data
    : { ...FILTRO_LISTADO_POR_DEFECTO };

  // Se ofrecen TODOS los tipos, incluidos los dados de baja: un tipo desactivado que aún tiene
  // establecimientos debe poder filtrarse, si no esos registros quedan sin forma de encontrarse.
  const tipos = await listarTiposEstablecimiento(
    {},
    { repositorio: prismaTipoEstablecimientoRepository },
  );

  const claveFiltro = construirRutaEstablecimientos(filtro);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gob-black">Establecimientos</h1>
          <p className="mt-2 text-sm text-gob-gray-a">
            Administra los establecimientos que reportan al Registro Poblacional de Cáncer.
          </p>
        </div>

        <Link
          href={`${RUTA_ESTABLECIMIENTOS}/nuevo`}
          className="inline-flex items-center justify-center rounded-md bg-gob-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gob-tertiary active:translate-y-[1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary"
        >
          Nuevo establecimiento
        </Link>
      </div>

      <FiltrosEstablecimientos
        key={`filtros:${claveFiltro}`}
        terminoInicial={filtro.termino ?? ""}
        tipoInicial={filtro.tipo ?? ""}
        activoInicial={filtro.activo === undefined ? "" : String(filtro.activo)}
        tamano={filtro.tamano}
        opcionesTipo={aOpcionesTipo(tipos)}
      />

      {establecimientoCreado ? (
        <p
          role="status"
          className="mt-5 rounded-lg border border-gob-success/30 bg-gob-success/10 px-4 py-3 text-sm font-medium text-gob-gray-a"
        >
          Establecimiento creado.
        </p>
      ) : null}

      {/* La key hace reaparecer el esqueleto en cada búsqueda y en cada salto de página;
          loading.tsx solo cubre la primera entrada al segmento. */}
      <Suspense key={`listado:${claveFiltro}`} fallback={<EsqueletoTablaEstablecimientos />}>
        <ListadoEstablecimientos filtro={filtro} />
      </Suspense>
    </div>
  );
}
