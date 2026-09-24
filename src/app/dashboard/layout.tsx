import type { Metadata } from "next";
import type { ReactNode } from "react";
import { EncabezadoPanel } from "@/shared/components/EncabezadoPanel";
import { BarraLateralPanel } from "@/shared/components/BarraLateralPanel";
import { obtenerIdentidadPanel } from "@/app/_lib/identidadPanel";
import { contarSolicitudesReemplazoPendientes } from "@/modules/solicitudes-reemplazo/application/use-cases/ContarSolicitudesReemplazoPendientes";
import { prismaSolicitudReemplazoCargaRepository } from "@/modules/solicitudes-reemplazo/infrastructure/repositories/PrismaSolicitudReemplazoCargaRepository";
import { ENLACES_ADMIN } from "./nav-enlaces";

export const metadata: Metadata = {
  title: "Dashboard administrador - Repositorio RPC - SEREMI de Salud Biobío",
};

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const [identidad, solicitudesPendientes] = await Promise.all([
    obtenerIdentidadPanel(),
    contarSolicitudesReemplazoPendientes({ repositorio: prismaSolicitudReemplazoCargaRepository }),
  ]);

  const enlaces = ENLACES_ADMIN.map((enlace) =>
    enlace.etiqueta === "Solicitudes" ? { ...enlace, contador: solicitudesPendientes } : enlace,
  );

  return (
    <div className="grid h-dvh grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden bg-[#edf3f8] md:grid-cols-[15rem_minmax(0,1fr)] md:grid-rows-[auto_minmax(0,1fr)]">
      <div className="md:col-start-2 md:row-start-1">
        <EncabezadoPanel rutaBase="/dashboard" />
      </div>
      {/* En escritorio la navegación es la primera columna para que llegue al borde superior,
          como el shell analítico de referencia. Bajo md vuelve a ser una barra horizontal bajo
          el encabezado y no resta ancho al contenido. */}
      <aside className="flex min-h-0 shrink-0 flex-col border-b border-[#244d7d] bg-[#173b69] md:col-start-1 md:row-span-2 md:row-start-1 md:border-b-0 md:border-r">
        <BarraLateralPanel
          enlaces={enlaces}
          titulo="Administración"
          nombreCompleto={identidad ? `${identidad.nombres} ${identidad.apellidos}` : undefined}
          perfil={identidad?.perfilNombre}
        />
      </aside>
      {/* `relative`: sin esto, un descendiente `position: absolute` (p.ej. `<caption class="sr-only">`
          de cualquier tabla) toma como contenedor el `<body>` en vez de este `<main>` que scrollea,
          y su posición estática se calcula con el layout sin scrollear — inflando la altura del
          documento y dejando un espacio en blanco al hacer scroll de la ventana del navegador. */}
      <main className="relative min-h-0 min-w-0 overflow-y-auto bg-[#f4f7fb] p-4 md:col-start-2 md:row-start-2 md:p-7">{children}</main>
    </div>
  );
}
