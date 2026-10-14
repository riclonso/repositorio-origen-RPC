// Lógica pura de edición de reglas de validación, separada de `EditorReglasValidacionFormatoExcel`
// para poder probarla sin React. Solo de UI: la garantía real es el esquema del servidor.
import { columnasComparacionFechas } from "@/modules/formatos-excel/domain/entities/ComparacionFechas";
import {
  ANIOS_RANGO_MAXIMO,
  ANIOS_RANGO_MINIMO,
  DESPLAZAMIENTO_ANIOS_MAXIMO,
  DESPLAZAMIENTO_ANIOS_MINIMO,
  esConfiguracionComparacionFechas,
  type ConfiguracionAnioDentroDeRango,
  type ConfiguracionComparacionAnioVentana,
  type ConfiguracionComparacionFechas,
  type OperadorComparacionFechas,
  type ConfiguracionReglaValidacion,
  type TipoReglaValidacion,
} from "@/modules/formatos-excel/domain/entities/FormatoExcel";
import type { ModoReglaRut } from "@/shared/components/EditorColumnasReglaRut";
import { mensajeSugeridoAnioRango, mensajeSugeridoAnioVentana } from "@/shared/utils/reglasValidacion";

export type ReglaValidacionEditable = {
  configuracion?: ConfiguracionReglaValidacion | null;
  tipo: TipoReglaValidacion;
  columnas: string[];
  mensaje: string;
  // Solo de UI, para `RUT_VALIDO`: no viaja al servidor (la forma real la da `columnas[]`).
  modoRut?: ModoReglaRut;
};

// Igual que `MENSAJE_REGLA_MAXIMO` en `schemas/formato-excel.schema.ts`: evita el viaje redondo
// al servidor solo para enterarse de que el mensaje es demasiado largo.
export const MENSAJE_REGLA_MAXIMO = 300;

// Configuración inicial de cada tipo que la necesita al elegirlo en el selector; `null` en el resto.
export const CONFIGURACION_COMPARACION_FECHAS_INICIAL: ConfiguracionComparacionFechas = {
  origen: { modo: "COLUMNA", columna: "" },
  operador: "MAYOR_IGUAL",
  referencia: { modo: "COLUMNA", columna: "" },
};

export function configuracionInicial(tipo: TipoReglaValidacion): ConfiguracionReglaValidacion | null {
  if (tipo === "FECHA_POSTERIOR_O_IGUAL") return { ...CONFIGURACION_COMPARACION_FECHAS_INICIAL };
  if (tipo === "COMPARACION_ANIO_VENTANA") return { operador: "MAYOR_IGUAL" };
  if (tipo === "ANIO_DENTRO_DE_RANGO_VENTANA") return { aniosAntes: 0, aniosDespues: 0 };
  return null;
}

// Configuración de `ANIO_DENTRO_DE_RANGO_VENTANA` en edición. Mismo criterio que
// `configuracionAnioVentanaEditable`: no exige enteros, para seguir mostrando lo escrito con su error.
export function configuracionAnioRangoEditable(regla: ReglaValidacionEditable): ConfiguracionAnioDentroDeRango | null {
  const configuracion = regla.configuracion;
  if (regla.tipo !== "ANIO_DENTRO_DE_RANGO_VENTANA" || configuracion == null) return null;
  if ("operador" in configuracion || "origen" in configuracion || !("aniosAntes" in configuracion)) return null;
  return configuracion;
}

// Convierte el texto de un campo numérico en edición al número que se publica a la configuración.
// No garantiza un entero: vacío = 0; un número decimal escrito tal cual (con signo opcional) se
// convierte; cualquier otra cosa —incluidos "-" o "+" solos mientras se escribe, o "1e2"— da `NaN`.
// Así lo que se ve es lo que se guarda o hay error inline visible ("… debe ser un número entero"),
// y Zod lo rechaza al guardar.
const PATRON_NUMERO_DECIMAL = /^[+-]?\d+(?:\.\d+)?$/;

export function interpretarTextoNumerico(textoIngresado: string): number {
  const texto = textoIngresado.trim();
  if (texto === "") return 0;
  return PATRON_NUMERO_DECIMAL.test(texto) ? Number(texto) : Number.NaN;
}

// Mismo criterio y textos que `configuracionAnioDentroDeRangoSchema`. `sujeto`: "Los años antes" o
// "Los años después".
export function errorAniosRango(valor: number, sujeto: string): string | null {
  if (!Number.isInteger(valor)) return `${sujeto} deben ser un número entero`;
  if (valor < ANIOS_RANGO_MINIMO) return `${sujeto} no pueden ser menores que ${ANIOS_RANGO_MINIMO}`;
  if (valor > ANIOS_RANGO_MAXIMO) return `${sujeto} no pueden ser mayores que ${ANIOS_RANGO_MAXIMO}`;
  return null;
}

