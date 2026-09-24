import type { Metadata } from "next";
import {
  FILTRO_LISTADO_CARGAS_POR_DEFECTO,
  listadoCargasSchema,
} from "@/modules/reporte-excel/schemas/reporte-excel.schema";
import { ListadoCargasAprobadas } from "@/shared/components/ListadoCargasAprobadas";
import { RUTA_CARGAS_DASHBOARD, construirRutaCargasDashboard } from "./ruta-cargas";

export const metadata: Metadata = {
  title: "Cargas aprobadas - Repositorio RPC - SEREMI de Salud Biobío",
};

type CargasDashboardPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CargasDashboardPage({ searchParams }: CargasDashboardPageProps) {
  const parametros = await searchParams;
  // Modo tolerante: una URL editada a mano cae a la página 1 en vez de romper la pantalla.
  const analisis = listadoCargasSchema.safeParse(parametros);
  const filtro = analisis.success ? analisis.data : { ...FILTRO_LISTADO_CARGAS_POR_DEFECTO };

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h1 className="text-4xl font-bold text-gob-black">Cargas aprobadas</h1>
        <p className="text-base text-gob-gray-a max-w-2xl leading-relaxed">
          Archivos de reporte a los que su notificador ya dio visto bueno.
        </p>
      </div>

      <ListadoCargasAprobadas
        pagina={filtro.page}
        tamano={filtro.pageSize}
        rutaBase={RUTA_CARGAS_DASHBOARD}
        construirHref={construirRutaCargasDashboard}
      />
    </div>
  );
}
