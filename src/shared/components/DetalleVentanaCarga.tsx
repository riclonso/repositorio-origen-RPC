import Link from "next/link";
import { ViewTransition } from "react";
import type { VentanaCargaConEstado } from "@/modules/ventanas-carga/domain/entities/VentanaCarga";
import { formatearFechaCalendario } from "@/shared/utils/fecha";
import { ListadoCargasVentana } from "@/shared/components/ListadoCargasVentana";

type DetalleVentanaCargaProps = {
  ventana: VentanaCargaConEstado;
  rutaVolver: string;
  pagina: number;
  tamano: number;
  construirHref: (pagina: number) => string;
};

// Compartido entre `/dashboard/ventanas-carga/[id]` (ADMIN) y `/revisor/ventanas-carga/[id]`
// (REVISOR_REPOSITORIO): pantalla de solo lectura con las cargas ya APROBADAS de una ventana
// puntual. No se audita (una lectura, mismo criterio del resto del proyecto: solo se auditan
// escrituras y rechazos de negocio). Envuelto en `<ViewTransition>` porque es el contenido
// principal de cada `page.tsx` (no un layout, que persiste entre navegaciones y nunca dispara
// enter/exit).
export function DetalleVentanaCarga({
  ventana,
  rutaVolver,
  pagina,
  tamano,
  construirHref,
}: DetalleVentanaCargaProps) {
  return (
    <ViewTransition>
      <div className="flex flex-col gap-6">
        <div>
          <Link
            href={rutaVolver}
            className="text-sm font-medium text-gob-primary underline-offset-2 hover:underline"
          >
            ← Ventanas de carga
          </Link>
          <h1 className="mt-2 text-xl font-semibold text-gob-black">
            Cargas aprobadas — Ventana {ventana.anio}
          </h1>
          <p className="mt-2 text-sm text-gob-gray-a">
            Formato: {ventana.formatoExcelNombre} · Vigencia {formatearFechaCalendario(ventana.fechaApertura)} al{" "}
            {formatearFechaCalendario(ventana.fechaVencimiento)}
          </p>
        </div>

        <ListadoCargasVentana
          ventanaCargaId={ventana.id}
          pagina={pagina}
          tamano={tamano}
          construirHref={construirHref}
        />
      </div>
    </ViewTransition>
  );
}
