"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Boton } from "@/shared/components/Boton";
import { CampoTexto } from "@/shared/components/CampoTexto";
import { tipoEnumeradoSchema } from "@/modules/formatos-excel/schemas/formato-excel.schema";
import {
  LARGO_MAXIMO_NOMBRE_ENUMERADO,
  LARGO_MAXIMO_VALOR_ENUMERADO,
  MAXIMO_VALORES_ENUMERADO,
  normalizarValorEnumerado,
} from "@/modules/formatos-excel/domain/entities/TipoEnumerado";
import type { TipoEnumeradoEditable } from "@/shared/components/useTiposEnumeradosFormato";

const MENSAJE_DATOS_INVALIDOS = "Revisa el nombre y los valores del tipo enumerado";

// Tope del textarea: todos los valores al largo máximo, más el salto de línea de cada uno.
const LARGO_MAXIMO_TEXTO_VALORES = MAXIMO_VALORES_ENUMERADO * (LARGO_MAXIMO_VALOR_ENUMERADO + 2);

// Un valor por línea. Las líneas en blanco se ignoran (separar grupos visualmente no es un error).
function separarValores(texto: string): string[] {
  return texto
    .split(/\r?\n/)
    .map((linea) => linea.trim())
    .filter((linea) => linea.length > 0);
}

type ModalTipoEnumeradoFormatoExcelProps = {
  // `null` = crear uno nuevo.
  tipoInicial: TipoEnumeradoEditable | null;
  // Nombres de los DEMÁS tipos del formato, para rechazar un nombre repetido sin ir al servidor.
  nombresOtrosTipos: string[];
  onGuardar: (tipo: TipoEnumeradoEditable) => void;
  onCancelar: () => void;
};

// Crear o editar un tipo enumerado. Se monta solo mientras está abierto (el gestor lo renderiza
// condicionalmente), así que su estado nace del `tipoInicial` en cada apertura sin sincronizarlo
// con efectos. Valida con el MISMO esquema Zod que el servidor (`tipoEnumeradoSchema`).
export function ModalTipoEnumeradoFormatoExcel({
  tipoInicial,
  nombresOtrosTipos,
  onGuardar,
  onCancelar,
}: ModalTipoEnumeradoFormatoExcelProps) {
  const referenciaDialogo = useRef<HTMLDialogElement>(null);
  const idBase = useId();
  const idTitulo = `${idBase}-titulo`;
  const idValores = `${idBase}-valores`;
  const idAyudaValores = `${idBase}-valores-ayuda`;
  const [nombre, setNombre] = useState(() => tipoInicial?.nombre ?? "");
  const [textoValores, setTextoValores] = useState(() => tipoInicial?.valores.join("\n") ?? "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialogo = referenciaDialogo.current;
    if (dialogo && !dialogo.open) dialogo.showModal();
  }, []);

  const cantidadValores = separarValores(textoValores).length;

  function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();

    const resultado = tipoEnumeradoSchema.safeParse({ nombre, valores: separarValores(textoValores) });

    if (!resultado.success) {
      setError(resultado.error.issues[0]?.message ?? MENSAJE_DATOS_INVALIDOS);
      return;
    }

    const nombreNormalizado = normalizarValorEnumerado(resultado.data.nombre);

    if (nombresOtrosTipos.some((otro) => normalizarValorEnumerado(otro) === nombreNormalizado)) {
      setError(`Ya existe un tipo enumerado llamado «${resultado.data.nombre}»`);
      return;
    }

    onGuardar(resultado.data);
  }

  return (
    <dialog
      ref={referenciaDialogo}
      aria-labelledby={idTitulo}
      onClose={onCancelar}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-lg border border-gob-accent bg-white p-6 text-gob-black shadow-lg backdrop:bg-gob-tertiary/50"
    >
      <form onSubmit={guardar} className="flex flex-col gap-4">
        <h2 id={idTitulo} className="text-base font-semibold text-gob-black">
          {tipoInicial ? "Editar tipo enumerado" : "Crear tipo enumerado"}
        </h2>

        <CampoTexto
          id={`${idBase}-nombre`}
          etiqueta="Nombre del tipo"
          value={nombre}
          onChange={(evento) => setNombre(evento.target.value)}
          maxLength={LARGO_MAXIMO_NOMBRE_ENUMERADO}
          placeholder="Por ejemplo: Sexo"
          ayuda="Aparecerá en la lista «Tipo de dato» de las columnas."
        />

        <div className="flex flex-col gap-2">
          <label htmlFor={idValores} className="text-sm font-medium text-gob-black">
            Valores permitidos
          </label>
          <textarea
            id={idValores}
            value={textoValores}
            onChange={(evento) => setTextoValores(evento.target.value)}
            aria-describedby={idAyudaValores}
            maxLength={LARGO_MAXIMO_TEXTO_VALORES}
            rows={8}
            placeholder={"Masculino\nFemenino\nIntersex"}
            className="w-full rounded-md border border-gob-accent bg-white px-3 py-2 text-sm text-gob-black outline-none placeholder:text-gob-gray-b focus:border-gob-primary focus:ring-2 focus:ring-gob-primary/30"
          />
          <p id={idAyudaValores} className="text-xs text-gob-gray-a">
            Escribe o pega un valor por línea ({cantidadValores} de {MAXIMO_VALORES_ENUMERADO}). Al validar
            un archivo no se distinguen mayúsculas, pero sí los acentos.
          </p>
        </div>

        {error ? (
          <p role="alert" className="text-sm font-medium text-gob-danger">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-3">
          <Boton type="button" variante="secundario" onClick={onCancelar}>
            Cancelar
          </Boton>
          <Boton type="submit" variante="primario">
            {tipoInicial ? "Guardar cambios" : "Crear tipo"}
          </Boton>
        </div>
      </form>
    </dialog>
  );
}
