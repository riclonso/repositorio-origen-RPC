import type { Metadata } from "next";
import { PantallaNuevoTipoEstablecimiento } from "@/shared/components/PantallasTiposEstablecimiento";
import { RUTA_TIPOS_ESTABLECIMIENTO_REVISOR } from "@/shared/components/ruta-establecimientos";

export const metadata: Metadata = {
  title: "Nuevo tipo de establecimiento - Repositorio RPC - SEREMI de Salud Biobío",
};

export default function NuevoTipoRevisorPage() {
  return <PantallaNuevoTipoEstablecimiento rutaBase={RUTA_TIPOS_ESTABLECIMIENTO_REVISOR} />;
}