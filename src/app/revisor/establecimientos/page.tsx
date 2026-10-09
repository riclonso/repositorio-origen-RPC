import type { Metadata } from "next";
import { PantallaListadoEstablecimientos } from "@/shared/components/PantallasEstablecimientos";
import { RUTA_ESTABLECIMIENTOS_REVISOR } from "@/shared/components/ruta-establecimientos";

export const metadata: Metadata = {
  title: "Establecimientos - Repositorio RPC - SEREMI de Salud Biobío",
};

type EstablecimientosPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function EstablecimientosRevisorPage({ searchParams }: EstablecimientosPageProps) {
  const parametros = await searchParams;
  return <PantallaListadoEstablecimientos parametros={parametros} rutaBase={RUTA_ESTABLECIMIENTOS_REVISOR} />;
}