import type { Metadata } from "next";
import {
  FILTRO_LISTADO_SOLICITUDES_REEMPLAZO_POR_DEFECTO,
  listadoSolicitudesReemplazoSchema,
} from "@/modules/solicitudes-reemplazo/schemas/solicitud-reemplazo.schema";
import { ListadoSolicitudesReemplazo } from "@/shared/components/ListadoSolicitudesReemplazo";
import { construirRutaSolicitudesRevisor } from "./ruta-solicitudes";

export const metadata: Metadata = {
  title: "Solicitudes de reemplazo - Repositorio RPC - SEREMI de Salud Biobío",
};

type SolicitudesRevisorPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SolicitudesRevisorPage({ searchParams }: SolicitudesRevisorPageProps) {
  const parametros = await searchParams;
  // Modo tolerante: una URL editada a mano cae a los valores por defecto en vez de romper la
  // pantalla.
  const analisis = listadoSolicitudesReemplazoSchema.safeParse(parametros);
  const filtro = analisis.success ? analisis.data : FILTRO_LISTADO_SOLICITUDES_REEMPLAZO_POR_DEFECTO;

  return (
    <div>
      <section className="mb-8 border-b border-gob-accent/30 pb-6">
        <div className="space-y-3">
          <h1 className="text-3xl font-bold tracking-tight text-gob-tertiary">Solicitudes de reemplazo</h1>
          <p className="text-base text-gob-gray-a max-w-2xl leading-relaxed">
            Revisa y aprueba las solicitudes de los notificadores para reemplazar una carga ya aprobada.
          </p>
        </div>
      </section>

      <ListadoSolicitudesReemplazo
        filtro={{ estado: filtro.estado, pagina: filtro.page, tamano: filtro.pageSize }}
        construirHref={(pagina, estado) => construirRutaSolicitudesRevisor(pagina, estado ?? filtro.estado)}
      />
    </div>
  );
}
