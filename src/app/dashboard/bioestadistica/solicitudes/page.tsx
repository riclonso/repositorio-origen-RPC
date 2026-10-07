import type { Metadata } from "next";
import {
  FILTRO_LISTADO_SOLICITUDES_REEMPLAZO_POR_DEFECTO,
  listadoSolicitudesReemplazoSchema,
} from "@/modules/solicitudes-reemplazo/schemas/solicitud-reemplazo.schema";
import { ListadoSolicitudesBioestadistica } from "@/shared/components/ListadoSolicitudesBioestadistica";
import { construirRutaSolicitudesBioestadistica } from "@/shared/components/ruta-cargas-bioestadistica";

export const metadata: Metadata = {
  title: "Solicitudes de Bioestadística - Repositorio RPC - SEREMI de Salud Biobío",
};

const RUTA = "/dashboard/bioestadistica/solicitudes";

type SolicitudesBioestadisticaDashboardPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// RF-37: bandeja de solicitudes de reemplazo de Bioestadística (ADMIN).
export default async function SolicitudesBioestadisticaDashboardPage({ searchParams }: SolicitudesBioestadisticaDashboardPageProps) {
  const analisis = listadoSolicitudesReemplazoSchema.safeParse(await searchParams);
  const filtro = analisis.success ? analisis.data : FILTRO_LISTADO_SOLICITUDES_REEMPLAZO_POR_DEFECTO;

  return (
    <div>
      <h1 className="text-xl font-semibold text-gob-black">Solicitudes de Bioestadística</h1>
      <p className="mt-2 text-sm text-gob-gray-a">
        Revisa las solicitudes para reemplazar un archivo de Defunciones o Egresos ya enviado.
      </p>

      <ListadoSolicitudesBioestadistica
        filtro={{ estado: filtro.estado, pagina: filtro.page, tamano: filtro.pageSize }}
        construirHref={(pagina, estado) => construirRutaSolicitudesBioestadistica(RUTA, pagina, estado ?? filtro.estado)}
      />
    </div>
  );
}
