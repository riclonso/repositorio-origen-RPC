import type { Metadata } from "next";
import { PantallaEditarEstablecimiento } from "@/shared/components/PantallasEstablecimientos";
import { RUTA_ESTABLECIMIENTOS_REVISOR } from "@/shared/components/ruta-establecimientos";

export const metadata: Metadata = {
  title: "Editar establecimiento - Repositorio RPC - SEREMI de Salud Biobío",
};

type EditarEstablecimientoPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditarEstablecimientoRevisorPage({ params }: EditarEstablecimientoPageProps) {
  const { id } = await params;
  return <PantallaEditarEstablecimiento id={id} rutaBase={RUTA_ESTABLECIMIENTOS_REVISOR} />;
}