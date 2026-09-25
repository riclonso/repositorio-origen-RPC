"use client";

import { useState, ViewTransition } from "react";
import Link from "next/link";
import type {
  CargaArchivoResumen,
  ErrorCargaArchivo,
} from "@/modules/reporte-excel/domain/entities/CargaArchivo";
import type { EstadoSolicitudReemplazoCarga } from "@/modules/solicitudes-reemplazo/domain/entities/SolicitudReemplazoCarga";
import { LONGITUD_MAXIMA_MOTIVO } from "@/modules/solicitudes-reemplazo/domain/entities/SolicitudReemplazoCarga";
import { BadgeEstadoCarga } from "@/shared/components/BadgeEstadoCarga";
import { Boton } from "@/shared/components/Boton";
import { DialogoConfirmacion } from "@/shared/components/DialogoConfirmacion";
import { ResumenErroresCarga } from "@/shared/components/ResumenErroresCarga";
import { IconoAprobado, IconoDescargar, IconoSubir } from "@/shared/components/iconos";
import { formatearFechaHora } from "@/shared/utils/fecha";

// Vista liviana de las cargas propias del notificador: mismos campos que `CargaArchivoResumenDTO`,
// con las fechas ya como texto (llegan así tanto desde el servidor -prop inicial- como desde
// `fetch` -tras subir o dar visto bueno-). Este panel ya no renderiza su propia tabla con todas las
// cargas (se movió a "Mis cargas" en el menú lateral, `/notificador/cargas`); aquí solo se deriva de
// ella el historial de intentos fallidos por tarjeta y qué combinaciones ya tienen una carga
// aprobada vigente.
export type CargaResumenVista = Omit<CargaArchivoResumen, "createdAt" | "vistoBuenoEn" | "finalizadaEn"> & {
  createdAt: string;
  vistoBuenoEn: string | null;
  finalizadaEn: string | null;
};

// Vista del resultado de una subida recién hecha: incluye el detalle de errores.
type CargaDetalleVista = CargaResumenVista & { errores: ErrorCargaArchivo[] };

// Vista liviana de una solicitud de reemplazo propia, mismos campos que
// `SolicitudReemplazoPropiaDTO` que necesita este panel para decidir el estado de cada
// combinación: sin `vencida` recalculado en el cliente, se usa el que ya resolvió el servidor.
export type SolicitudReemplazoPropiaVista = {
  id: string;
  cargaArchivoId: string;
  estado: EstadoSolicitudReemplazoCarga;
  vencida: boolean;
};

// RF-15 (ampliación): una combinación (formato asignado, ventana disponible) cuyo tipo de archivo
// coincide, resuelta en el Server Component (`app/notificador/page.tsx`). Reemplaza a los dos
// `<select>` de formato y año: cada combinación se muestra como su propia sección.
export type CombinacionCargaVista = {
  formatoExcelId: string;
  formatoNombre: string;
  anio: number;
  ventanaCargaId: string;
};

const MENSAJE_ERROR_GENERICO = "No se pudo completar la operación. Intenta nuevamente.";

function formatearFechaHoraIso(iso: string): string {
  return formatearFechaHora(new Date(iso));
}

async function obtenerMisCargas(): Promise<CargaResumenVista[] | null> {
  const respuesta = await fetch("/api/notificador/cargas");
  if (!respuesta.ok) return null;
  const datos = (await respuesta.json()) as { datos: CargaResumenVista[] };
  return datos.datos;
}

async function obtenerMisSolicitudes(): Promise<SolicitudReemplazoPropiaVista[] | null> {
  const respuesta = await fetch("/api/notificador/solicitudes-reemplazo");
  if (!respuesta.ok) return null;
  const datos = (await respuesta.json()) as { datos: SolicitudReemplazoPropiaVista[] };
  return datos.datos;
}

function claveCombinacion(combinacion: CombinacionCargaVista): string {
  return `${combinacion.formatoExcelId}::${combinacion.ventanaCargaId}`;
}

