"use client";

import type { ConfiguracionComparacionFechas, FuenteFecha } from "@/modules/formatos-excel/domain/entities/FormatoExcel";
import { CampoSelect } from "@/shared/components/CampoSelect";

type Props = {
  idBase: string;
  columnas: { nombre: string; tipoDato: string }[];
  configuracion: ConfiguracionComparacionFechas;
  onCambiar: (configuracion: ConfiguracionComparacionFechas) => void;
};

function EditorFuenteFecha({ id, titulo, fuente, columnas, onCambiar }: {
  id: string; titulo: string; fuente: FuenteFecha; columnas: Props["columnas"]; onCambiar: (fuente: FuenteFecha) => void;
}) {
  const opciones = [{ valor: "", etiqueta: "Selecciona una columna" }, ...columnas.filter((columna) => columna.tipoDato === (fuente.modo === "COLUMNA" ? "FECHA" : "ENTERO")).map((columna) => ({ valor: columna.nombre, etiqueta: columna.nombre }))];
  return <fieldset className="flex flex-col gap-3 rounded-lg border border-gob-accent p-3">
    <legend className="text-sm font-medium">{titulo}</legend>
    <CampoSelect id={`${id}-modo`} etiqueta="Cómo está escrita la fecha" opciones={[{ valor: "COLUMNA", etiqueta: "Fecha completa" }, { valor: "COMPONENTES", etiqueta: "Día, mes y año en columnas separadas" }]} value={fuente.modo} onChange={(evento) => onCambiar(evento.target.value === "COLUMNA" ? { modo: "COLUMNA", columna: "" } : { modo: "COMPONENTES", dia: "", mes: "", anio: "" })} />
    {fuente.modo === "COLUMNA" ? <CampoSelect id={`${id}-columna`} etiqueta="Columna de fecha" opciones={opciones} value={fuente.columna} onChange={(evento) => onCambiar({ ...fuente, columna: evento.target.value })} /> : (["dia", "mes", "anio"] as const).map((campo) => <CampoSelect key={campo} id={`${id}-${campo}`} etiqueta={{ dia: "Día", mes: "Mes", anio: "Año" }[campo]} opciones={opciones} value={fuente[campo]} onChange={(evento) => onCambiar({ ...fuente, [campo]: evento.target.value })} />)}
  </fieldset>;
}

export function EditorComparacionFechas({ idBase, columnas, configuracion, onCambiar }: Props) {
  return <div className="flex flex-col gap-3">
    <p className="text-xs text-gob-gray-a">La fecha a validar debe ser posterior o igual a la fecha de referencia. Se compara el día calendario. Fechas totalmente vacías se omiten; componentes incompletos o fechas imposibles se rechazan. Usa «Requerida» para exigir un valor.</p>
    <EditorFuenteFecha id={`${idBase}-origen`} titulo="Fecha a validar (por ejemplo, atención)" fuente={configuracion.origen} columnas={columnas} onCambiar={(origen) => onCambiar({ ...configuracion, origen })} />
    <EditorFuenteFecha id={`${idBase}-referencia`} titulo="Fecha de referencia (por ejemplo, nacimiento)" fuente={configuracion.referencia} columnas={columnas} onCambiar={(referencia) => onCambiar({ ...configuracion, referencia })} />
  </div>;
}
