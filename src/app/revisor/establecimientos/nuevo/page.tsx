import type { Metadata } from "next";
import { PantallaNuevoEstablecimiento } from "@/shared/components/PantallasEstablecimientos";
import { RUTA_ESTABLECIMIENTOS_REVISOR } from "@/shared/components/ruta-establecimientos";

export const metadata: Metadata = {
  title: "Nuevo establecimiento - Repositorio RPC - SEREMI de Salud Biobío",
};

export default function NuevoEstablecimientoRevisorPage() {
  return <PantallaNuevoEstablecimiento rutaBase={RUTA_ESTABLECIMIENTOS_REVISOR} />;
}