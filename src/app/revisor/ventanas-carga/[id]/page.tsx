import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { obtenerVentanaCarga } from "@/modules/ventanas-carga/application/use-cases/ObtenerVentanaCarga";
import { prismaVentanaCargaRepository } from "@/modules/ventanas-carga/infrastructure/repositories/PrismaVentanaCargaRepository";
import {
  FILTRO_LISTADO_CARGAS_POR_DEFECTO,
  listadoCargasSchema,
} from "@/modules/reporte-excel/schemas/reporte-excel.schema";
import { DetalleVentanaCarga } from "@/shared/components/DetalleVentanaCarga";
import { construirRutaDetalleVentanaRevisor } from "./ruta-detalle";

export const metadata: Metadata = {
  title: "Detalle de ventana de carga - Repositorio RPC - SEREMI de Salud Biobío",
};

type DetalleVentanaCargaRevisorPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// Solo lectura. No se audita el acceso (es una lectura, no una escritura ni un rechazo de
// negocio), mismo criterio ya documentado para `/dashboard/cargas/[id]`.
export default async function DetalleVentanaCargaRevisorPage({
  params,
  searchParams,
}: DetalleVentanaCargaRevisorPageProps) {
  const [{ id }, parametros] = await Promise.all([params, searchParams]);

  const ventana = await obtenerVentanaCarga(id, { repositorio: prismaVentanaCargaRepository });

  if (!ventana) {
    notFound();
  }

  // Modo tolerante: una URL editada a mano cae a la página 1 en vez de romper la pantalla.
  const analisis = listadoCargasSchema.safeParse(parametros);
  const filtro = analisis.success ? analisis.data : { ...FILTRO_LISTADO_CARGAS_POR_DEFECTO };

  return (
    <DetalleVentanaCarga
      ventana={ventana}
      rutaVolver="/revisor/ventanas-carga"
      pagina={filtro.page}
      tamano={filtro.pageSize}
      construirHref={(pagina) => construirRutaDetalleVentanaRevisor(id, pagina)}
    />
  );
}
