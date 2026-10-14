"use client";

import type { ConfiguracionComparacionFechas, FuenteFechaReferencia, OperadorComparacionFechas } from "@/modules/formatos-excel/domain/entities/FormatoExcel";
import { columnasFuenteFecha } from "@/modules/formatos-excel/domain/entities/ComparacionFechas";
import { CampoSelect } from "@/shared/components/CampoSelect";
import { CampoTexto } from "@/shared/components/CampoTexto";
import { OPCIONES_OPERADOR_COMPARACION } from "@/shared/utils/reglasValidacion";

type Props = {
  idBase: string;
  columnas: { nombre: string; tipoDato: string }[];
  configuracion: ConfiguracionComparacionFechas;
  onCambiar: (configuracion: ConfiguracionComparacionFechas) => void;
};

function fuenteVacia(modo: string): FuenteFechaReferencia {
  return modo === "COLUMNA" ? { modo: "COLUMNA", columna: "" } : modo === "FIJA" ? { modo: "FIJA", fecha: "" } : { modo: "COMPONENTES", dia: "", mes: "", anio: "" };
}

function EditorFuenteFecha({ id, titulo, fuente, columnas, permitirFija, excluir = [], onCambiar }: {
  id: string; titulo: string; fuente: FuenteFechaReferencia; columnas: Props["columnas"]; permitirFija?: boolean; excluir?: string[]; onCambiar: (fuente: FuenteFechaReferencia) => void;
}) {
  const excluidas = new Set(excluir);
  const opciones = [{ valor: "", etiqueta: "Selecciona una columna" }, ...columnas.filter((columna) => !excluidas.has(columna.nombre) && columna.tipoDato === (fuente.modo === "COLUMNA" ? "FECHA" : "ENTERO")).map((columna) => ({ valor: columna.nombre, etiqueta: columna.nombre }))];
  const modos = [{ valor: "COLUMNA", etiqueta: "Fecha completa" }, { valor: "COMPONENTES", etiqueta: "Día, mes y año en columnas separadas" }, ...(permitirFija ? [{ valor: "FIJA", etiqueta: "Fecha ingresada manualmente" }] : [])];
  return <fieldset className="flex flex-col gap-3 rounded-lg border border-gob-accent p-3">
    <legend className="text-sm font-medium">{titulo}</legend>
    <CampoSelect id={`${id}-modo`} etiqueta="Cómo está escrita la fecha" opciones={modos} value={fuente.modo} onChange={(evento) => onCambiar(fuenteVacia(evento.target.value))} />
    {fuente.modo === "FIJA" ? <CampoTexto id={`${id}-fecha`} etiqueta="Fecha" type="date" value={fuente.fecha} onChange={(evento) => onCambiar({ modo: "FIJA", fecha: evento.target.value })} />
      : fuente.modo === "COLUMNA" ? <CampoSelect id={`${id}-columna`} etiqueta="Columna de fecha" opciones={opciones} value={fuente.columna} onChange={(evento) => onCambiar({ ...fuente, columna: evento.target.value })} />
      : (["dia", "mes", "anio"] as const).map((campo) => <CampoSelect key={campo} id={`${id}-${campo}`} etiqueta={{ dia: "Día", mes: "Mes", anio: "Año" }[campo]} opciones={opciones} value={fuente[campo]} onChange={(evento) => onCambiar({ ...fuente, [campo]: evento.target.value })} />)}
  </fieldset>;
}

export function EditorComparacionFechas({ idBase, columnas, configuracion, onCambiar }: Props) {
  return <div className="flex flex-col gap-3">
    <p className="text-xs text-gob-gray-a">Cada fila se acepta si «Fecha 1» cumple la comparación con «Fecha 2». Se compara el día calendario. Fechas totalmente vacías se omiten; componentes incompletos o fechas imposibles se rechazan. Usa «Requerida» para exigir un valor.</p>
    <EditorFuenteFecha id={`${idBase}-origen`} titulo="Fecha 1" fuente={configuracion.origen} columnas={columnas} onCambiar={(origen) => {
      if (origen.modo === "FIJA") return;
      const usadas = new Set(columnasFuenteFecha(origen).filter(Boolean));
      const choca = columnasFuenteFecha(configuracion.referencia).some((columna) => usadas.has(columna));
      onCambiar({ ...configuracion, origen, referencia: choca ? fuenteVacia(configuracion.referencia.modo) : configuracion.referencia });
    }} />
    <CampoSelect id={`${idBase}-operador`} etiqueta="Comparación (Fecha 1 respecto de Fecha 2)" opciones={OPCIONES_OPERADOR_COMPARACION} value={configuracion.operador ?? "MAYOR_IGUAL"} onChange={(evento) => onCambiar({ ...configuracion, operador: evento.target.value as OperadorComparacionFechas })} />
    <EditorFuenteFecha id={`${idBase}-referencia`} titulo="Fecha 2" fuente={configuracion.referencia} columnas={columnas} permitirFija excluir={columnasFuenteFecha(configuracion.origen)} onCambiar={(referencia) => onCambiar({ ...configuracion, referencia })} />
  </div>;
}
