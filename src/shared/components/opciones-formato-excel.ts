import {
  SEPARADORES_CSV,
  type FormatoExcelResumen,
  type SeparadorCsv,
  type TipoArchivo,
} from "@/modules/formatos-excel/domain/entities/FormatoExcel";
import type { OpcionSeleccionMultiple } from "@/shared/components/CampoSeleccionMultiple";
import type { OpcionSelect } from "@/shared/components/CampoSelect";

export const ETIQUETA_TIPO_ARCHIVO: Record<TipoArchivo, string> = {
  EXCEL: "Excel (.xlsx)",
  CSV: "CSV (.csv)",
};

export const EXTENSION_TIPO_ARCHIVO: Record<TipoArchivo, string> = {
  EXCEL: ".xlsx",
  CSV: ".csv",
};

// Etiqueta con el carácter visible entre paréntesis, para que quien configura el formato o sube
// el archivo sepa exactamente qué separador espera el sistema.
export const ETIQUETA_SEPARADOR_CSV: Record<SeparadorCsv, string> = {
  COMA: "Coma (,)",
  PUNTO_Y_COMA: "Punto y coma (;)",
  TABULADOR: "Tabulador",
  BARRA_VERTICAL: "Barra vertical (|)",
};

export const OPCIONES_TIPO_ARCHIVO: OpcionSelect[] = [
  { valor: "EXCEL", etiqueta: ETIQUETA_TIPO_ARCHIVO.EXCEL },
  { valor: "CSV", etiqueta: ETIQUETA_TIPO_ARCHIVO.CSV },
];

export const OPCIONES_SEPARADOR_CSV: OpcionSelect[] = [
  { valor: "COMA", etiqueta: ETIQUETA_SEPARADOR_CSV.COMA },
  { valor: "PUNTO_Y_COMA", etiqueta: ETIQUETA_SEPARADOR_CSV.PUNTO_Y_COMA },
  { valor: "TABULADOR", etiqueta: ETIQUETA_SEPARADOR_CSV.TABULADOR },
  { valor: "BARRA_VERTICAL", etiqueta: ETIQUETA_SEPARADOR_CSV.BARRA_VERTICAL },
];

// Descripción corta para listados y ayudas: "Excel (.xlsx)" o "CSV (.csv) separado por punto y
// coma (;)".
export function describirTipoArchivo(tipoArchivo: TipoArchivo, separadorCsv: SeparadorCsv | null): string {
  if (tipoArchivo === "CSV" && separadorCsv) {
    return `${ETIQUETA_TIPO_ARCHIVO.CSV} separado por ${ETIQUETA_SEPARADOR_CSV[separadorCsv].toLowerCase()}`;
  }
  return ETIQUETA_TIPO_ARCHIVO[tipoArchivo];
}

const SEPARADORES_VALIDOS: ReadonlySet<string> = new Set<string>(SEPARADORES_CSV);

export function esSeparadorCsv(valor: string): valor is SeparadorCsv {
  return SEPARADORES_VALIDOS.has(valor);
}

// Formatos activos + los que la persona ya tuviera asignados, aunque hayan sido dados de baja.
// Mismo criterio que `aOpcionesPerfil`/`incluirCodigos`: sin esto, editar a alguien con un
// formato inactivo se lo quitaría en silencio al guardar (el checkbox nunca aparecería marcado).
export function aOpcionesFormatoExcel(
  formatos: FormatoExcelResumen[],
  idsAsignados: string[] = [],
): OpcionSeleccionMultiple[] {
  const asignados = new Set(idsAsignados);

  return formatos
    .filter((formato) => formato.activo || asignados.has(formato.id))
    .map((formato) => ({ valor: formato.id, etiqueta: formato.nombre }));
}
