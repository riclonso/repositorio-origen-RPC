import type { Metadata } from "next";
import type { ReactNode } from "react";
import { EncabezadoPanel } from "@/shared/components/EncabezadoPanel";
import { NavegacionPanel } from "@/shared/components/NavegacionPanel";
import { obtenerIdentidadPanel } from "@/app/_lib/identidadPanel";
import { ENLACES_ADMIN } from "./nav-enlaces";

export const metadata: Metadata = {
  title: "Dashboard administrador - Repositorio RPC - SEREMI de Salud Biobío",
};

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const identidad = await obtenerIdentidadPanel();

  return (
    <div className="flex flex-1 flex-col">
      <EncabezadoPanel
        nombreCompleto={identidad ? `${identidad.nombres} ${identidad.apellidos}` : undefined}
        perfil={identidad?.perfilNombre}
      />

      {/* Bajo md el shell se apila: la navegación pasa a una barra horizontal sobre el contenido.
          Con la barra lateral fija, en 375px se comía más de la mitad del ancho y la vista de
          tarjetas de la tabla nunca llegaba a verse. Se prefiere una barra a un menú lateral
          desplegable: dos secciones no justifican el foco atrapado ni el JavaScript de un cajón. */}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="shrink-0 border-b border-gob-accent bg-white md:w-52 md:border-b-0 md:border-r">
          <NavegacionPanel enlaces={ENLACES_ADMIN} titulo="Administración" />
        </aside>

        <main className="min-w-0 flex-1 bg-gob-neutral p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
