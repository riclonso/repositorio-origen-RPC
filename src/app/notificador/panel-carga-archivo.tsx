"use client";

import { useState, ViewTransition } from "react";
import Link from "next/link";
import type {
  CargaArchivoResumen,
  ErrorCargaArchivo,
  EstadoCargaArchivo,
} from "@/modules/reporte-excel/domain/entities/CargaArchivo";
import { Boton } from "@/shared/components/Boton";
import { DialogoConfirmacion } from "@/shared/components/DialogoConfirmacion";
import { ResumenErroresCarga } from "@/shared/components/ResumenErroresCarga";
import { IconoAprobado, IconoSubir } from "@/shared/components/iconos";
import { ETIQUETAS_ESTADO } from "@/shared/utils/estadoCargaArchivo";
import { formatearFechaHora } from "@/shared/utils/fecha";

// Vista liviana de las cargas propias del notificador: mismos campos que `CargaArchivoResumenDTO`,
// con las fechas ya como texto (llegan así tanto desde el servidor -prop inicial- como desde
// `fetch` -tras subir o dar visto bueno-). Este panel ya no renderiza su propia tabla con todas las
// cargas (se movió a "Mis cargas" en el menú lateral, `/notificador/cargas`); aquí solo se deriva de
// ella el historial de intentos fallidos por tarjeta y qué combinaciones ocultar por ya aprobadas.
export type CargaResumenVista = Omit<CargaArchivoResumen, "createdAt" | "vistoBuenoEn"> & {
  createdAt: string;
  vistoBuenoEn: string | null;
};

// Vista del resultado de una subida recién hecha: incluye el detalle de errores.
type CargaDetalleVista = CargaResumenVista & { errores: ErrorCargaArchivo[] };

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

const CLASES_ESTADO: Record<EstadoCargaArchivo, string> = {
  CON_ERRORES: "border-gob-danger text-gob-danger",
  PENDIENTE_VISTO_BUENO: "border-gob-tertiary text-gob-tertiary",
  APROBADA: "border-gob-primary text-gob-primary",
};

