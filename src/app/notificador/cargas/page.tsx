import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { obtenerSesionActual } from "@/modules/auth/infrastructure/auth/SesionActual";
import {
  FILTRO_LISTADO_CARGAS_POR_DEFECTO,
  listadoCargasSchema,
} from "@/modules/reporte-excel/schemas/reporte-excel.schema";
import { ListadoMisCargasExitosas } from "@/shared/components/ListadoMisCargasExitosas";
import { construirRutaMisCargas } from "./ruta-mis-cargas";

export const metadata: Metadata = {
  title: "Mis cargas - Repositorio RPC - SEREMI de Salud Biobío",
};

type MisCargasPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function MisCargasPage({ searchParams }: MisCargasPageProps) {
  // El proxy ya garantiza una sesión de perfil notificador antes de llegar aquí; esta comprobación
  // es la red de seguridad para el caso borde de una cuenta borrada con el token aún vigente.
  const sesion = await obtenerSesionActual();

  if (!sesion) {
    redirect("/login");
  }

  const parametros = await searchParams;
  // Modo tolerante: una URL editada a mano cae a la página 1 en vez de romper la pantalla. Se
  // reutiliza el esquema de `/dashboard/cargas` (mismo `page`/`pageSize`); esta pantalla no expone
  // `estado`/`formatoExcelId` como parámetro de URL (el filtro vive en el cliente).
  const analisis = listadoCargasSchema.safeParse(parametros);
  const filtro = analisis.success ? analisis.data : { ...FILTRO_LISTADO_CARGAS_POR_DEFECTO };

  return (
    <div>
      <div>
        <h1 className="text-xl font-semibold text-gob-black">Mis cargas</h1>
        <p className="mt-2 text-sm text-gob-gray-a">
          Histórico de tus cargas exitosas y finalizadas. Si subes una corrección aprobada para la
          misma ventana, la anterior queda como reemplazada dentro de la misma fila.
        </p>
      </div>

      <ListadoMisCargasExitosas
        usuarioId={sesion.sub}
        pagina={filtro.page}
        tamano={filtro.pageSize}
        construirHref={construirRutaMisCargas}
      />
    </div>
  );
}
