import type { Metadata } from "next";
import { PantallaListadoTiposEstablecimiento } from "@/shared/components/PantallasTiposEstablecimiento";
import { RUTA_TIPOS_ESTABLECIMIENTO_REVISOR } from "@/shared/components/ruta-establecimientos";

export const metadata: Metadata = {
  title: "Tipos de establecimiento - Repositorio RPC - SEREMI de Salud Biobío",
};

type TiposPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TiposEstablecimientoRevisorPage({ searchParams }: TiposPageProps) {
  const parametros = await searchParams;
  return <PantallaListadoTiposEstablecimiento parametros={parametros} rutaBase={RUTA_TIPOS_ESTABLECIMIENTO_REVISOR} />;
}