import type { ConfiguracionComparacionFechas, FuenteFecha } from "@/modules/formatos-excel/domain/entities/FormatoExcel";
import type { ValorCeldaArchivo } from "@/modules/reporte-excel/domain/entities/CargaArchivo";
import { celdaVacia, parsearFecha } from "./ValidadoresTipoDato";

type FechaResuelta = { estado: "VACIA" } | { estado: "INVALIDA" } | { estado: "VALIDA"; diaCalendario: number };
function resolverFecha(fuente: FuenteFecha, fila: Record<string, ValorCeldaArchivo>): FechaResuelta {
  if (fuente.modo === "COLUMNA") {
    const valor = fila[fuente.columna] ?? null;
    if (celdaVacia(valor)) return { estado: "VACIA" };
    const fecha = parsearFecha(valor);
    return fecha ? { estado: "VALIDA", diaCalendario: Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate()) } : { estado: "INVALIDA" };
  }
  const valores = [fuente.dia, fuente.mes, fuente.anio].map((columna) => fila[columna] ?? null);
  if (valores.every(celdaVacia)) return { estado: "VACIA" };
  if (valores.some(celdaVacia)) return { estado: "INVALIDA" };
  const numeros = valores.map((valor) => typeof valor === "number" ? valor : typeof valor === "string" && /^\d+$/.test(valor.trim()) ? Number(valor.trim()) : NaN);
  const [dia, mes, anio] = numeros;
  if (!numeros.every(Number.isSafeInteger) || anio < 100 || anio > 9999 || mes < 1 || mes > 12 || dia < 1 || dia > 31) return { estado: "INVALIDA" };
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  if (fecha.getUTCFullYear() !== anio || fecha.getUTCMonth() !== mes - 1 || fecha.getUTCDate() !== dia) return { estado: "INVALIDA" };
  return { estado: "VALIDA", diaCalendario: fecha.getTime() };
}
export function cumpleComparacionFechas(configuracion: ConfiguracionComparacionFechas | null | undefined, fila: Record<string, ValorCeldaArchivo>): boolean {
  if (!configuracion) return false;
  const origen = resolverFecha(configuracion.origen, fila);
  const referencia = resolverFecha(configuracion.referencia, fila);
  if (origen.estado === "INVALIDA" || referencia.estado === "INVALIDA") return false;
  if (origen.estado === "VACIA" || referencia.estado === "VACIA") return true;
  return origen.diaCalendario >= referencia.diaCalendario;
}
