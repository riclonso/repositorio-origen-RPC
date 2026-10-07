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

const RUTA = "/revisor/bioestadistica/solicitudes";

type SolicitudesBioestadisticaRevisorPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// RF-37: bandeja de solicitudes de reemplazo de Bioestadística (REVISOR_REPOSITORIO).
export default async function SolicitudesBioestadisticaRevisorPage({ searchParams }: SolicitudesBioestadisticaRevisorPageProps) {
  const analisis = listadoSolicitudesReemplazoSchema.safeParse(await searchParams);
  const filtro = analisis.success ? analisis.data : FILTRO_LISTADO_SOLICITUDES_REEMPLAZO_POR_DEFECTO;

  return (
    <div>
      <section className="mb-8 border-b border-gob-accent/30 pb-6">
        <div className="space-y-3">
          <h1 className="text-3xl font-bold tracking-tight text-gob-tertiary">Solicitudes de Bioestadística</h1>
          <p className="max-w-2xl text-base leading-relaxed text-gob-gray-a">
            Revisa las solicitudes para reemplazar un archivo de Defunciones o Egresos ya enviado.
          </p>
        </div>
      </section>

      <ListadoSolicitudesBioestadistica
        filtro={{ estado: filtro.estado, pagina: filtro.page, tamano: filtro.pageSize }}
        construirHref={(pagina, estado) => construirRutaSolicitudesBioestadistica(RUTA, pagina, estado ?? filtro.estado)}
      />
    </div>
  );
}
