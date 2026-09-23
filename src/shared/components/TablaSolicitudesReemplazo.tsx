"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { EstadoSolicitudReemplazoCarga } from "@/modules/solicitudes-reemplazo/domain/entities/SolicitudReemplazoCarga";
import { Boton } from "@/shared/components/Boton";
import { DialogoConfirmacion } from "@/shared/components/DialogoConfirmacion";
import { TablaPanel, type ColumnaTabla } from "@/shared/components/TablaPanel";

// Vista de una solicitud para la bandeja de revisión (`/dashboard/solicitudes`,
// `/revisor/solicitudes`), ya con las fechas formateadas y `vencida` resuelto en el servidor
// (mismo criterio que el resto del panel: nunca calcular vigencia en el cliente).
export type FilaSolicitudReemplazoVista = {
  id: string;
  formatoExcelNombre: string;
  anio: number;
  nombreArchivoOriginal: string;
  solicitadoPorNombre: string;
  solicitadoPorRut: string;
  motivo: string;
  estado: EstadoSolicitudReemplazoCarga;
  revisadoPorNombre: string | null;
  revisadoEnTexto: string | null;
  comentarioRevision: string | null;
  vencida: boolean;
  creadaElTexto: string;
};

const MENSAJE_ERROR_GENERICO = "No se pudo completar la operación. Intenta nuevamente.";

const ETIQUETAS_ESTADO: Record<EstadoSolicitudReemplazoCarga, string> = {
  PENDIENTE: "Pendiente",
  APROBADA: "Aprobada",
  RECHAZADA: "Rechazada",
};

const CLASES_ESTADO: Record<EstadoSolicitudReemplazoCarga, string> = {
  PENDIENTE: "border-gob-tertiary text-gob-tertiary",
  APROBADA: "border-gob-primary text-gob-primary",
  RECHAZADA: "border-gob-danger text-gob-danger",
};

function BadgeEstado({ estado, vencida }: { estado: EstadoSolicitudReemplazoCarga; vencida: boolean }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <span
        className={`inline-flex items-center rounded-full border bg-white px-2 py-0.5 text-xs font-semibold ${CLASES_ESTADO[estado]}`}
      >
        {ETIQUETAS_ESTADO[estado]}
      </span>
      {vencida ? (
        <span className="inline-flex items-center rounded-full border border-gob-gray-b bg-white px-2 py-0.5 text-xs font-semibold text-gob-gray-a">
          Vencida
        </span>
      ) : null}
    </span>
  );
}

type AccionesFilaProps = {
  fila: FilaSolicitudReemplazoVista;
  onAprobar: () => void;
  onRechazar: () => void;
};

function AccionesFila({ fila, onAprobar, onRechazar }: AccionesFilaProps) {
  if (fila.estado !== "PENDIENTE") {
    return (
      <span className="text-sm text-gob-gray-a">
        {fila.revisadoPorNombre ? `Por ${fila.revisadoPorNombre}` : "—"}
      </span>
    );
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <Boton variante="secundario" onClick={onRechazar}>
        Rechazar
      </Boton>
      <Boton variante="primario" onClick={onAprobar}>
        Aprobar
      </Boton>
    </div>
  );
}

const COLUMNAS: ColumnaTabla<FilaSolicitudReemplazoVista>[] = [
  {
    encabezado: "Formato / Año",
    encabezadoFila: true,
    className: "min-w-40 px-3 py-2 font-medium text-gob-black",
    contenido: (fila) => (
      <>
        {fila.formatoExcelNombre} · {fila.anio}
        <span className="block break-all text-xs font-normal text-gob-gray-a">{fila.nombreArchivoOriginal}</span>
      </>
    ),
  },
  {
    encabezado: "Solicitado por",
    className: "px-3 py-2 text-gob-gray-a",
    contenido: (fila) => (
      <>
        {fila.solicitadoPorNombre}
        <span className="block text-xs tabular-nums text-gob-gray-b">{fila.solicitadoPorRut}</span>
      </>
    ),
  },
  {
    encabezado: "Motivo",
    className: "min-w-48 px-3 py-2 text-gob-gray-a",
    contenido: (fila) => fila.motivo,
  },
  {
    encabezado: "Estado",
    className: "whitespace-nowrap px-3 py-2",
    contenido: (fila) => <BadgeEstado estado={fila.estado} vencida={fila.vencida} />,
  },
  {
    encabezado: "Solicitada el",
    className: "whitespace-nowrap px-3 py-2 tabular-nums text-gob-gray-a",
    contenido: (fila) => fila.creadaElTexto,
  },
];

