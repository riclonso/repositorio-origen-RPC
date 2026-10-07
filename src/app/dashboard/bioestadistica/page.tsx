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

const RUTA = "/dashboard/bioestadistica";

type BioestadisticaDashboardPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// RF-37: archivos de Defunciones y Egresos por año (ADMIN). Protegida por el proxy (`/dashboard`).
export default async function BioestadisticaDashboardPage({ searchParams }: BioestadisticaDashboardPageProps) {
  // Modo tolerante: una URL editada a mano cae a los valores por defecto en vez de romper la pantalla.
  const analisis = listadoCargasBioestadisticaSchema.safeParse(await searchParams);
  const filtro = analisis.success ? analisis.data : FILTRO_LISTADO_CARGAS_BIOESTADISTICA_POR_DEFECTO;

  return (
    <div>
      <h1 className="text-xl font-semibold text-gob-black">Archivos de Bioestadística</h1>
      <p className="mt-2 text-sm text-gob-gray-a">
        Archivos de Defunciones y Egresos reportados por año, vigentes y reemplazados.
      </p>

      <ListadoCargasBioestadistica
        filtro={{ anio: filtro.anio, tipoArchivo: filtro.tipoArchivo, pagina: filtro.page, tamano: filtro.pageSize }}
        rutaBase={RUTA}
        construirHref={(filtroVista) => construirRutaCargasBioestadistica(RUTA, filtroVista)}
      />
    </div>
  );
}
