import { IconoDescargar } from "@/shared/components/iconos";
import { TablaPanel, type ColumnaTabla } from "@/shared/components/TablaPanel";

// Vista de un archivo de Bioestadística para el listado administrativo (ADMIN y
// REVISOR_REPOSITORIO), con los textos ya formateados en el servidor.
export type FilaCargaBioestadisticaVista = {
  id: string;
  usuarioNombre: string;
  usuarioRut: string;
  establecimientoNombre: string;
  etiquetaTipo: string;
  vigente: boolean;
  nombreArchivoOriginal: string;
  subidoElTexto: string;
  cantidadFilasDatos: number;
  tamanoTexto: string;
};

const RUTA_DESCARGA = "/api/dashboard/bioestadistica/cargas";

function BadgeEstado({ vigente }: { vigente: boolean }) {
  return vigente ? (
    <span className="inline-flex rounded-full border border-gob-success bg-white px-2 py-0.5 text-xs font-semibold text-gob-success">
      Vigente
    </span>
  ) : (
    <span className="inline-flex rounded-full border border-gob-gray-b bg-white px-2 py-0.5 text-xs font-semibold text-gob-gray-a">
      Reemplazada
    </span>
  );
}

function EnlaceDescarga({ fila }: { fila: FilaCargaBioestadisticaVista }) {
  return (
    <a
      href={`${RUTA_DESCARGA}/${fila.id}/archivo`}
      aria-label={`Descargar ${fila.nombreArchivoOriginal}`}
      className="inline-flex items-center gap-1 text-sm font-medium text-gob-primary underline-offset-2 hover:underline"
    >
      <IconoDescargar className="shrink-0" />
      Descargar
    </a>
  );
}

const COLUMNAS: ColumnaTabla<FilaCargaBioestadisticaVista>[] = [
  {
    encabezado: "Usuario",
    encabezadoFila: true,
    className: "min-w-44 px-3 py-2 font-medium text-gob-black",
    contenido: (fila) => (
      <>
        {fila.usuarioNombre}
        <span className="block text-xs font-normal tabular-nums text-gob-gray-a">{fila.usuarioRut}</span>
      </>
    ),
  },
  { encabezado: "Establecimiento", className: "min-w-40 px-3 py-2 text-gob-gray-a", contenido: (fila) => fila.establecimientoNombre },
  {
    encabezado: "Archivo",
    className: "min-w-48 px-3 py-2 text-gob-gray-a",
    contenido: (fila) => (
      <>
        <span className="font-medium text-gob-black">{fila.etiquetaTipo}</span>
        <span className="block break-all text-xs">{fila.nombreArchivoOriginal}</span>
      </>
    ),
  },
  { encabezado: "Estado", className: "whitespace-nowrap px-3 py-2", contenido: (fila) => <BadgeEstado vigente={fila.vigente} /> },
  { encabezado: "Subido el", className: "whitespace-nowrap px-3 py-2 tabular-nums text-gob-gray-a", contenido: (fila) => fila.subidoElTexto },
  {
    encabezado: "Filas",
    className: "whitespace-nowrap px-3 py-2 tabular-nums text-gob-gray-a",
    contenido: (fila) => fila.cantidadFilasDatos.toLocaleString("es-CL"),
  },
  { encabezado: "Tamaño", className: "whitespace-nowrap px-3 py-2 tabular-nums text-gob-gray-a", contenido: (fila) => fila.tamanoTexto },
];

// RF-37: tabla del listado administrativo de archivos de Bioestadística. Sin interactividad de
// cliente (la descarga es un enlace a la API, que vuelve a exigir ADMIN o REVISOR_REPOSITORIO).
export function TablaCargasBioestadistica({ filas }: { filas: FilaCargaBioestadisticaVista[] }) {
  return (
    <TablaPanel
      descripcion="Archivos de Bioestadística del año seleccionado"
      columnas={COLUMNAS}
      filas={filas}
      claveFila={(fila) => fila.id}
      anchoMinimo="min-w-5xl"
      acciones={(fila) => <EnlaceDescarga fila={fila} />}
      tarjeta={(fila) => (
        <>
          <p className="font-semibold text-gob-black">
            {fila.etiquetaTipo} · {fila.usuarioNombre}
          </p>
          <p className="text-xs tabular-nums">{fila.usuarioRut}</p>
          <p className="mt-1">{fila.establecimientoNombre}</p>
          <p className="mt-1 break-all">{fila.nombreArchivoOriginal}</p>
          <p className="mt-2">
            <BadgeEstado vigente={fila.vigente} />
          </p>
          <p className="mt-1 tabular-nums">
            {fila.subidoElTexto} · {fila.cantidadFilasDatos.toLocaleString("es-CL")} filas · {fila.tamanoTexto}
          </p>
          <div className="mt-3">
            <EnlaceDescarga fila={fila} />
          </div>
        </>
      )}
    />
  );
}