type TablaSolicitudesReemplazoProps = {
  filas: FilaSolicitudReemplazoVista[];
  rutaApiRevision: string;
};

export function TablaSolicitudesReemplazo({ filas, rutaApiRevision }: TablaSolicitudesReemplazoProps) {
  const router = useRouter();
  const [objetivo, setObjetivo] = useState<{ fila: FilaSolicitudReemplazoVista; decision: "APROBAR" | "RECHAZAR" } | null>(
    null,
  );
  const [comentario, setComentario] = useState("");
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function cerrarDialogo() {
    if (procesando) return;
    setObjetivo(null);
    setComentario("");
    setError(null);
  }

  async function confirmarRevision() {
    if (!objetivo) return;

    setProcesando(true);
    setError(null);

    try {
      const respuesta = await fetch(`${rutaApiRevision}/${objetivo.fila.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: objetivo.decision, comentario: comentario.trim() || undefined }),
      });

      if (!respuesta.ok) {
        const datos = await respuesta.json().catch(() => null);
        setProcesando(false);
        setError(datos?.error ?? MENSAJE_ERROR_GENERICO);
        return;
      }

      setProcesando(false);
      setObjetivo(null);
      setComentario("");
      router.refresh();
    } catch {
      setProcesando(false);
      setError(MENSAJE_ERROR_GENERICO);
    }
  }

  return (
    <>
      <TablaPanel
        descripcion="Solicitudes de reemplazo de cargas ya aprobadas"
        columnas={COLUMNAS}
        filas={filas}
        claveFila={(fila) => fila.id}
        anchoMinimo="min-w-4xl"
        acciones={(fila) => (
          <AccionesFila
            fila={fila}
            onAprobar={() => setObjetivo({ fila, decision: "APROBAR" })}
            onRechazar={() => setObjetivo({ fila, decision: "RECHAZAR" })}
          />
        )}
        tarjeta={(fila) => (
          <>
            <p className="font-semibold text-gob-black">
              {fila.formatoExcelNombre} · {fila.anio}
            </p>
            <p className="break-all">{fila.nombreArchivoOriginal}</p>
            <p className="mt-1">
              {fila.solicitadoPorNombre} <span className="tabular-nums">({fila.solicitadoPorRut})</span>
            </p>
            <p className="mt-1">{fila.motivo}</p>
            <p className="mt-2">
              <BadgeEstado estado={fila.estado} vencida={fila.vencida} />
            </p>
            <p className="mt-1 tabular-nums">Solicitada el {fila.creadaElTexto}</p>
            <div className="mt-3">
              <AccionesFila
                fila={fila}
                onAprobar={() => setObjetivo({ fila, decision: "APROBAR" })}
                onRechazar={() => setObjetivo({ fila, decision: "RECHAZAR" })}
              />
            </div>
          </>
        )}
      />

      <DialogoConfirmacion
        abierto={objetivo !== null}
        titulo={objetivo?.decision === "APROBAR" ? "Aprobar solicitud de reemplazo" : "Rechazar solicitud de reemplazo"}
        descripcion={
          objetivo
            ? objetivo.decision === "APROBAR"
              ? `${objetivo.fila.solicitadoPorNombre} podrá volver a subir un archivo para "${objetivo.fila.formatoExcelNombre} · ${objetivo.fila.anio}". Puedes agregar un comentario opcional.`
              : `${objetivo.fila.solicitadoPorNombre} no podrá reemplazar esta carga. Puedes agregar un comentario opcional con el motivo.`
            : ""
        }
        textoConfirmar={objetivo?.decision === "APROBAR" ? "Aprobar" : "Rechazar"}
        textoConfirmando="Cargando la información..."
        variante={objetivo?.decision === "APROBAR" ? "primario" : "peligro"}
        procesando={procesando}
        error={error}
        onConfirmar={() => void confirmarRevision()}
        onCancelar={cerrarDialogo}
      >
        <div className="mt-4 flex flex-col gap-2">
          <label htmlFor="comentario-revision" className="text-sm font-medium text-gob-black">
            Comentario (opcional)
          </label>
          <textarea
            id="comentario-revision"
            value={comentario}
            onChange={(evento) => setComentario(evento.target.value)}
            disabled={procesando}
            maxLength={500}
            rows={3}
            className="w-full rounded-md border border-gob-accent bg-white px-3 py-2 text-sm text-gob-black outline-none placeholder:text-gob-gray-b focus:border-gob-primary focus:ring-2 focus:ring-gob-primary/30 disabled:bg-gob-neutral"
          />
        </div>
      </DialogoConfirmacion>
    </>
  );
}
