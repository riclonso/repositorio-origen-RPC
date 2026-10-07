"use client";

import { useRouter } from "next/navigation";
import { FormularioSolicitudReemplazo } from "@/shared/components/FormularioSolicitudReemplazo";
import type { AccionReemplazoHistorial } from "@/modules/bioestadistica/application/use-cases/ListarHistorialBioestadistica";
import {
  DESCRIPCION_SOLICITUD_REEMPLAZO_BIOESTADISTICA,
  PLACEHOLDER_MOTIVO_REEMPLAZO_BIOESTADISTICA,
} from "../textos-solicitud-reemplazo";

// Archivo de una fila del historial, con las fechas ya formateadas en el servidor.
export type ArchivoHistorialVista = {
  id: string;
  nombreArchivoOriginal: string;
  subidoElTexto: string;
  cantidadFilasDatos: number;
  tamanoTexto: string;
  desactivadoElTexto: string | null;
};

export type GrupoHistorialVista = {
  clave: string;
  anio: number;
  etiquetaTipo: string;
  vigente: ArchivoHistorialVista | null;
  reemplazados: ArchivoHistorialVista[];
  accionReemplazo: AccionReemplazoHistorial["tipo"];
};

const RUTA_DESCARGA = "/api/bioestadistica/cargas";

function EnlaceDescarga({ archivo }: { archivo: ArchivoHistorialVista }) {
  return (
    <a
      href={`${RUTA_DESCARGA}/${archivo.id}/archivo`}
      aria-label={`Descargar ${archivo.nombreArchivoOriginal}`}
      className="text-sm font-medium text-gob-primary underline-offset-2 hover:underline"
    >
      Descargar
    </a>
  );
}

// RF-37: columna "Reemplazo" del archivo vigente. "Solicitar reemplazo" se ofrece también con el
// año cerrado por fecha; el archivo de reemplazo se sube desde Inicio una vez aprobada.
function CeldaReemplazo({ grupo }: { grupo: GrupoHistorialVista }) {
  const router = useRouter();
  const vigente = grupo.vigente;

  if (!vigente) return <span className="text-xs text-gob-gray-a">—</span>;

  switch (grupo.accionReemplazo) {
    case "SOLICITAR":
      return (
        <FormularioSolicitudReemplazo
          rutaApi="/api/bioestadistica/solicitudes-reemplazo"
          cuerpo={{ cargaBioestadisticaId: vigente.id }}
          idBase={vigente.id}
          placeholderMotivo={PLACEHOLDER_MOTIVO_REEMPLAZO_BIOESTADISTICA}
          descripcion={DESCRIPCION_SOLICITUD_REEMPLAZO_BIOESTADISTICA}
          varianteBoton="texto"
          etiquetaAccesible={`Solicitar reemplazo de ${vigente.nombreArchivoOriginal}`}
          onExito={() => router.refresh()}
        />
      );
    case "SOLICITUD_PENDIENTE":
      return (
        <span className="w-fit rounded-full border border-gob-primary bg-white px-2 py-0.5 text-xs font-semibold text-gob-primary">
          Solicitud pendiente
        </span>
      );
    case "REEMPLAZO_AUTORIZADO":
      return (
        <span className="text-xs text-gob-gray-a">
          <span className="block w-fit rounded-full border border-gob-success bg-white px-2 py-0.5 font-semibold text-gob-success">
            Reemplazo autorizado
          </span>
          <span className="mt-1 block">Súbelo desde Inicio.</span>
        </span>
      );
    default:
      return <span className="text-xs text-gob-gray-a">—</span>;
  }
}

function ArchivosReemplazados({ grupo }: { grupo: GrupoHistorialVista }) {
  if (grupo.reemplazados.length === 0) return null;

  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-xs font-semibold text-gob-primary">
        Archivos reemplazados ({grupo.reemplazados.length})
      </summary>
      <ul className="mt-2 flex flex-col gap-2">
        {grupo.reemplazados.map((archivo) => (
          <li key={archivo.id} className="rounded-md border border-gob-accent bg-gob-neutral/40 px-3 py-2 text-xs text-gob-gray-a">
            <span className="block break-all font-medium text-gob-black">{archivo.nombreArchivoOriginal}</span>
            <span className="block tabular-nums">
              Subido el {archivo.subidoElTexto} · reemplazado el {archivo.desactivadoElTexto ?? "—"} ·{" "}
              {archivo.cantidadFilasDatos.toLocaleString("es-CL")} filas
            </span>
            <EnlaceDescarga archivo={archivo} />
          </li>
        ))}
      </ul>
    </details>
  );
}

const COLUMNAS = ["Archivo", "Tipo", "Año", "Subido el", "Filas", "Reemplazo"] as const;

// RF-37: "Mis archivos" por año y tipo: el vigente en la fila y los reemplazados anidados, cada uno
// con su descarga. Única escritura: "Solicitar reemplazo" del vigente.
export function TablaHistorialBioestadistica({ grupos }: { grupos: GrupoHistorialVista[] }) {
  return (
    <div className="mt-6 overflow-x-auto rounded-lg border border-gob-accent bg-white">
      <table className="w-full min-w-3xl border-collapse text-left text-sm">
        <caption className="sr-only">Archivos de Bioestadística reportados por año</caption>
        <thead className="bg-gob-neutral text-xs uppercase tracking-wide text-gob-gray-a">
          <tr>
            {COLUMNAS.map((columna) => (
              <th key={columna} scope="col" className="px-3 py-3 font-semibold">
                {columna}
              </th>
            ))}
            <th scope="col" className="whitespace-nowrap px-3 py-3 text-right font-semibold">
              Descarga
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gob-accent/60">
          {grupos.map((grupo) => (
            <tr key={grupo.clave} className="align-top transition-colors hover:bg-gob-neutral/50">
              <th scope="row" className="min-w-48 px-3 py-2 font-medium text-gob-black">
                <span className="break-all">{grupo.vigente?.nombreArchivoOriginal ?? "Sin archivo vigente"}</span>
                <ArchivosReemplazados grupo={grupo} />
              </th>
              <td className="px-3 py-2 text-gob-gray-a">{grupo.etiquetaTipo}</td>
              <td className="px-3 py-2 tabular-nums text-gob-gray-a">{grupo.anio}</td>
              <td className="whitespace-nowrap px-3 py-2 tabular-nums text-gob-gray-a">
                {grupo.vigente?.subidoElTexto ?? "—"}
              </td>
              <td className="px-3 py-2 tabular-nums text-gob-gray-a">
                {grupo.vigente ? grupo.vigente.cantidadFilasDatos.toLocaleString("es-CL") : "—"}
                {grupo.vigente ? <span className="block text-xs">{grupo.vigente.tamanoTexto}</span> : null}
              </td>
              <td className="px-3 py-2">
                <CeldaReemplazo grupo={grupo} />
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right">
                {grupo.vigente ? <EnlaceDescarga archivo={grupo.vigente} /> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
