"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ENLACES = [
  { href: "/dashboard", etiqueta: "Panel" },
  { href: "/dashboard/usuarios", etiqueta: "Usuarios" },
] as const;

function esActivo(rutaActual: string, href: string): boolean {
  return href === "/dashboard" ? rutaActual === href : rutaActual.startsWith(href);
}

export function NavLateral() {
  const rutaActual = usePathname();

  return (
    <nav
      aria-label="Secciones del panel"
      className="flex flex-row gap-1 overflow-x-auto p-2 md:flex-col md:p-4"
    >
      {/* El encabezado de sección solo aporta en la columna lateral; en la barra horizontal
          robaría ancho a los propios enlaces. */}
      <p className="hidden px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-gob-gray-a md:block">
        Administración
      </p>
      {ENLACES.map((enlace) => {
        const activo = esActivo(rutaActual, enlace.href);

        return (
          <Link
            key={enlace.href}
            href={enlace.href}
            aria-current={activo ? "page" : undefined}
            /* El estado activo se marca con peso tipográfico y una barra lateral, no solo con
               color de fondo: el color no puede ser el único portador de la información. */
            className={`whitespace-nowrap rounded-md border-b-3 px-3 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary md:border-b-0 md:border-l-3 ${
              activo
                ? "border-gob-primary bg-gob-neutral font-semibold text-gob-tertiary"
                : "border-transparent font-medium text-gob-gray-a hover:bg-gob-neutral"
            }`}
          >
            {enlace.etiqueta}
          </Link>
        );
      })}
    </nav>
  );
}
