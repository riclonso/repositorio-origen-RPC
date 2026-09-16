import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { obtenerVentanaCarga } from "@/modules/ventanas-carga/application/use-cases/ObtenerVentanaCarga";
import { prismaVentanaCargaRepository } from "@/modules/ventanas-carga/infrastructure/repositories/PrismaVentanaCargaRepository";
import {
  FILTRO_LISTADO_CARGAS_POR_DEFECTO,
  listadoCargasSchema,
} from "@/modules/reporte-excel/schemas/reporte-excel.schema";
import { paginaAlertaVentanaCargaSchema } from "@/modules/ventanas-carga/schemas/ventana-carga.schema";
import { DetalleVentanaCarga } from "@/shared/components/DetalleVentanaCarga";
import { construirRutaDetalleVentanaDashboard } from "./ruta-detalle";

export const metadata: Metadata = {
  title: "Detalle de ventana de carga - Repositorio RPC - SEREMI de Salud Biobío",
};

type DetalleVentanaCargaDashboardPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// Solo lectura. No se audita el acceso (es una lectura, no una escritura ni un rechazo de
// negocio), mismo criterio ya documentado para `/dashboard/cargas/[id]`.
export default async function DetalleVentanaCargaDashboardPage({
  params,
  searchParams,
}: DetalleVentanaCargaDashboardPageProps) {
  const [{ id }, parametros] = await Promise.all([params, searchParams]);

  const ventana = await obtenerVentanaCarga(id, { repositorio: prismaVentanaCargaRepository });

  if (!ventana) {
    notFound();
  }

  // Modo tolerante: una URL editada a mano cae a la página 1 en vez de romper la pantalla.
  const analisis = listadoCargasSchema.safeParse(parametros);
  const filtro = analisis.success ? analisis.data : { ...FILTRO_LISTADO_CARGAS_POR_DEFECTO };

  // Segundo punto de entrada a esta misma página: la tarjeta del tablero de seguimiento en
  // `/dashboard` enlaza aquí con `?origen=inicio` (`TarjetaSeguimientoVentana`), para que "volver"
  // regrese al inicio en vez de a la tabla de ventanas de carga, que es de donde entra la acción
  // "Detalle" de esa tabla.
  const vieneDeInicio = parametros.origen === "inicio";

  // RF-17: página actual de cada tabla del historial de alertas, tolerante ante un valor inválido
  // en la URL (mismo criterio que `filtro` arriba).
  const paginaAlertasAutomaticas = paginaAlertaVentanaCargaSchema.parse(parametros.paginaAutomatica);
  const paginaAlertasManuales = paginaAlertaVentanaCargaSchema.parse(parametros.paginaManual);

  return (
    <DetalleVentanaCarga
      ventana={ventana}
      rutaVolver={vieneDeInicio ? "/dashboard" : "/dashboard/ventanas-carga"}
      textoVolver={vieneDeInicio ? "← Inicio" : "← Ventanas de carga"}
      pagina={filtro.page}
      tamano={filtro.pageSize}
      construirHref={(pagina) =>
        construirRutaDetalleVentanaDashboard(id, pagina, vieneDeInicio ? "inicio" : undefined)
      }
      paginaAlertasAutomaticas={paginaAlertasAutomaticas}
      paginaAlertasManuales={paginaAlertasManuales}
    />
  );
}