// La carga vigente de una combinación (formato, ventana) es su APROBADA más reciente por
// `vistoBuenoEn`, mismo criterio que `agruparCargasAprobadasPorVentana` del servidor: un
// notificador puede tener varias cargas APROBADA sucesivas en la misma ventana.
function cargaAprobadaVigente(cargas: CargaResumenVista[], ventanaCargaId: string): CargaResumenVista | null {
  const aprobadas = cargas.filter((carga) => carga.ventanaCargaId === ventanaCargaId && carga.estado === "APROBADA");
  if (aprobadas.length === 0) return null;

  return aprobadas.reduce((vigente, actual) => {
    if (!vigente.vistoBuenoEn) return actual;
    if (!actual.vistoBuenoEn) return vigente;
    return actual.vistoBuenoEn > vigente.vistoBuenoEn ? actual : vigente;
  });
}

// Corrección (fin de la autoaprobación): una combinación (formato, ventana) con una carga
// `PENDIENTE_VISTO_BUENO` que el notificador ya finalizó y envió, y que todavía nadie decidió
// (aprobó o rechazó). Mientras exista, su tarjeta se oculta por completo: no admite una subida
// nueva ni tiene más acciones para el notificador (ver `PanelCargaArchivo`).
function cargaPendienteFinalizada(cargas: CargaResumenVista[], ventanaCargaId: string): CargaResumenVista | null {
  return (
    cargas.find(
      (carga) =>
        carga.ventanaCargaId === ventanaCargaId &&
        carga.estado === "PENDIENTE_VISTO_BUENO" &&
        carga.finalizadaEn !== null,
    ) ?? null
  );
}

