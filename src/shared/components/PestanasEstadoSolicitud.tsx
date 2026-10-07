import Link from "next/link";
import type { EstadoSolicitudReemplazoCarga } from "@/modules/solicitudes-reemplazo/domain/entities/SolicitudReemplazoCarga";

const PESTANAS: { estado: EstadoSolicitudReemplazoCarga; etiqueta: string }[] = [
  { estado: "PENDIENTE", etiqueta: "Pendientes" },
  { estado: "APROBADA", etiqueta: "Aprobadas" },
  { estado: "RECHAZADA", etiqueta: "Rechazadas" },
];

// Filtro por estado de una bandeja de solicitudes de reemplazo (como enlaces, sin JavaScript).
// Extraído de `ListadoSolicitudesReemplazo` (RF-37) para compartirlo con la bandeja de
// Bioestadística.
export function PestanasEstadoSolicitud({
  estadoActivo,
  construirHref,
}: {
  estadoActivo: EstadoSolicitudReemplazoCarga;
  construirHref: (pagina: number, estado?: EstadoSolicitudReemplazoCarga) => string;
}) {
  return (
    <nav aria-label="Filtrar por estado" className="mt-4 flex flex-wrap gap-2">
      {PESTANAS.map((pestana) => {
        const activa = pestana.estado === estadoActivo;
        return (
          <Link
            key={pestana.estado}
            href={construirHref(1, pestana.estado)}
            aria-current={activa ? "page" : undefined}
            className={`inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              activa
                ? "border-gob-primary bg-gob-primary text-white"
                : "border-gob-accent bg-white text-gob-gray-a hover:bg-gob-neutral"
            }`}
          >
            {pestana.etiqueta}
          </Link>
        );
      })}
    </nav>
  );
}
