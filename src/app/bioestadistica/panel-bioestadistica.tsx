"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { EstadoTarjetaBioestadistica } from "@/modules/bioestadistica/domain/entities/EstadoTarjetaBioestadistica";
import {
  TAMANO_MAXIMO_ARCHIVO_BIOESTADISTICA,
  TAMANO_MAXIMO_ARCHIVO_BIOESTADISTICA_TEXTO,
} from "@/modules/bioestadistica/domain/entities/CargaBioestadistica";
import type { TipoArchivoBioestadistica } from "@/modules/bioestadistica/domain/entities/TipoArchivoBioestadistica";
import { Boton } from "@/shared/components/Boton";
import { CargadorArchivo } from "@/shared/components/CargadorArchivo";
import { FormularioSolicitudReemplazo } from "@/shared/components/FormularioSolicitudReemplazo";
import { IconoRelojArena, IconoSubir } from "@/shared/components/iconos";
import { useRefrescoPeriodico } from "@/shared/hooks/useRefrescoPeriodico";
import { useSubidaConProgreso } from "@/shared/hooks/useSubidaConProgreso";
import {
  DESCRIPCION_SOLICITUD_REEMPLAZO_BIOESTADISTICA,
  PLACEHOLDER_MOTIVO_REEMPLAZO_BIOESTADISTICA,
} from "./textos-solicitud-reemplazo";

// Vista de una tarjeta (año, tipo) del inicio de Bioestadística, con las fechas ya formateadas en el
// servidor (zona horaria fija) y el estado resuelto allí: el cliente nunca recalcula vigencias.
export type TarjetaBioestadisticaVista = {
  clave: string;
  anio: number;
  tipoArchivo: TipoArchivoBioestadistica;
  etiquetaTipo: string;
  // `null` si el año ya cerró y la tarjeta aparece solo por una solicitud o un procesamiento.
  cierraElTexto: string | null;
  estado: EstadoTarjetaBioestadistica;
  cargaActiva: { id: string; nombreArchivoOriginal: string; subidoElTexto: string; cantidadFilasDatos: number } | null;
  venceElAutorizacionIso: string | null;
  venceElAutorizacionTexto: string | null;
  ultimoFallo: { mensaje: string; nombreArchivoOriginal: string; fechaTexto: string } | null;
};

const MENSAJE_ERROR_GENERICO = "No se pudo subir el archivo. Intenta nuevamente.";
const RUTA_API_CARGAS = "/api/bioestadistica/cargas";
const RUTA_API_SOLICITUDES = "/api/bioestadistica/solicitudes-reemplazo";

const ETIQUETA_ESTADO: Record<EstadoTarjetaBioestadistica, string> = {
  SUBIR: "Pendiente de envío",
  PROCESANDO: "Procesando",
  ENVIADO: "Enviado",
  SOLICITUD_PENDIENTE: "Solicitud pendiente",
  REEMPLAZO_AUTORIZADO: "Reemplazo autorizado",
};

const CLASE_ESTADO: Record<EstadoTarjetaBioestadistica, string> = {
  SUBIR: "border-gob-tertiary text-gob-tertiary",
  PROCESANDO: "border-gob-gray-a text-gob-gray-a",
  ENVIADO: "border-gob-success text-gob-success",
  SOLICITUD_PENDIENTE: "border-orange-500 text-orange-700",
  REEMPLAZO_AUTORIZADO: "border-gob-primary text-gob-primary",
};

