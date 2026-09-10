import type { Metadata } from "next";
import type { ReactNode } from "react";
import { cerrarSesionAction } from "./actions";
import { NavLateral } from "./nav-lateral";

export const metadata: Metadata = {
  title: "Dashboard administrador - Repositorio RPC - SEREMI de Salud Biobío",
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      {/* Cerrar sesión es una acción secundaria: rellenarla (antes bg-orange-600, además fuera
          de la paleta gob-*) la volvía el elemento más llamativo de la pantalla, compitiendo con
          la acción primaria de cada página. */}
      <header className="flex items-center justify-between gap-4 bg-gob-tertiary px-4 py-3 md:px-6">
        <div>
          <p className="text-sm font-semibold tracking-wide text-white">Repositorio RPC</p>
          <p className="text-xs text-gob-accent">SEREMI de Salud Biobío</p>
        </div>

        <form action={cerrarSesionAction}>
          <button
            type="submit"
            className="rounded-md border border-white/40 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-white/10 active:translate-y-[1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Cerrar sesión
          </button>
        </form>
      </header>

      {/* Bajo md el shell se apila: la navegación pasa a una barra horizontal sobre el contenido.
          Con la barra lateral fija, en 375px se comía más de la mitad del ancho y la vista de
          tarjetas de la tabla nunca llegaba a verse. Se prefiere una barra a un menú lateral
          desplegable: dos secciones no justifican el foco atrapado ni el JavaScript de un cajón. */}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="shrink-0 border-b border-gob-accent bg-white md:w-52 md:border-b-0 md:border-r">
          <NavLateral />
        </aside>

        <main className="min-w-0 flex-1 bg-gob-neutral p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
