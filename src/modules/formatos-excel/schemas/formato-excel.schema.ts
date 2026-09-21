import { z } from "zod";
import {
  TIPOS_DATO_COLUMNA,
  TIPOS_REGLA_VALIDACION,
} from "@/modules/formatos-excel/domain/entities/FormatoExcel";

export const tipoDatoColumnaSchema = z.enum(TIPOS_DATO_COLUMNA);
export const tipoReglaValidacionSchema = z.enum(TIPOS_REGLA_VALIDACION);

const NOMBRE_MAXIMO = 150;
const DESCRIPCION_MAXIMA = 1000;
// Tope de seguridad: sin él, un arreglo enorme construido a mano contra la API llegaría entero
// a la base de datos en un solo INSERT.
const COLUMNAS_MAXIMO = 500;
const REGLAS_MAXIMO = 100;
const MENSAJE_REGLA_MAXIMO = 300;
// Con 1 sola columna la regla sería redundante con marcarla `requerida` directamente.
const MINIMO_COLUMNAS_POR_REGLA = 2;

const columnaFormatoExcelSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre de la columna no puede estar vacío"),
  requerida: z.boolean(),
  tipoDato: tipoDatoColumnaSchema,
});

function nombresDeColumnaUnicos(columnas: { nombre: string }[]): boolean {
  const vistos = new Set(columnas.map((columna) => columna.nombre.trim().toLowerCase()));
  return vistos.size === columnas.length;
}

const columnasFormatoExcelSchema = z
  .array(columnaFormatoExcelSchema)
  .min(1, "Debes definir al menos una columna")
  .max(COLUMNAS_MAXIMO, `Se permiten como máximo ${COLUMNAS_MAXIMO} columnas`)
  .refine(nombresDeColumnaUnicos, "Los nombres de columna no pueden repetirse");

// Cuatro tipos de regla (ver `TIPOS_REGLA_VALIDACION` en `domain/entities/FormatoExcel.ts`):
// `ALGUNA_COLUMNA_CON_VALOR` exige un conjunto de columnas del que al menos una debe traer valor;
// `FECHA_DENTRO_DE_VENTANA_VIGENTE` exige exactamente una columna de tipo `FECHA`/`FECHA_HORA`
// cuyo valor debe caer dentro de la ventana de carga elegida por el notificador (RF-15);
// `FECHA_EFECTIVA_DENTRO_DEL_ANIO_VENTANA` exige una columna principal + al menos una alternativa
// (todas `FECHA`/`FECHA_HORA`) cuya "fecha efectiva" resultante debe caer dentro del AÑO
// calendario de esa ventana (ampliación posterior); `FILA_DUPLICADA` exige al menos una columna
// (sin restricción de tipo de dato) cuya combinación de valores no puede repetirse entre filas del
// mismo archivo (ampliación posterior). El evaluador que las ejecuta contra un archivo real vive
// en `modules/reporte-excel/`; aquí solo se persiste y valida la configuración.
const reglaValidacionFormatoExcelSchema = z.object({
  tipo: tipoReglaValidacionSchema,
  columnas: z
    .array(z.string().trim().min(1))
    .min(1, "Selecciona al menos una columna")
    .refine(
      // Comparación case-insensitive: mismo criterio que `nombresDeColumnaUnicos` y
      // `validarReferenciasDeReglas` en este mismo archivo, para que "Fecha_Ingreso" y
      // "fecha_ingreso" cuenten como la misma columna y no pasen el mínimo de forma engañosa.
      (columnas) =>
        new Set(columnas.map((columna) => columna.toLowerCase())).size === columnas.length,
      "No repitas la misma columna dentro de una regla",
    ),
  mensaje: z
    .string()
    .trim()
    .min(1, "Ingresa un mensaje de rechazo")
    .max(MENSAJE_REGLA_MAXIMO, `El mensaje no puede superar los ${MENSAJE_REGLA_MAXIMO} caracteres`),
});

// El `orden` NO viaja en el esquema: siempre lo fija el servidor por la posición del elemento en
// el arreglo, igual que con las columnas.
const reglasValidacionFormatoExcelSchema = z
  .array(reglaValidacionFormatoExcelSchema)
  .max(REGLAS_MAXIMO, `Se permiten como máximo ${REGLAS_MAXIMO} reglas`)
  .default([]);

// El `orden` NO viaja en el esquema: siempre lo fija el servidor por la posición del elemento en
// el arreglo, nunca un valor que envíe el cliente.
const camposFormatoExcelSchema = {
  nombre: z
    .string()
    .trim()
    .min(1, "Ingresa un nombre")
    .max(NOMBRE_MAXIMO, `El nombre no puede superar los ${NOMBRE_MAXIMO} caracteres`),
  descripcion: z
    .string()
    .trim()
    .max(DESCRIPCION_MAXIMA, `La descripción no puede superar los ${DESCRIPCION_MAXIMA} caracteres`)
    .nullable()
    .optional()
    .transform((valor) => (valor && valor.length > 0 ? valor : null)),
  columnas: columnasFormatoExcelSchema,
  reglasValidacion: reglasValidacionFormatoExcelSchema,
};

// Tipos de columna admitidos por `FECHA_DENTRO_DE_VENTANA_VIGENTE` y por
// `FECHA_EFECTIVA_DENTRO_DEL_ANIO_VENTANA`: ambas reglas comparan la celda como fecha, así que la
// columna referenciada debe ser una de las dos que el sistema sabe parsear como tal.
const TIPOS_DATO_FECHA: readonly string[] = ["FECHA", "FECHA_HORA"];

