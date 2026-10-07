import type { Metadata } from "next";
import {
  FILTRO_LISTADO_CARGAS_BIOESTADISTICA_POR_DEFECTO,
  listadoCargasBioestadisticaSchema,
} from "@/modules/bioestadistica/schemas/bioestadistica.schema";
import { ListadoCargasBioestadistica } from "@/shared/components/ListadoCargasBioestadistica";
import { construirRutaCargasBioestadistica } from "@/shared/components/ruta-cargas-bioestadistica";

export const metadata: Metadata = {
  title: "Archivos de Bioestadística - Repositorio RPC - SEREMI de Salud Biobío",
};

const RUTA = "/revisor/bioestadistica";

type BioestadisticaRevisorPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// RF-37: archivos de Defunciones y Egresos por año (REVISOR_REPOSITORIO). Protegida por el proxy.
export default async function BioestadisticaRevisorPage({ searchParams }: BioestadisticaRevisorPageProps) {
  const analisis = listadoCargasBioestadisticaSchema.safeParse(await searchParams);
  const filtro = analisis.success ? analisis.data : FILTRO_LISTADO_CARGAS_BIOESTADISTICA_POR_DEFECTO;

  return (
    <div>
      <section className="mb-8 border-b border-gob-accent/30 pb-6">
        <div className="space-y-3">
          <h1 className="text-3xl font-bold tracking-tight text-gob-tertiary">Archivos de Bioestadística</h1>
          <p className="max-w-2xl text-base leading-relaxed text-gob-gray-a">
            Archivos de Defunciones y Egresos reportados por año, vigentes y reemplazados.
          </p>
        </div>
      </section>

      <ListadoCargasBioestadistica
        filtro={{ anio: filtro.anio, tipoArchivo: filtro.tipoArchivo, pagina: filtro.page, tamano: filtro.pageSize }}
        rutaBase={RUTA}
        construirHref={(filtroVista) => construirRutaCargasBioestadistica(RUTA, filtroVista)}
      />
    </div>
  );
}