function FormularioSubida({ tarjeta, onSubido }: { tarjeta: TarjetaBioestadisticaVista; onSubido: () => void }) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { subir: enviar, progreso } = useSubidaConProgreso();

  async function subir() {
    if (!archivo) return;

    // Rechazo temprano en el cliente: evita enviar cientos de MB que el servidor rechazaría igual.
    if (archivo.size > TAMANO_MAXIMO_ARCHIVO_BIOESTADISTICA) {
      setError(`El archivo no puede superar los ${TAMANO_MAXIMO_ARCHIVO_BIOESTADISTICA_TEXTO}.`);
      return;
    }

    setSubiendo(true);
    setError(null);

    try {
      const parametros = new URLSearchParams({ anio: String(tarjeta.anio), tipoArchivo: tarjeta.tipoArchivo });
      const respuesta = await enviar(`${RUTA_API_CARGAS}?${parametros}`, archivo, {
        "Content-Type": archivo.type || "application/octet-stream",
        "X-Nombre-Archivo": encodeURIComponent(archivo.name),
      });
      if (respuesta.estado !== 202) {
        const datos = respuesta.cuerpo as { error?: string } | null;
        setError(datos?.error ?? MENSAJE_ERROR_GENERICO);
        return;
      }
      setArchivo(null);
      onSubido();
    } catch {
      setError(MENSAJE_ERROR_GENERICO);
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-4">
      <CargadorArchivo
        id={`archivo-${tarjeta.clave}`}
        archivo={archivo}
        extension=".xlsx,.csv"
        descripcionTipo="Excel .xlsx o CSV"
        tamanoMaximoTexto={TAMANO_MAXIMO_ARCHIVO_BIOESTADISTICA_TEXTO}
        disabled={subiendo}
        onArchivo={(seleccionado) => {
          setArchivo(seleccionado);
          setError(null);
        }}
      />

      {error ? (
        <p role="alert" className="text-sm font-medium text-gob-danger">
          {error}
        </p>
      ) : null}

      <Boton
        onClick={() => void subir()}
        disabled={!archivo}
        cargando={subiendo}
        textoCargando={progreso === 100 ? "Completando subida..." : `Subiendo archivo${progreso === null ? "" : `: ${progreso}%`}...`}
        className="w-fit"
      >
        <IconoSubir className="shrink-0" />
        Subir archivo
      </Boton>
    </div>
  );
}

function CuerpoTarjeta({ tarjeta, onCambio }: { tarjeta: TarjetaBioestadisticaVista; onCambio: () => void }) {
  const activa = tarjeta.cargaActiva;

  switch (tarjeta.estado) {
    case "PROCESANDO":
      return (
        <p role="status" className="mt-3 flex items-center gap-2 text-sm font-medium text-gob-gray-a">
          <IconoRelojArena className="shrink-0" />
          Procesando el archivo… Esta tarjeta se actualizará sola al terminar.
        </p>
      );
    case "SUBIR":
      return <FormularioSubida tarjeta={tarjeta} onSubido={onCambio} />;
    case "REEMPLAZO_AUTORIZADO":
      return (
        <>
          <p className="mt-3 text-sm font-medium text-gob-primary">
            Tu solicitud de reemplazo fue aprobada: el archivo que subas reemplazará a{" "}
            <strong>{activa?.nombreArchivoOriginal}</strong>.
            {tarjeta.venceElAutorizacionIso ? (
              <>
                {" "}
                Plazo para subirlo:{" "}
                <time dateTime={tarjeta.venceElAutorizacionIso} className="font-semibold tabular-nums">
                  {tarjeta.venceElAutorizacionTexto}
                </time>
                .
              </>
            ) : null}
          </p>
          <FormularioSubida tarjeta={tarjeta} onSubido={onCambio} />
        </>
      );
    case "SOLICITUD_PENDIENTE":
    case "ENVIADO":
      return (
        <>
          <p className="mt-3 text-sm text-gob-gray-a">
            Archivo enviado: <strong className="break-all text-gob-black">{activa?.nombreArchivoOriginal}</strong>
            {activa ? (
              <span className="block text-xs tabular-nums">
                {activa.subidoElTexto} · {activa.cantidadFilasDatos.toLocaleString("es-CL")} filas
              </span>
            ) : null}
          </p>
          <div className="mt-auto border-t border-gob-accent pt-4">
            {tarjeta.estado === "SOLICITUD_PENDIENTE" || !activa ? (
              <p role="status" className="text-sm font-semibold text-gob-primary-oscuro">
                Solicitud de reemplazo pendiente de aprobación.
              </p>
            ) : (
              <FormularioSolicitudReemplazo
                rutaApi={RUTA_API_SOLICITUDES}
                cuerpo={{ cargaBioestadisticaId: activa.id }}
                idBase={activa.id}
                placeholderMotivo={PLACEHOLDER_MOTIVO_REEMPLAZO_BIOESTADISTICA}
                descripcion={DESCRIPCION_SOLICITUD_REEMPLAZO_BIOESTADISTICA}
                onExito={onCambio}
              />
            )}
          </div>
        </>
      );
  }
}

