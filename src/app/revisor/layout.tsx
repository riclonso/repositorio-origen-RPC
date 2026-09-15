import type { Metadata } from "next";
import type { ReactNode } from "react";
import { EncabezadoPanel } from "@/shared/components/EncabezadoPanel";
import { NavegacionPanel } from "@/shared/components/NavegacionPanel";
import { ENLACES_REVISOR } from "./nav-enlaces";

export const metadata: Metadata = {
  title: "Panel revisor - Repositorio RPC - SEREMI de Salud Biobío",
};

export default function RevisorLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <EncabezadoPanel />

      {/* Mismo patrón de shell que `/dashboard` y `/notificador`: encabezado arriba, navegación
          lateral (barra horizontal bajo md) y contenido. */}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="shrink-0 border-b border-gob-accent bg-white md:w-52 md:border-b-0 md:border-r">
          <NavegacionPanel enlaces={ENLACES_REVISOR} titulo="Revisión" />
        </aside>

        <main className="min-w-0 flex-1 bg-gob-neutral p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