function BadgeEstado({ estado }: { estado: EstadoCargaArchivo }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border bg-white px-2 py-0.5 text-xs font-semibold ${CLASES_ESTADO[estado]}`}
    >
      {ETIQUETAS_ESTADO[estado]}
    </span>
  );
}

function formatearFechaHoraIso(iso: string): string {
  return formatearFechaHora(new Date(iso));
}

async function obtenerMisCargas(): Promise<CargaResumenVista[] | null> {
  const respuesta = await fetch("/api/notificador/cargas");
  if (!respuesta.ok) return null;
  const datos = (await respuesta.json()) as { datos: CargaResumenVista[] };
  return datos.datos;
}

function claveCombinacion(combinacion: CombinacionCargaVista): string {
  return `${combinacion.formatoExcelId}::${combinacion.ventanaCargaId}`;
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
                      href={`/notificador/cargas/${intento.id}`}
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

type TarjetaCargaArchivoProps = {
  combinacion: CombinacionCargaVista;
  resultado: CargaDetalleVista | null;
  intentosFallidos: CargaResumenVista[];
  onSubidaExitosa: (clave: string, carga: CargaDetalleVista) => void;
  onSolicitarVistoBueno: (carga: CargaResumenVista) => void;
};

// Una tarjeta por combinación (formato, ventana), cada una con su propio estado de
// archivo/subida/error: subir un archivo para una combinación no interfiere con las demás.
function TarjetaCargaArchivo({
  combinacion,
  resultado,
  intentosFallidos,
  onSubidaExitosa,
  onSolicitarVistoBueno,
}: TarjetaCargaArchivoProps) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [errorSubida, setErrorSubida] = useState<string | null>(null);

  const idBase = `carga-${claveCombinacion(combinacion)}`;
  const idTitulo = `${idBase}-titulo`;
  const idArchivo = `${idBase}-archivo`;

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

  return (
    <section aria-labelledby={idTitulo} className="rounded-lg border border-gob-accent bg-white p-6">
      <h3 id={idTitulo} className="text-base font-semibold text-gob-tertiary">
        {combinacion.formatoNombre} · {combinacion.anio}
      </h3>

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
          <p className="text-sm text-gob-gray-a">
            <BadgeEstado estado={resultado.estado} /> · {resultado.cantidadFilasDatos} filas de datos,{" "}
            {resultado.cantidadErrores} {resultado.cantidadErrores === 1 ? "error" : "errores"}
          </p>

          <ResumenErroresCarga errores={resultado.errores} />

          {resultado.estado === "PENDIENTE_VISTO_BUENO" ? (
            <Boton variante="primario" className="w-fit" onClick={() => onSolicitarVistoBueno(resultado)}>
              <IconoAprobado className="shrink-0" />
              Dar visto bueno
            </Boton>
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
  // Se obtiene en el Server Component (`app/notificador/page.tsx`): evita un `fetch` disparado
  // desde un efecto solo para la carga inicial. El widget vuelve a pedirla desde los propios
  // manejadores de evento (tras subir un archivo o dar visto bueno), nunca desde un efecto.
  cargasIniciales: CargaResumenVista[];
};

export function PanelCargaArchivo({ combinaciones, cargasIniciales }: PanelCargaArchivoProps) {
  // Resultado de la última subida por combinación, indexado por clave: cada tarjeta solo ve el
  // suyo. Vive aquí (no dentro de cada tarjeta) porque `confirmarVistoBueno` necesita poder
  // actualizar el estado de la combinación correspondiente tras dar visto bueno.
  const [resultados, setResultados] = useState<Record<string, CargaDetalleVista>>({});

  // Ya no alimenta ninguna tabla propia de este panel (esa vista vive en "Mis cargas",
  // `/notificador/cargas`): se mantiene solo para derivar `TablaIntentosFallidos` (estado
  // `CON_ERRORES`) y `combinacionesVisibles` (oculta una combinación ya `APROBADA`).
  const [misCargas, setMisCargas] = useState<CargaResumenVista[]>(cargasIniciales);

  const [objetivoVistoBueno, setObjetivoVistoBueno] = useState<CargaResumenVista | null>(null);
  const [procesandoVistoBueno, setProcesandoVistoBueno] = useState(false);
  const [errorVistoBueno, setErrorVistoBueno] = useState<string | null>(null);

  function registrarResultado(clave: string, carga: CargaDetalleVista) {
    setResultados((actual) => ({ ...actual, [clave]: carga }));
    void obtenerMisCargas().then((actualizadas) => {
      if (actualizadas) setMisCargas(actualizadas);
    });
  }

  async function confirmarVistoBueno() {
    if (!objetivoVistoBueno) return;

    setProcesandoVistoBueno(true);
    setErrorVistoBueno(null);

    try {
      const respuesta = await fetch(`/api/notificador/cargas/${objetivoVistoBueno.id}/visto-bueno`, {
        method: "POST",
      });

      if (!respuesta.ok) {
        const datos = await respuesta.json().catch(() => null);
        setErrorVistoBueno(datos?.error ?? MENSAJE_ERROR_GENERICO);
        setProcesandoVistoBueno(false);
        return;
      }

      const datos = (await respuesta.json()) as { carga: CargaDetalleVista };

      setResultados((actual) => {
        const entrada = Object.entries(actual).find(([, carga]) => carga.id === objetivoVistoBueno.id);
        if (!entrada) return actual;

        const [clave, carga] = entrada;
        return { ...actual, [clave]: { ...carga, estado: "APROBADA", vistoBuenoEn: datos.carga.vistoBuenoEn } };
      });

      setProcesandoVistoBueno(false);
      setObjetivoVistoBueno(null);

      const actualizadas = await obtenerMisCargas();
      if (actualizadas) setMisCargas(actualizadas);
    } catch {
      setErrorVistoBueno(MENSAJE_ERROR_GENERICO);
      setProcesandoVistoBueno(false);
    }
  }

  // Una combinación deja de mostrarse (tarjeta completa, incluida su tabla de intentos fallidos
  // anidada) en cuanto el notificador da visto bueno a una carga exitosa de esa misma
  // combinación: se deriva de `misCargas`, que `confirmarVistoBueno` ya vuelve a pedir tras un
  // visto bueno exitoso, sin ningún estado adicional que mantener sincronizado.
  const combinacionesVisibles = combinaciones.filter(
    (combinacion) =>
      !misCargas.some((carga) => carga.ventanaCargaId === combinacion.ventanaCargaId && carga.estado === "APROBADA"),
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
        combinacionesVisibles.map((combinacion) => (
          <TarjetaCargaArchivo
            key={claveCombinacion(combinacion)}
            combinacion={combinacion}
            resultado={resultados[claveCombinacion(combinacion)] ?? null}
            intentosFallidos={misCargas.filter(
              (carga) => carga.ventanaCargaId === combinacion.ventanaCargaId && carga.estado === "CON_ERRORES",
            )}
            onSubidaExitosa={registrarResultado}
            onSolicitarVistoBueno={setObjetivoVistoBueno}
          />
        ))
      )}

      <DialogoConfirmacion
        abierto={objetivoVistoBueno !== null}
        titulo="Dar visto bueno"
        descripcion={
          objetivoVistoBueno
            ? `"${objetivoVistoBueno.nombreArchivoOriginal}" quedará visible para el administrador y el revisor del repositorio. Esta acción no se puede deshacer.`
            : ""
        }
        textoConfirmar="Dar visto bueno"
        textoConfirmando="Guardando..."
        variante="primario"
        procesando={procesandoVistoBueno}
        error={errorVistoBueno}
        onConfirmar={() => void confirmarVistoBueno()}
        onCancelar={() => {
          if (procesandoVistoBueno) return;
          setObjetivoVistoBueno(null);
          setErrorVistoBueno(null);
        }}
      />
    </div>
  );
}