// Principal + al menos una alternativa (ver convención de `columnas[]` en
// `domain/entities/FormatoExcel.ts`), sin tope fijo de alternativas.
const MINIMO_COLUMNAS_FECHA_EFECTIVA = 2;

// Las columnas referenciadas por cada regla deben existir entre las columnas del mismo payload
// (comparación case-insensitive, mismo criterio que `nombresDeColumnaUnicos` usa para la
// unicidad de nombres de columna), y cada tipo de regla exige su propia cantidad y tipo de
// columnas. Compartida entre creación y edición: en ambos casos las columnas viajan en el mismo
// payload que las reglas.
function validarReferenciasDeReglas(
  datos: {
    columnas: { nombre: string; tipoDato: string }[];
    reglasValidacion: { tipo: string; columnas: string[] }[];
  },
  contexto: z.RefinementCtx,
): void {
  const columnasPorNombre = new Map(
    datos.columnas.map((columna) => [columna.nombre.trim().toLowerCase(), columna]),
  );

  datos.reglasValidacion.forEach((regla, indiceRegla) => {
    regla.columnas.forEach((nombreColumna, indiceColumna) => {
      if (!columnasPorNombre.has(nombreColumna.trim().toLowerCase())) {
        contexto.addIssue({
          code: "custom",
          path: ["reglasValidacion", indiceRegla, "columnas", indiceColumna],
          message: `La regla ${indiceRegla + 1} hace referencia a una columna que no existe en este formato: "${nombreColumna}"`,
        });
      }
    });

    // `FILA_DUPLICADA` NO hereda este mínimo de 2: con 1 sola columna la regla es perfectamente
    // válida (p. ej. detectar un RUT repetido dentro del archivo), así que se queda con el mínimo
    // genérico de 1 que ya exige `reglaValidacionFormatoExcelSchema.columnas`, sin restricción
    // adicional aquí.
    if (regla.tipo === "ALGUNA_COLUMNA_CON_VALOR" && regla.columnas.length < MINIMO_COLUMNAS_POR_REGLA) {
      contexto.addIssue({
        code: "custom",
        path: ["reglasValidacion", indiceRegla, "columnas"],
        message: `La regla ${indiceRegla + 1} debe tener al menos ${MINIMO_COLUMNAS_POR_REGLA} columnas`,
      });
    }

    if (regla.tipo === "FECHA_DENTRO_DE_VENTANA_VIGENTE") {
      if (regla.columnas.length !== 1) {
        contexto.addIssue({
          code: "custom",
          path: ["reglasValidacion", indiceRegla, "columnas"],
          message: `La regla ${indiceRegla + 1} debe tener exactamente una columna`,
        });
      } else {
        const columna = columnasPorNombre.get(regla.columnas[0].trim().toLowerCase());

        if (columna && !TIPOS_DATO_FECHA.includes(columna.tipoDato)) {
          contexto.addIssue({
            code: "custom",
            path: ["reglasValidacion", indiceRegla, "columnas", 0],
            message: `La regla ${indiceRegla + 1} exige una columna de tipo FECHA o FECHA_HORA`,
          });
        }
      }
    }

    if (regla.tipo === "FECHA_EFECTIVA_DENTRO_DEL_ANIO_VENTANA") {
      if (regla.columnas.length < MINIMO_COLUMNAS_FECHA_EFECTIVA) {
        contexto.addIssue({
          code: "custom",
          path: ["reglasValidacion", indiceRegla, "columnas"],
          message: `La regla ${indiceRegla + 1} debe tener una columna principal y al menos una columna alternativa`,
        });
      }

      // Todas las columnas referenciadas (principal Y alternativas) deben ser de tipo fecha, no
      // solo `columnas[0]` como en `FECHA_DENTRO_DE_VENTANA_VIGENTE`.
      regla.columnas.forEach((nombreColumna, indiceColumna) => {
        const columna = columnasPorNombre.get(nombreColumna.trim().toLowerCase());

        if (columna && !TIPOS_DATO_FECHA.includes(columna.tipoDato)) {
          contexto.addIssue({
            code: "custom",
            path: ["reglasValidacion", indiceRegla, "columnas", indiceColumna],
            message: `La regla ${indiceRegla + 1} exige que todas sus columnas sean de tipo FECHA o FECHA_HORA`,
          });
        }
      });
    }
  });
}

export const crearFormatoExcelSchema = z.object(camposFormatoExcelSchema).superRefine(validarReferenciasDeReglas);
export type CrearFormatoExcelInput = z.infer<typeof crearFormatoExcelSchema>;

// La creación y la edición comparten exactamente los mismos campos (la plantilla no se
// reemplaza al editar, así que no forma parte de este esquema en ningún caso).
export const editarFormatoExcelSchema = z.object(camposFormatoExcelSchema).superRefine(validarReferenciasDeReglas);
export type EditarFormatoExcelInput = z.infer<typeof editarFormatoExcelSchema>;

export const cambiarEstadoFormatoExcelSchema = z.object({ activo: z.boolean() });
export type CambiarEstadoFormatoExcelInput = z.infer<typeof cambiarEstadoFormatoExcelSchema>;
