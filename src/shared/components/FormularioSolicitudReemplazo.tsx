"use client";

import { useState } from "react";
import { Boton, type VarianteBoton } from "@/shared/components/Boton";
import { DialogoConfirmacion } from "@/shared/components/DialogoConfirmacion";
import { LONGITUD_MAXIMA_MOTIVO } from "@/modules/solicitudes-reemplazo/domain/entities/SolicitudReemplazoCarga";

const MENSAJE_ERROR_GENERICO = "No se pudo completar la operación. Intenta nuevamente.";

const DESCRIPCION_POR_DEFECTO =
  "Explique por qué necesita cambiar el archivo enviado. Cuando se apruebe su solicitud, podrá subir un archivo nuevo, aunque la ventana ya haya vencido.";

type FormularioSolicitudReemplazoProps = {
  // Endpoint POST que crea la solicitud (`/api/notificador/solicitudes-reemplazo`; en RF-37, el de
  // Bioestadística). El servidor revalida todo: este formulario solo junta el motivo.
  rutaApi: string;
  // Campos que identifican qué se quiere reemplazar (p. ej. `{ cargaArchivoId }`), enviados junto
  // al motivo. Nunca se confía en ellos en el servidor (ownership en el `WHERE`).
  cuerpo: Readonly<Record<string, string>>;
  // Base única para los `id` del formulario: puede haber varios en la misma página.
  idBase: string;
  // Lo fija el llamador porque el texto varía según el origen (ya aprobada vs. pendiente de
  // decisión): un mismo placeholder para ambos sería incorrecto.
  placeholderMotivo: string;
  descripcion?: string;
  // Variante del botón que abre el diálogo: `texto` dentro de una fila de tabla.
  varianteBoton?: VarianteBoton;
  // Nombre accesible del botón cuando el texto visible no basta (varios en una misma tabla).
  etiquetaAccesible?: string;
  onExito: () => void;
};

// Solicitud de reemplazo con motivo obligatorio, en un diálogo de confirmación. Extraída del panel
// del notificador (RF-36) para reutilizarla en "Mis cargas" y en el área de Bioestadística (RF-37).
// Loading "Cargando la información" al guardar (reutiliza `Boton.cargando`/`textoCargando` vía el
// diálogo). Tras el éxito queda un aviso en lugar del botón, para no ofrecer una solicitud duplicada.
export function FormularioSolicitudReemplazo({
  rutaApi,
  cuerpo,
  idBase,
  placeholderMotivo,
  descripcion = DESCRIPCION_POR_DEFECTO,
  varianteBoton = "primario",
  etiquetaAccesible,
  onExito,
}: FormularioSolicitudReemplazoProps) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviada, setEnviada] = useState(false);

  async function enviarSolicitud() {
    if (motivo.trim().length === 0) return;

    setEnviando(true);
    setError(null);

    try {
      const respuesta = await fetch(rutaApi, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...cuerpo, motivo: motivo.trim() }),
      });

      if (!respuesta.ok) {
        const datos = await respuesta.json().catch(() => null);
        setError(datos?.error ?? MENSAJE_ERROR_GENERICO);
        return;
      }

      setEnviada(true);
      setAbierto(false);
      onExito();
    } catch {
      setError(MENSAJE_ERROR_GENERICO);
    } finally {
      setEnviando(false);
    }
  }

  if (enviada) {
    return (
      <p role="status" className="text-sm font-medium text-gob-primary">
        Solicitud enviada. Un administrador o el revisor del repositorio debe aprobarla antes de que puedas subir el
        archivo de reemplazo.
      </p>
    );
  }

  function cerrarDialogo() {
    if (enviando) return;
    setAbierto(false);
    setError(null);
  }

  const idMotivo = `motivo-reemplazo-${idBase}`;

  return (
    <>
      <Boton variante={varianteBoton} onClick={() => setAbierto(true)} aria-label={etiquetaAccesible} className="w-fit">
        Solicitar reemplazo
      </Boton>
      <DialogoConfirmacion
        abierto={abierto}
        titulo="Solicitar reemplazo"
        descripcion={descripcion}
        textoConfirmar="Enviar solicitud"
        textoConfirmando="Cargando la información..."
        procesando={enviando}
        confirmarDeshabilitado={motivo.trim().length === 0}
        error={error}
        onConfirmar={() => void enviarSolicitud()}
        onCancelar={cerrarDialogo}
      >
        <div className="mt-4 flex flex-col gap-2">
          <label htmlFor={idMotivo} className="text-sm font-medium text-gob-black">
            Motivo del reemplazo
          </label>
          <textarea
            id={idMotivo}
            value={motivo}
            onChange={(evento) => setMotivo(evento.target.value)}
            disabled={enviando}
            maxLength={LONGITUD_MAXIMA_MOTIVO}
            rows={3}
            required
            placeholder={placeholderMotivo}
            className="w-full rounded-md border border-gob-accent bg-white px-3 py-2 text-sm text-gob-black outline-none placeholder:text-gob-gray-b focus:border-gob-primary focus:ring-2 focus:ring-gob-primary/30 disabled:bg-gob-neutral"
          />
          <p className="text-right text-xs tabular-nums text-gob-gray-a">
            {motivo.length}/{LONGITUD_MAXIMA_MOTIVO}
          </p>
        </div>
      </DialogoConfirmacion>
    </>
  );
}
