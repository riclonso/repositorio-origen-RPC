import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { obtenerCargaAprobada } from "@/modules/reporte-excel/application/use-cases/ObtenerCargaAprobada";
import { prismaCargaArchivoRepository } from "@/modules/reporte-excel/infrastructure/repositories/PrismaCargaArchivoRepository";
import { DetalleCargaAprobada } from "@/shared/components/DetalleCargaAprobada";

export const metadata: Metadata = {
  title: "Detalle de carga - Repositorio RPC - SEREMI de Salud Biobío",
};

type DetalleCargaDashboardPageProps = { params: Promise<{ id: string }> };

// Solo lectura. Si la carga no existe o todavía no fue aprobada por su notificador, es
// indistinguible de inexistente para este perfil.
export default async function DetalleCargaDashboardPage({ params }: DetalleCargaDashboardPageProps) {
  const { id } = await params;
  const carga = await obtenerCargaAprobada(id, { repositorio: prismaCargaArchivoRepository });

  if (!carga) {
    notFound();
  }

  return <DetalleCargaAprobada carga={carga} />;
}