function TarjetaArchivoBioestadistica({ tarjeta, onCambio }: { tarjeta: TarjetaBioestadisticaVista; onCambio: () => void }) {
  const idTitulo = `titulo-${tarjeta.clave}`;

  return (
    <section
      aria-labelledby={idTitulo}
      className="flex h-full w-full flex-col rounded-lg border border-gob-accent bg-white p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={idTitulo} className="text-base font-semibold text-gob-tertiary">
            {tarjeta.etiquetaTipo} · {tarjeta.anio}
          </h3>
          <p className="mt-0.5 text-xs text-gob-gray-a">
            {tarjeta.cierraElTexto ? `Disponible hasta el ${tarjeta.cierraElTexto}` : "Fuera de plazo"}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full border bg-white px-2 py-0.5 text-xs font-semibold ${CLASE_ESTADO[tarjeta.estado]}`}
        >
          {ETIQUETA_ESTADO[tarjeta.estado]}
        </span>
      </div>

      {tarjeta.ultimoFallo ? (
        <p role="alert" className="mt-3 rounded-md border border-gob-danger/30 bg-gob-danger/10 px-3 py-2 text-sm text-gob-black">
          No se pudo procesar <strong className="break-all">{tarjeta.ultimoFallo.nombreArchivoOriginal}</strong> (
          {tarjeta.ultimoFallo.fechaTexto}): {tarjeta.ultimoFallo.mensaje}
        </p>
      ) : null}

      <CuerpoTarjeta tarjeta={tarjeta} onCambio={onCambio} />
    </section>
  );
}

// RF-37: inicio del área Bioestadística. Una tarjeta por (año disponible, tipo) y, además, las de
// años cerrados con una solicitud o un procesamiento en curso. Mientras alguna esté PROCESANDO, la
// página se vuelve a pedir al servidor cada 20 s (y al volver a la pestaña) hasta que termine.
export function PanelBioestadistica({ tarjetas }: { tarjetas: TarjetaBioestadisticaVista[] }) {
  const router = useRouter();
  const hayProcesando = tarjetas.some((tarjeta) => tarjeta.estado === "PROCESANDO");

  useRefrescoPeriodico(async () => router.refresh(), hayProcesando ? "procesando" : null);

  if (tarjetas.length === 0) {
    return (
      <section aria-labelledby="titulo-sin-anios" className="rounded-lg border border-dashed border-gob-accent bg-white p-6">
        <h2 id="titulo-sin-anios" className="text-base font-semibold text-gob-tertiary">
          Defunciones y Egresos
        </h2>
        <p className="mt-2 text-sm text-gob-gray-a">
          No hay ningún año disponible para reportar en este momento. Contacta a un administrador o al revisor del
          repositorio si crees que esto es un error.
        </p>
      </section>
    );
  }

  return (
    <div className="grid grid-cols-1 items-stretch gap-5 md:grid-cols-2">
      {tarjetas.map((tarjeta) => (
        <TarjetaArchivoBioestadistica key={tarjeta.clave} tarjeta={tarjeta} onCambio={() => router.refresh()} />
      ))}
    </div>
  );
}
