import type { Metadata } from "next";
import { PantallaEditarTipoEstablecimiento } from "@/shared/components/PantallasTiposEstablecimiento";
import { RUTA_TIPOS_ESTABLECIMIENTO_REVISOR } from "@/shared/components/ruta-establecimientos";

export const metadata: Metadata = {
  title: "Editar tipo de establecimiento - Repositorio RPC - SEREMI de Salud Biobío",
};

type EditarTipoPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditarTipoRevisorPage({ params }: EditarTipoPageProps) {
  const { id } = await params;
  return <PantallaEditarTipoEstablecimiento id={id} rutaBase={RUTA_TIPOS_ESTABLECIMIENTO_REVISOR} />;
}