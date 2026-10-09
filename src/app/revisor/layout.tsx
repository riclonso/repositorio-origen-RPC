import { obtenerSesionActual } from "@/modules/auth/infrastructure/auth/SesionActual";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { EncabezadoPanel } from "@/shared/components/EncabezadoPanel";
import { BarraLateralPanel } from "@/shared/components/BarraLateralPanel";
import { obtenerIdentidadPanel } from "@/app/_lib/identidadPanel";
import { contarSolicitudesReemplazoPendientes } from "@/modules/solicitudes-reemplazo/application/use-cases/ContarSolicitudesReemplazoPendientes";
import { prismaSolicitudReemplazoCargaRepository } from "@/modules/solicitudes-reemplazo/infrastructure/repositories/PrismaSolicitudReemplazoCargaRepository";
import { listarNotificacionesRevision } from "@/modules/notificaciones/application/ListarNotificacionesRevision";
import { prismaNotificacionRevisionRepository } from "@/modules/notificaciones/infrastructure/PrismaNotificacionRevisionRepository";
import { ENLACES_REVISOR } from "./nav-enlaces";

export const metadata: Metadata = {
  title: "Panel revisor - Repositorio RPC - SEREMI de Salud Biobío",
};

export default async function RevisorLayout({ children }: { children: ReactNode }) {
  const sesion = await obtenerSesionActual();
  if (!sesion) redirect("/login");
  const [identidad, solicitudesPendientes, bandejaNotificaciones] = await Promise.all([
    obtenerIdentidadPanel(),
    contarSolicitudesReemplazoPendientes({ repositorio: prismaSolicitudReemplazoCargaRepository }),
    listarNotificacionesRevision(1, sesion.sub, prismaNotificacionRevisionRepository),
  ]);

  const enlaces = ENLACES_REVISOR.map((enlace) =>
    enlace.etiqueta === "Solicitudes" ? { ...enlace, contador: solicitudesPendientes } : enlace,
  );

  return (
    <div className="grid h-dvh grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden bg-[#3f84d8] md:grid-cols-[15rem_minmax(0,1fr)] md:grid-rows-[auto_minmax(0,1fr)]">
      <div className="md:col-start-2 md:row-start-1">
        <EncabezadoPanel rutaBase="/revisor" bandejaNotificaciones={bandejaNotificaciones} />
      </div>
      {/* Mismo shell que `/dashboard` y `/notificador`: la navegación es la primera columna en
          escritorio para llegar al borde superior, y bajo md vuelve a ser una barra horizontal bajo
          el encabezado sin restar ancho al contenido. */}
      <aside className="flex min-h-0 shrink-0 flex-col border-b border-[#3f84d8] bg-[#3f84d8] md:col-start-1 md:row-span-2 md:row-start-1 md:border-b-0 md:border-r">
        <BarraLateralPanel
          enlaces={enlaces}
          titulo="Revisión"
          nombreCompleto={identidad ? `${identidad.nombres} ${identidad.apellidos}` : undefined}
          perfil={identidad?.perfilNombre}
        />
      </aside>
      {/* `relative`: sin esto, un descendiente `position: absolute` (p.ej. `<caption class="sr-only">`
          de cualquier tabla) toma como contenedor el `<body>` en vez de este `<main>` que scrollea,
          y su posición estática se calcula con el layout sin scrollear — inflando la altura del
          documento y dejando un espacio en blanco al hacer scroll de la ventana del navegador. */}
      <main className="relative min-h-0 min-w-0 overflow-y-auto bg-[#f4f7fb] p-4 md:col-start-2 md:row-start-2 md:rounded-tl-3xl md:p-7">{children}</main>
    </div>
  );
}
