"use client";

import type { ChangeEvent } from "react";
import Link from "next/link";
import type { SeparadorCsv, TipoArchivo } from "@/modules/formatos-excel/domain/entities/FormatoExcel";
import { Boton } from "@/shared/components/Boton";
import { CampoSelect } from "@/shared/components/CampoSelect";
import {
  ETIQUETA_SEPARADOR_CSV,
  EXTENSION_TIPO_ARCHIVO,
  OPCIONES_SEPARADOR_CSV,
  OPCIONES_TIPO_ARCHIVO,
  describirTipoArchivo,
  esSeparadorCsv,
} from "@/shared/components/opciones-formato-excel";

const CLASES_ENLACE_CANCELAR =
  "inline-flex items-center text-sm font-medium text-gob-primary underline-offset-2 hover:underline";

type PasoTipoArchivoFormatoProps = {
  rutaBase: string;
  tipoArchivo: TipoArchivo;
  separadorCsv: SeparadorCsv;
  onCambiarTipo: (tipo: TipoArchivo) => void;
  onCambiarSeparador: (separador: SeparadorCsv) => void;
  onContinuar: () => void;
};

// Paso 0 del asistente de formatos: tipo de archivo (inmutable una vez creado) y, si es CSV, su
// separador.
export function PasoTipoArchivoFormato({
  rutaBase,
  tipoArchivo,
  separadorCsv,
  onCambiarTipo,
  onCambiarSeparador,
  onContinuar,
}: PasoTipoArchivoFormatoProps) {
  return (
    <div className="mt-6 flex flex-col items-start gap-4 rounded-lg border border-gob-accent bg-white p-6">
      <p className="text-sm text-gob-gray-a">
        Elige el tipo de archivo que deberán subir los notificadores con este formato. No se podrá
        cambiar después de crearlo.
      </p>

      <div className="grid w-full gap-5 md:grid-cols-2">
        <CampoSelect
          id="tipo-archivo"
          etiqueta="Tipo de archivo"
          opciones={OPCIONES_TIPO_ARCHIVO}
          value={tipoArchivo}
          onChange={(evento) => onCambiarTipo(evento.target.value === "CSV" ? "CSV" : "EXCEL")}
        />
        {tipoArchivo === "CSV" ? (
          <CampoSelect
            id="separador-csv"
            etiqueta="Separador"
            opciones={OPCIONES_SEPARADOR_CSV}
            value={separadorCsv}
            onChange={(evento) => {
              if (esSeparadorCsv(evento.target.value)) onCambiarSeparador(evento.target.value);
            }}
            ayuda="Carácter que separa las columnas en cada línea del archivo."
          />
        ) : null}
      </div>

      <div className="flex flex-wrap gap-3">
        <Boton type="button" variante="primario" onClick={onContinuar}>
          Continuar
        </Boton>
        <Link href={rutaBase} className={CLASES_ENLACE_CANCELAR}>
          Cancelar
        </Link>
      </div>
    </div>
  );
}

type ResumenTipoArchivoFormatoProps = {
  tipoArchivo: TipoArchivo;
  separadorCsv: SeparadorCsv;
  // Separador distinto del elegido que aparece dentro de la única columna detectada: señal de
  // que el CSV se leyó con el separador equivocado.
  otroSeparadorDetectado: SeparadorCsv | null;
};

// Encabezado del paso 2: recuerda el tipo elegido y advierte (sin bloquear) si el CSV parece usar
// otro separador.
export function ResumenTipoArchivoFormato({
  tipoArchivo,
  separadorCsv,
  otroSeparadorDetectado,
}: ResumenTipoArchivoFormatoProps) {
  return (
    <>
      <p className="text-sm text-gob-gray-a">
        Tipo de archivo:{" "}
        <span className="font-medium text-gob-black">
          {describirTipoArchivo(tipoArchivo, tipoArchivo === "CSV" ? separadorCsv : null)}
        </span>
      </p>

      {otroSeparadorDetectado ? (
        <p role="status" className="rounded-md border border-gob-secondary bg-gob-neutral px-3 py-2 text-sm text-gob-black">
          Se detectó una sola columna que contiene el carácter{" "}
          {ETIQUETA_SEPARADOR_CSV[otroSeparadorDetectado].toLowerCase()}. Es probable que el archivo
          use ese separador y no {ETIQUETA_SEPARADOR_CSV[separadorCsv].toLowerCase()}: vuelve al
          paso anterior y cambia el separador.
        </p>
      ) : null}
    </>
  );
}

type PasoSubirPlantillaFormatoProps = {
  rutaBase: string;
  tipoArchivo: TipoArchivo;
  separadorCsv: SeparadorCsv;
  cargando: boolean;
  error: string | null;
  onSeleccionar: (evento: ChangeEvent<HTMLInputElement>) => void;
  onCambiarTipo: () => void;
};

// Paso 1 del asistente de formatos: sube una plantilla del tipo elegido. El `accept` solo guía al
// navegador; el servidor comprueba que el archivo sea realmente de ese tipo.
export function PasoSubirPlantillaFormato({
  rutaBase,
  tipoArchivo,
  separadorCsv,
  cargando,
  error,
  onSeleccionar,
  onCambiarTipo,
}: PasoSubirPlantillaFormatoProps) {
  return (
    <div className="mt-6 flex flex-col items-start gap-4 rounded-lg border border-gob-accent bg-white p-6">
      <p className="text-sm text-gob-gray-a">
        Sube un archivo de ejemplo ({describirTipoArchivo(tipoArchivo, tipoArchivo === "CSV" ? separadorCsv : null)},
        máximo 10 MB). El sistema leerá las columnas de la primera fila para que definas cuáles son
        requeridas y su tipo de dato.
      </p>

      <label className="inline-flex w-fit cursor-pointer items-center justify-center rounded-md bg-gob-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gob-tertiary active:translate-y-px focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-gob-primary">
        {cargando ? "Leyendo..." : "Seleccionar plantilla"}
        <input
          type="file"
          accept={EXTENSION_TIPO_ARCHIVO[tipoArchivo]}
          className="sr-only"
          disabled={cargando}
          onChange={onSeleccionar}
        />
      </label>

      {error ? (
        <p role="alert" className="text-sm font-medium text-gob-danger">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Boton type="button" variante="secundario" disabled={cargando} onClick={onCambiarTipo}>
          Cambiar tipo de archivo
        </Boton>
        <Link href={rutaBase} className={CLASES_ENLACE_CANCELAR}>
          Cancelar
        </Link>
      </div>
    </div>
  );
}