// Historial persistente de intentos fallidos (`CON_ERRORES`) de una combinación (formato,
// ventana) puntual, derivado de `misCargas` (ya cargada en este panel) sin ninguna consulta nueva.
// Distinta del histórico de "Mis cargas" (`/notificador/cargas`, solo `APROBADA`): esta vive
// anidada bajo cada `TarjetaCargaArchivo` y solo muestra los intentos fallidos de ESA combinación.
function TablaIntentosFallidos({ intentos }: { intentos: CargaResumenVista[] }) {
  if (intentos.length === 0) return null;

  return (
    <div className="mt-4 flex flex-col gap-2 border-t border-gob-accent pt-4">
      <h4 className="text-sm font-semibold text-gob-black">Intentos fallidos</h4>
      <div className="overflow-x-auto rounded-lg border border-gob-accent bg-white">
        <table className="w-full min-w-xl border-collapse text-left text-sm">
          <caption className="sr-only">Intentos fallidos de esta combinación de formato y ventana</caption>
          <thead className="bg-gob-neutral text-xs uppercase tracking-wide text-gob-gray-a">
            <tr>
              <th scope="col" className="px-3 py-3 font-semibold">Archivo</th>
              <th scope="col" className="px-3 py-3 font-semibold">Subido el</th>
              <th scope="col" className="px-3 py-3 font-semibold">Errores</th>
              <th scope="col" className="whitespace-nowrap px-3 py-3 text-right font-semibold">
                Detalle
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gob-accent/60">
            {intentos.map((intento) => (
              <tr key={intento.id} className="align-middle transition-colors hover:bg-gob-neutral/50">
                <th scope="row" className="min-w-40 break-all px-3 py-2 font-medium text-gob-black">
                  {intento.nombreArchivoOriginal}
                </th>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums text-gob-gray-a">
                  {formatearFechaHoraIso(intento.createdAt)}
                </td>
                <td className="px-3 py-2 tabular-nums text-gob-danger">{intento.cantidadErrores}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  <ViewTransition>
                    <Link
                      href={`/notificador/intentos/${intento.id}`}
                      className="text-sm font-medium text-gob-primary underline-offset-2 hover:underline"
                    >
                      Ver detalle
                    </Link>
                  </ViewTransition>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type FormularioSolicitarReemplazoProps = {
  cargaArchivoId: string;
  onExito: () => void;
};

// Formulario de solicitud de reemplazo (estado "b" de la tarjeta, ver `TarjetaCargaArchivo`):
// motivo obligatorio, loading "Cargando la información" al guardar (ver diseño del RF), sin
// componente de loading nuevo (reutiliza `Boton.cargando`/`textoCargando`).
function FormularioSolicitarReemplazo({ cargaArchivoId, onExito }: FormularioSolicitarReemplazoProps) {
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviada, setEnviada] = useState(false);

  async function enviarSolicitud() {
    if (motivo.trim().length === 0) return;

    setEnviando(true);
    setError(null);

    try {
      const respuesta = await fetch("/api/notificador/solicitudes-reemplazo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cargaArchivoId, motivo: motivo.trim() }),
      });

      if (!respuesta.ok) {
        const datos = await respuesta.json().catch(() => null);
        setError(datos?.error ?? MENSAJE_ERROR_GENERICO);
        return;
      }

      setEnviada(true);
      onExito();
    } catch {
      setError(MENSAJE_ERROR_GENERICO);
    } finally {
      setEnviando(false);
    }
  }

  if (enviada) {
    return (
      <p role="status" className="mt-4 text-sm font-medium text-gob-primary">
        Solicitud enviada. Un administrador o el revisor del repositorio debe aprobarla antes de que puedas subir el
        archivo de reemplazo.
      </p>
    );
  }

  const idMotivo = `motivo-reemplazo-${cargaArchivoId}`;

  return (
    <div className="mt-4 flex flex-col gap-3 border-t border-gob-accent pt-4 sm:max-w-md">
      <div className="flex flex-col gap-2">
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
          placeholder="Explica por qué necesitas reemplazar esta carga ya aprobada"
          className="w-full rounded-md border border-gob-accent bg-white px-3 py-2 text-sm text-gob-black outline-none placeholder:text-gob-gray-b focus:border-gob-primary focus:ring-2 focus:ring-gob-primary/30 disabled:bg-gob-neutral"
        />
      </div>

      {error ? (
        <p role="alert" className="text-sm font-medium text-gob-danger">
          {error}
        </p>
      ) : null}

      <Boton
        onClick={() => void enviarSolicitud()}
        disabled={motivo.trim().length === 0}
        cargando={enviando}
        textoCargando="Cargando la información..."
        className="w-fit"
      >
        Solicitar reemplazo
      </Boton>
    </div>
  );
}

type TarjetaCargaArchivoProps = {
  combinacion: CombinacionCargaVista;
  resultado: CargaDetalleVista | null;
  intentosFallidos: CargaResumenVista[];
  // `null` cuando la combinación nunca tuvo una carga aprobada. Cuando no es `null`, la tarjeta
  // muestra la subida normal solo si `reemplazoHabilitado` es `true` (autorización de reemplazo
  // vigente); si no, la tarjeta reducida con el formulario de solicitud.
  cargaAprobada: CargaResumenVista | null;
  reemplazoHabilitado: boolean;
  solicitudPendiente: boolean;
  onSubidaExitosa: (clave: string, carga: CargaDetalleVista) => void;
  onFinalizarYEnviar: (carga: CargaResumenVista) => void;
  onSolicitudReemplazoEnviada: () => void;
  onLimpiar?: () => void;
};

// Una tarjeta por combinación (formato, ventana), cada una con su propio estado de
// archivo/subida/error: subir un archivo para una combinación no interfiere con las demás.
function TarjetaCargaArchivo({
  combinacion,
  resultado,
  intentosFallidos,
  cargaAprobada,
  reemplazoHabilitado,
  solicitudPendiente,
  onSubidaExitosa,
  onFinalizarYEnviar,
  onSolicitudReemplazoEnviada,
  onLimpiar,
}: TarjetaCargaArchivoProps) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [errorSubida, setErrorSubida] = useState<string | null>(null);

  const idBase = `carga-${claveCombinacion(combinacion)}`;
  const idTitulo = `${idBase}-titulo`;
  const idArchivo = `${idBase}-archivo`;

  // Estado "b": ya existe una carga aprobada para esta combinación y no hay ninguna autorización
  // de reemplazo vigente. La tarjeta se reduce: no se ofrece subir un archivo nuevo.
  const requiereSolicitudDeReemplazo = cargaAprobada !== null && !reemplazoHabilitado;

  async function subirArchivo() {
    if (!archivo) return;

    setSubiendo(true);
    setErrorSubida(null);

    try {
      const formData = new FormData();
      formData.set("formatoExcelId", combinacion.formatoExcelId);
      formData.set("anio", combinacion.anio.toString());
      formData.set("archivo", archivo);

      const respuesta = await fetch("/api/notificador/cargas", { method: "POST", body: formData });

      if (!respuesta.ok) {
        const datos = await respuesta.json().catch(() => null);
        setErrorSubida(datos?.error ?? MENSAJE_ERROR_GENERICO);
        return;
      }

      const datos = (await respuesta.json()) as { carga: CargaDetalleVista };
      setArchivo(null);
      onSubidaExitosa(claveCombinacion(combinacion), datos.carga);
    } catch {
      setErrorSubida(MENSAJE_ERROR_GENERICO);
    } finally {
      setSubiendo(false);
    }
  }

  if (requiereSolicitudDeReemplazo && cargaAprobada) {
    return (
      <section aria-labelledby={idTitulo} className="rounded-lg border border-gob-accent bg-white p-6">
        <h3 id={idTitulo} className="text-base font-semibold text-gob-tertiary">
          {combinacion.formatoNombre} · {combinacion.anio}
        </h3>

        <p className="mt-2 text-sm text-gob-gray-a">
          Ya existe una carga aprobada para esta combinación: <strong>{cargaAprobada.nombreArchivoOriginal}</strong>.
          Si necesitas corregirla, solicita su reemplazo. Un administrador o el revisor del repositorio debe
          aprobarlo antes de que puedas subir el archivo nuevo.
        </p>

        {solicitudPendiente ? (
          <p role="status" className="mt-4 text-sm font-medium text-gob-tertiary">
            Ya enviaste una solicitud de reemplazo para esta carga. Está pendiente de revisión.
          </p>
        ) : (
          <FormularioSolicitarReemplazo cargaArchivoId={cargaAprobada.id} onExito={onSolicitudReemplazoEnviada} />
        )}
      </section>
    );
  }

  return (
    <section aria-labelledby={idTitulo} className="rounded-lg border border-gob-accent bg-white p-6">
      <h3 id={idTitulo} className="text-base font-semibold text-gob-tertiary">
        {combinacion.formatoNombre} · {combinacion.anio}
      </h3>

      <a
        href={`/api/formatos-excel/${combinacion.formatoExcelId}/plantilla`}
        className="mt-3 inline-flex w-fit items-center gap-2 rounded-md border border-gob-primary px-3 py-2 text-sm font-semibold text-gob-primary transition-colors hover:bg-gob-neutral active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary"
      >
        <IconoDescargar className="shrink-0" />
        Descargar plantilla
      </a>

      {reemplazoHabilitado && cargaAprobada ? (
        <p className="mt-2 text-sm font-medium text-gob-primary">
          Tu solicitud de reemplazo fue aprobada: puedes subir el archivo que reemplazará a{" "}
          <strong>{cargaAprobada.nombreArchivoOriginal}</strong>.
        </p>
      ) : null}

      <div className="mt-4 flex flex-col gap-4 sm:max-w-md">
        <div className="flex flex-col gap-2">
          <label htmlFor={idArchivo} className="text-sm font-medium text-gob-black">
            Archivo (.xlsx o .csv, máximo 10 MB)
          </label>
          <input
            id={idArchivo}
            type="file"
            accept=".xlsx,.csv"
            disabled={subiendo}
            onChange={(evento) => setArchivo(evento.target.files?.[0] ?? null)}
            className="w-full rounded-md border border-gob-accent bg-white px-3 py-2 text-sm text-gob-black outline-none focus:border-gob-primary focus:ring-2 focus:ring-gob-primary/30 disabled:bg-gob-neutral"
          />
        </div>

        {errorSubida ? (
          <p role="alert" className="text-sm font-medium text-gob-danger">
            {errorSubida}
          </p>
        ) : null}

        <Boton
          onClick={() => void subirArchivo()}
          disabled={!archivo}
          cargando={subiendo}
          textoCargando="Subiendo y validando..."
          className="w-fit"
        >
          <IconoSubir className="shrink-0" />
          Subir archivo
        </Boton>
      </div>

      {resultado ? (
        <div className="mt-4 flex flex-col gap-3 border-t border-gob-accent pt-4">
          {resultado.cantidadErrores === 0 ? (
            <>
              <p className="text-sm font-medium text-gob-success">
                 {resultado.cantidadFilasDatos} filas de datos validadas
              </p>
              {resultado.finalizadaEn ? (
                <p role="status" className="text-sm font-medium text-gob-tertiary">
                  Pendiente de aprobación.
                </p>
              ) : null}
            </>
          ) : (
            <>
              <p className="text-sm text-gob-gray-a">
                <BadgeEstadoCarga estado={resultado.estado} /> · {resultado.cantidadFilasDatos} filas de datos,{" "}
                {resultado.cantidadErrores} {resultado.cantidadErrores === 1 ? "error" : "errores"}
              </p>
              <ResumenErroresCarga errores={resultado.errores} />
            </>
          )}

          {resultado.estado === "PENDIENTE_VISTO_BUENO" && !resultado.finalizadaEn ? (
            <div className="flex flex-wrap gap-3">
              <Boton variante="primario" className="w-fit" onClick={() => onFinalizarYEnviar(resultado)}>
                <IconoAprobado className="shrink-0" />
                Finalizar y enviar
              </Boton>
              {onLimpiar && (
                <Boton
                  variante="secundario"
                  className="w-fit"
                  onClick={() => {
                    setArchivo(null);
                    setErrorSubida(null);
                    onLimpiar();
                  }}
                >
                  Cancelar y limpiar
                </Boton>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      <TablaIntentosFallidos intentos={intentosFallidos} />
    </section>
  );
}

type PanelCargaArchivoProps = {
  // Combinaciones (formato asignado, ventana disponible y publicada) con tipo de archivo
  // coincidente, resueltas en el Server Component. Sin ninguna, se muestra un único mensaje
  // genérico, sin distinguir si la causa es "sin formato asignado", "sin ventana" o "no publicada".
  combinaciones: CombinacionCargaVista[];
  // Se obtienen en el Server Component (`app/notificador/page.tsx`): evita un `fetch` disparado
  // desde un efecto solo para la carga inicial. El widget vuelve a pedirlas desde los propios
  // manejadores de evento (tras subir un archivo, dar visto bueno o solicitar un reemplazo), nunca
  // desde un efecto.
  cargasIniciales: CargaResumenVista[];
  solicitudesIniciales: SolicitudReemplazoPropiaVista[];
};

export function PanelCargaArchivo({ combinaciones, cargasIniciales, solicitudesIniciales }: PanelCargaArchivoProps) {
  // Resultado de la última subida por combinación, indexado por clave: cada tarjeta solo ve el
  // suyo. Vive aquí (no dentro de cada tarjeta) porque `confirmarVistoBueno` necesita poder
  // actualizar el estado de la combinación correspondiente tras dar visto bueno.
  const [resultados, setResultados] = useState<Record<string, CargaDetalleVista>>({});

  // Ya no alimenta ninguna tabla propia de este panel (esa vista vive en "Mis cargas",
  // `/notificador/cargas`): se mantiene para derivar `TablaIntentosFallidos` (estado
  // `CON_ERRORES`) y la carga aprobada vigente de cada combinación.
  const [misCargas, setMisCargas] = useState<CargaResumenVista[]>(cargasIniciales);
  const [misSolicitudes, setMisSolicitudes] = useState<SolicitudReemplazoPropiaVista[]>(solicitudesIniciales);

  const [objetivoFinalizar, setObjetivoFinalizar] = useState<CargaResumenVista | null>(null);
  const [procesandoFinalizar, setProcesandoFinalizar] = useState(false);
  const [errorFinalizar, setErrorFinalizar] = useState<string | null>(null);

  function registrarResultado(clave: string, carga: CargaDetalleVista) {
    setResultados((actual) => ({ ...actual, [clave]: carga }));
    void obtenerMisCargas().then((actualizadas) => {
      if (actualizadas) setMisCargas(actualizadas);
    });
  }

  function limpiarResultado(clave: string) {
    setResultados((actual) => {
      const { [clave]: _, ...rest } = actual;
      return rest;
    });
  }

  function refrescarSolicitudes() {
    void obtenerMisSolicitudes().then((actualizadas) => {
      if (actualizadas) setMisSolicitudes(actualizadas);
    });
  }

  async function confirmarFinalizacion() {
    if (!objetivoFinalizar) return;

    setProcesandoFinalizar(true);
    setErrorFinalizar(null);

    try {
      const respuesta = await fetch(`/api/notificador/cargas/${objetivoFinalizar.id}/finalizar`, {
        method: "POST",
      });

      if (!respuesta.ok) {
        const datos = await respuesta.json().catch(() => null);
        setErrorFinalizar(datos?.error ?? MENSAJE_ERROR_GENERICO);
        setProcesandoFinalizar(false);
        return;
      }

      const datos = (await respuesta.json()) as { carga: CargaDetalleVista };

      // La tarjeta de esta combinación desaparece por completo en cuanto `misCargas` refleje
      // `finalizadaEn` no nulo (ver `cargaPendienteFinalizada`); no hace falta actualizar
      // `resultados` de forma optimista.
      setResultados((actual) => {
        const entrada = Object.entries(actual).find(([, carga]) => carga.id === objetivoFinalizar.id);
        if (!entrada) return actual;

        const [clave, carga] = entrada;
        return { ...actual, [clave]: { ...carga, finalizadaEn: datos.carga.finalizadaEn } };
      });

      setProcesandoFinalizar(false);
      setObjetivoFinalizar(null);

      const actualizadas = await obtenerMisCargas();
      if (actualizadas) setMisCargas(actualizadas);
      refrescarSolicitudes();
    } catch {
      setErrorFinalizar(MENSAJE_ERROR_GENERICO);
      setProcesandoFinalizar(false);
    }
  }

  // Combinaciones con una carga finalizada y todavía sin decidir se ocultan por completo: no
  // admiten subida nueva ni tienen más acciones para el notificador.
  const combinacionesVisibles = combinaciones.filter(
    (combinacion) => cargaPendienteFinalizada(misCargas, combinacion.ventanaCargaId) === null,
  );

  return (
    <div className="flex flex-col gap-6">
      {combinacionesVisibles.length === 0 ? (
        <section
          aria-labelledby="titulo-reporte"
          className="rounded-lg border border-dashed border-gob-accent bg-white p-6"
        >
          <h2 id="titulo-reporte" className="text-base font-semibold text-gob-tertiary">
            Reporte de datos (Excel/CSV)
          </h2>
          <p className="mt-2 text-sm text-gob-gray-a">
            No tienes ningún reporte disponible para subir en este momento. Contacta a un
            administrador o al revisor del repositorio si crees que esto es un error.
          </p>
        </section>
      ) : (
        combinacionesVisibles.map((combinacion) => {
          const cargaAprobada = cargaAprobadaVigente(misCargas, combinacion.ventanaCargaId);
          const solicitudDeEstaCarga = cargaAprobada
            ? misSolicitudes.find((solicitud) => solicitud.cargaArchivoId === cargaAprobada.id)
            : undefined;
          const reemplazoHabilitado =
            solicitudDeEstaCarga?.estado === "APROBADA" && !solicitudDeEstaCarga.vencida;
          const solicitudPendiente = solicitudDeEstaCarga?.estado === "PENDIENTE";

          const claveTarjeta = claveCombinacion(combinacion);
          return (
            <TarjetaCargaArchivo
              key={claveTarjeta}
              combinacion={combinacion}
              resultado={resultados[claveTarjeta] ?? null}
              intentosFallidos={misCargas.filter(
                (carga) => carga.ventanaCargaId === combinacion.ventanaCargaId && carga.estado === "CON_ERRORES",
              )}
              cargaAprobada={cargaAprobada}
              reemplazoHabilitado={reemplazoHabilitado}
              solicitudPendiente={solicitudPendiente}
              onSubidaExitosa={registrarResultado}
              onFinalizarYEnviar={setObjetivoFinalizar}
              onSolicitudReemplazoEnviada={refrescarSolicitudes}
              onLimpiar={() => limpiarResultado(claveTarjeta)}
            />
          );
        })
      )}

      <DialogoConfirmacion
        abierto={objetivoFinalizar !== null}
        titulo="Finalizar y enviar"
        descripcion={
          objetivoFinalizar
            ? `"${objetivoFinalizar.nombreArchivoOriginal}" quedará enviado a decisión de un administrador o el revisor del repositorio, quien deberá aprobarlo o rechazarlo. Esta acción no se puede deshacer.`
            : ""
        }
        textoConfirmar="Finalizar y enviar"
        textoConfirmando="Guardando..."
        variante="primario"
        procesando={procesandoFinalizar}
        error={errorFinalizar}
        onConfirmar={() => void confirmarFinalizacion()}
        onCancelar={() => {
          if (procesandoFinalizar) return;
          setObjetivoFinalizar(null);
          setErrorFinalizar(null);
        }}
      />
    </div>
  );
}
