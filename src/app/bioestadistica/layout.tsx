import type { Metadata } from "next";
import type { ReactNode } from "react";
import { EncabezadoPanel } from "@/shared/components/EncabezadoPanel";
import { BarraLateralPanel } from "@/shared/components/BarraLateralPanel";
import { obtenerIdentidadPanel } from "@/app/_lib/identidadPanel";
import { ENLACES_BIOESTADISTICA } from "./nav-enlaces";

export const metadata: Metadata = {
  title: "Panel Bioestadística - Repositorio RPC - SEREMI de Salud Biobío",
};

// RF-37: área del perfil Bioestadística. Protegida por `src/proxy.ts` con chequeo positivo
// (`esPerfilBioestadistica`); mismo shell que las demás áreas.
export default async function BioestadisticaLayout({ children }: { children: ReactNode }) {
  const identidad = await obtenerIdentidadPanel();

  return (
    <div className="grid h-dvh grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden bg-[#5b4f8f] md:grid-cols-[15rem_minmax(0,1fr)] md:grid-rows-[auto_minmax(0,1fr)]">
      <div className="md:col-start-2 md:row-start-1">
        <EncabezadoPanel rutaBase="/bioestadistica" />
      </div>
      <aside className="flex min-h-0 shrink-0 flex-col border-b border-[#5b4f8f] bg-[#5b4f8f] md:col-start-1 md:row-span-2 md:row-start-1 md:border-b-0 md:border-r">
        <BarraLateralPanel
          enlaces={ENLACES_BIOESTADISTICA}
          titulo="Bioestadística"
          nombreCompleto={identidad ? `${identidad.nombres} ${identidad.apellidos}` : undefined}
          perfil={identidad?.perfilNombre}
        />
      </aside>
      {/* `relative`: mismo motivo que en los demás layouts (un `<caption class="sr-only">` toma
          este `<main>` como contenedor y no el `<body>`). */}
      <main className="relative min-h-0 min-w-0 overflow-y-auto bg-[#f4f7fb] p-4 md:col-start-2 md:row-start-2 md:rounded-tl-3xl md:p-7">{children}</main>
    </div>
  );
}