// Configuración de `COMPARACION_ANIO_VENTANA` tal como está en edición. A diferencia de la guarda de
// dominio, no exige que el ajuste sea entero: mientras se escribe puede no serlo, y el editor debe
// seguir mostrándolo (con su error) en vez de perder el operador elegido.
export function configuracionAnioVentanaEditable(regla: ReglaValidacionEditable): ConfiguracionComparacionAnioVentana | null {
  const configuracion = regla.configuracion;
  if (regla.tipo !== "COMPARACION_ANIO_VENTANA" || configuracion == null || !("operador" in configuracion) || "origen" in configuracion) return null;
  return configuracion as ConfiguracionComparacionAnioVentana;
}

// Lee el campo «Ajuste en años»: vacío = 0. El 0 no se guarda, para que una regla sin ajuste siga
// siendo `{ operador }`.
export function conDesplazamientoAnios(operador: OperadorComparacionFechas, ajuste: string | number): ConfiguracionComparacionAnioVentana {
  const desplazamientoAnios = typeof ajuste === "number" ? ajuste : interpretarTextoNumerico(ajuste);
  return desplazamientoAnios === 0 ? { operador } : { operador, desplazamientoAnios };
}

// Mismo criterio que `configuracionComparacionAnioVentanaSchema`, para avisar antes de guardar.
export function errorDesplazamientoAnios(desplazamientoAnios: number | undefined): string | null {
  if (desplazamientoAnios === undefined) return null;
  if (!Number.isInteger(desplazamientoAnios)) return "El ajuste en años debe ser un número entero";
  if (desplazamientoAnios < DESPLAZAMIENTO_ANIOS_MINIMO) return `El ajuste en años no puede ser menor que ${DESPLAZAMIENTO_ANIOS_MINIMO}`;
  if (desplazamientoAnios > DESPLAZAMIENTO_ANIOS_MAXIMO) return `El ajuste en años no puede ser mayor que ${DESPLAZAMIENTO_ANIOS_MAXIMO}`;
  return null;
}

// Sugerencia de mensaje de `COMPARACION_ANIO_VENTANA` para el estado actual de la regla, o `null` si
// la regla es de otro tipo. Si con el nombre de la columna supera el largo máximo, se omite el nombre.
export function sugerenciaAnioVentana(regla: ReglaValidacionEditable): string | null {
  const configuracion = configuracionAnioVentanaEditable(regla);
  if (!configuracion) return null;
  const { operador, desplazamientoAnios = 0 } = configuracion;
  const sugerencia = mensajeSugeridoAnioVentana(regla.columnas[0] ?? "", operador, desplazamientoAnios);
  return sugerencia.length <= MENSAJE_REGLA_MAXIMO ? sugerencia : mensajeSugeridoAnioVentana("", operador, desplazamientoAnios);
}

// Sugerencia de `ANIO_DENTRO_DE_RANGO_VENTANA` (depende solo de las columnas), o `null` si la regla
// es de otro tipo.
export function sugerenciaAnioRango(regla: ReglaValidacionEditable): string | null {
  if (!configuracionAnioRangoEditable(regla)) return null;
  return mensajeSugeridoAnioRango(regla.columnas);
}

// Sugerencia de mensaje del tipo de la regla, o `null` si su tipo no tiene sugerencia.
function sugerenciaMensaje(regla: ReglaValidacionEditable): string | null {
  return sugerenciaAnioVentana(regla) ?? sugerenciaAnioRango(regla);
}

// Campos que se derivan del resto al editar una regla:
// - las columnas de la comparación de fechas;
// - la sugerencia de mensaje de `COMPARACION_ANIO_VENTANA` y `ANIO_DENTRO_DE_RANGO_VENTANA`, que
//   solo reemplaza un mensaje vacío o que sigue siendo la sugerencia anterior (nunca pisa un
//   mensaje escrito por quien configura);
// - al pasar a un tipo sin sugerencia, un mensaje que sigue siendo la sugerencia se vacía: sus
//   marcadores solo se reemplazan en esos tipos, en otro se verían literales.
export function aplicarCamposDerivados(
  anterior: ReglaValidacionEditable,
  cambios: Partial<ReglaValidacionEditable>,
): ReglaValidacionEditable {
  const actualizada = { ...anterior, ...cambios };

  if (actualizada.tipo === "FECHA_POSTERIOR_O_IGUAL" && esConfiguracionComparacionFechas(actualizada.configuracion)) {
    actualizada.columnas = columnasComparacionFechas(actualizada.configuracion).filter(Boolean);
  }

  if (cambios.mensaje !== undefined) return actualizada;

  const mensajeAnterior = anterior.mensaje.trim();
  const sugerenciaAnterior = sugerenciaMensaje(anterior);
  const mensajeEraSugerencia = sugerenciaAnterior !== null && mensajeAnterior === sugerenciaAnterior;
  const sugerencia = sugerenciaMensaje(actualizada);

  if (sugerencia !== null) {
    if (mensajeAnterior === "" || mensajeEraSugerencia) actualizada.mensaje = sugerencia;
  } else if (mensajeEraSugerencia) {
    actualizada.mensaje = "";
  }

  return actualizada;
}
