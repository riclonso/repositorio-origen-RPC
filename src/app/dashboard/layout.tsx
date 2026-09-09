import type { Metadata } from "next";
import type { ReactNode } from "react";
import { cerrarSesionAction } from "./actions";

export const metadata: Metadata = {
  title: "Dashboard administrador — Intranet SEREMI de Salud Biobío",
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between bg-gob-tertiary px-6 py-4">
        <p className="text-sm font-medium tracking-wide text-white">Gobierno de Chile</p>

        <form action={cerrarSesionAction}>
          <button
            type="submit"
            className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-gray-100 transition-colors hover:bg-orange-700"
          >
            Cerrar sesión
          </button>
        </form>
      </header>

      <div className="flex flex-1">
        <aside className="w-64 shrink-0 border-r border-gob-accent bg-white">
          <nav className="flex flex-col p-4">
            <span className="rounded-md px-3 py-2 text-sm font-medium text-gob-gray-a">Encabezado</span>
          </nav>
        </aside>

        <main className="flex-1 bg-gob-neutral p-8">{children}</main>
      </div>
    </div>
  );
}
