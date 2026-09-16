"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Buildings,
  CalendarBlank,
  CheckCircle,
  FileText,
  House,
  Table,
  Tag,
  Tray,
  UsersThree,
} from "@phosphor-icons/react";

export type EnlacePanel = {
  href: string;
  etiqueta: string;
};

type NavegacionPanelProps = {
  enlaces: readonly EnlacePanel[];
  titulo: string;
};

// Determina el enlace activo por "prefijo más largo": el enlace activo es aquel cuyo `href` es la
// coincidencia más específica con la ruta actual. Así el enlace raíz del área (p.ej. "/dashboard")
// solo queda activo en la ruta exacta y no cuando se visita una subsección ("/dashboard/usuarios"),
// sin necesidad de marcar manualmente cuál enlace es el índice.
function calcularHrefActivo(rutaActual: string, enlaces: readonly EnlacePanel[]): string | null {
  let hrefActivo: string | null = null;

  for (const enlace of enlaces) {
    const coincide =
      rutaActual === enlace.href || rutaActual.startsWith(`${enlace.href}/`);

    if (coincide && (hrefActivo === null || enlace.href.length > hrefActivo.length)) {
      hrefActivo = enlace.href;
    }
  }

  return hrefActivo;
}

// Navegación lateral común a los paneles. Recibe los enlaces y el título de la sección como datos,
// de modo que cada panel aporta los suyos sin duplicar el marcado ni la lógica de estado activo.
export function NavegacionPanel({ enlaces, titulo }: NavegacionPanelProps) {
  const rutaActual = usePathname();
  const hrefActivo = calcularHrefActivo(rutaActual, enlaces);
  const iconos = {
    Inicio: House,
    Panel: House,
    Usuarios: UsersThree,
    "Formatos de archivo": Table,
    "Ventanas de carga": CalendarBlank,
    "Cargas aprobadas": CheckCircle,
    "Mis cargas": Tray,
    Establecimientos: Buildings,
    "Tipos de establecimiento": Tag,
    Logs: FileText,
  } as const;

  return (
    <nav
      aria-label="Secciones del panel"
      className="flex flex-row gap-1 overflow-x-auto p-2 md:flex-col md:p-4"
    >
      {/* El encabezado de sección solo aporta en la columna lateral; en la barra horizontal
          robaría ancho a los propios enlaces. */}
      <p className="hidden px-3 pb-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#a8c1dc] md:block">
        {titulo}
      </p>
      {enlaces.map((enlace) => {
        const activo = enlace.href === hrefActivo;
        const Icono = iconos[enlace.etiqueta as keyof typeof iconos];

        return (
          <Link
            key={enlace.href}
            href={enlace.href}
            aria-current={activo ? "page" : undefined}
            /* El estado activo se marca con peso tipográfico y una barra lateral, no solo con
               color de fondo: el color no puede ser el único portador de la información. */
            className={`inline-flex whitespace-nowrap rounded-lg border-b-3 px-3 py-2.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white md:border-b-0 ${
              activo
                ? "border-transparent bg-white/15 font-semibold text-white"
                : "border-transparent font-medium text-[#c6d5e4] hover:bg-white/10 hover:text-white"
            }`}
          >
            {Icono ? <Icono size={19} weight={activo ? "fill" : "regular"} aria-hidden="true" className="mr-2 shrink-0" /> : null}
            {enlace.etiqueta}
          </Link>
        );
      })}
    </nav>
  );
}
