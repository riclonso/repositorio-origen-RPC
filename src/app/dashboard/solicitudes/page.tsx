import type { Metadata } from "next";
import {
  FILTRO_LISTADO_SOLICITUDES_REEMPLAZO_POR_DEFECTO,
  listadoSolicitudesReemplazoSchema,
} from "@/modules/solicitudes-reemplazo/schemas/solicitud-reemplazo.schema";
import { ListadoSolicitudesReemplazo } from "@/shared/components/ListadoSolicitudesReemplazo";
import { construirRutaSolicitudesDashboard } from "./ruta-solicitudes";

export const metadata: Metadata = {
  title: "Solicitudes de reemplazo - Repositorio RPC - SEREMI de Salud Biobío",
};

type SolicitudesDashboardPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SolicitudesDashboardPage({ searchParams }: SolicitudesDashboardPageProps) {
  const parametros = await searchParams;
  // Modo tolerante: una URL editada a mano cae a los valores por defecto en vez de romper la
  // pantalla.
  const analisis = listadoSolicitudesReemplazoSchema.safeParse(parametros);
  const filtro = analisis.success ? analisis.data : { ...FILTRO_LISTADO_SOLICITUDES_REEMPLAZO_POR_DEFECTO };

  return (
    <div>
      <div>
        <h1 className="text-xl font-semibold text-gob-black">Solicitudes de reemplazo</h1>
        <p className="mt-2 text-sm text-gob-gray-a">
          Revisa y aprueba las solicitudes de los notificadores para reemplazar una carga ya aprobada.
        </p>
      </div>

      <ListadoSolicitudesReemplazo
        filtro={{ estado: filtro.estado, pagina: filtro.page, tamano: filtro.pageSize }}
        construirHref={(pagina, estado) =>
          construirRutaSolicitudesDashboard(pagina, estado ?? filtro.estado)
        }
      />
    </div>
  );
}
