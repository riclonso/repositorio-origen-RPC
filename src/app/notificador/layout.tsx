import type { Metadata } from "next";
import type { ReactNode } from "react";
import { EncabezadoPanel } from "@/shared/components/EncabezadoPanel";
import { NavegacionPanel } from "@/shared/components/NavegacionPanel";
import { ENLACES_NOTIFICADOR } from "./nav-enlaces";

export const metadata: Metadata = {
  title: "Panel notificador - Repositorio RPC - SEREMI de Salud Biobío",
};

export default function NotificadorLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <EncabezadoPanel />

      {/* Mismo patrón de shell que el panel de administración: encabezado arriba, navegación
          lateral (barra horizontal bajo md) y contenido. */}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="shrink-0 border-b border-gob-accent bg-white md:w-52 md:border-b-0 md:border-r">
          <NavegacionPanel enlaces={ENLACES_NOTIFICADOR} titulo="Notificación" />
        </aside>

        <main className="min-w-0 flex-1 bg-gob-neutral p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
