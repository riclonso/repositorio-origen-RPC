import { z } from "zod";
import {
  SEPARADORES_CSV,
  TIPOS_ARCHIVO,
  TIPOS_DATO_COLUMNA,
  TIPOS_REGLA_TODAS_LAS_COLUMNAS,
  TIPOS_REGLA_VALIDACION,
  type TipoReglaValidacion,
} from "@/modules/formatos-excel/domain/entities/FormatoExcel";
import { ETIQUETAS_TIPO_REGLA_VALIDACION } from "@/shared/utils/reglasValidacion";
import { MAXIMO_CAMBIOS_ASIGNACION_MASIVA } from "@/modules/formatos-excel/domain/entities/AsignacionFormato";
import {
  LARGO_MAXIMO_NOMBRE_ENUMERADO,
  LARGO_MAXIMO_VALOR_ENUMERADO,
  MAXIMO_TIPOS_ENUMERADOS,
  MAXIMO_VALORES_ENUMERADO,
  buscarTipoEnumeradoPorNombre,
  normalizarValorEnumerado,
} from "@/modules/formatos-excel/domain/entities/TipoEnumerado";

export const tipoDatoColumnaSchema = z.enum(TIPOS_DATO_COLUMNA);
export const tipoReglaValidacionSchema = z.enum(TIPOS_REGLA_VALIDACION);
export const tipoArchivoSchema = z.enum(TIPOS_ARCHIVO, { error: "Selecciona el tipo de archivo" });
export const separadorCsvSchema = z.enum(SEPARADORES_CSV, { error: "Selecciona un separador válido" });

// Tipo de archivo declarado + separador, compartido entre la lectura de la plantilla y la
// creación del formato. El separador es obligatorio en CSV y prohibido en EXCEL (un Excel no
// tiene separador de campos). Los valores vacíos llegan como `null` desde el multipart.
export const tipoArchivoYSeparadorSchema = z
  .object({
    tipoArchivo: tipoArchivoSchema,
    separadorCsv: separadorCsvSchema.nullable(),
  })
  .superRefine((datos, contexto) => {
    if (datos.tipoArchivo === "CSV" && datos.separadorCsv === null) {
      contexto.addIssue({ code: "custom", path: ["separadorCsv"], message: "Selecciona el separador del CSV" });
    }
    if (datos.tipoArchivo === "EXCEL" && datos.separadorCsv !== null) {
      contexto.addIssue({
        code: "custom",
        path: ["separadorCsv"],
        message: "Un archivo Excel no lleva separador",
      });
    }
  });
export type TipoArchivoYSeparadorInput = z.infer<typeof tipoArchivoYSeparadorSchema>;

const NOMBRE_MAXIMO = 150;
const DESCRIPCION_MAXIMA = 1000;
// Tope de seguridad: sin él, un arreglo enorme construido a mano contra la API llegaría entero
// a la base de datos en un solo INSERT.
const COLUMNAS_MAXIMO = 500;
const REGLAS_MAXIMO = 100;
const MENSAJE_REGLA_MAXIMO = 300;
// Con 1 sola columna la regla sería redundante con marcarla `requerida` directamente.
const MINIMO_COLUMNAS_POR_REGLA = 2;

// Saltos de línea, tabuladores y demás caracteres de control: un valor enumerado es una sola línea
// de texto visible (el textarea del editor usa un valor por línea).
const PATRON_CARACTER_CONTROL = /\p{Cc}/u;

// Nombre de un tipo enumerado. Mismo NFC + trim que sus valores, para que la comparación sin
// mayúsculas (`buscarTipoEnumeradoPorNombre`) vea exactamente lo que se guarda.
const nombreTipoEnumeradoSchema = z
  .string()
  .normalize("NFC")
  .trim()
  .min(1, "Ingresa el nombre del tipo enumerado")
  .max(LARGO_MAXIMO_NOMBRE_ENUMERADO, `El nombre del tipo enumerado no puede superar los ${LARGO_MAXIMO_NOMBRE_ENUMERADO} caracteres`)
  .refine((nombre) => !PATRON_CARACTER_CONTROL.test(nombre), "El nombre del tipo enumerado no puede tener saltos de línea");

// Se guarda tal como lo escribió el usuario, solo con NFC + trim (ver `normalizarValorEnumerado`).
const valorTipoEnumeradoSchema = z
  .string()
  .normalize("NFC")
  .trim()
  .min(1, "Los valores de un tipo enumerado no pueden estar vacíos")
  .max(LARGO_MAXIMO_VALOR_ENUMERADO, `Cada valor puede tener como máximo ${LARGO_MAXIMO_VALOR_ENUMERADO} caracteres`)
  .refine(
    (valor) => !PATRON_CARACTER_CONTROL.test(valor),
    "Los valores no pueden tener saltos de línea ni caracteres de control",
  );

export const tipoEnumeradoSchema = z
  .object({
    nombre: nombreTipoEnumeradoSchema,
    valores: z
      .array(valorTipoEnumeradoSchema)
      .min(1, "Agrega al menos un valor permitido")
      .max(MAXIMO_VALORES_ENUMERADO, `Un tipo enumerado admite como máximo ${MAXIMO_VALORES_ENUMERADO} valores`),
  })
  .superRefine((tipo, contexto) => {
    // Duplicados con la MISMA regla de comparación que se usa al validar una carga: "SI" y "si"
    // serían indistinguibles para la validación, así que no pueden convivir en la lista.
    const vistos = new Set<string>();

    tipo.valores.forEach((valor, indice) => {
      const normalizado = normalizarValorEnumerado(valor);

      if (vistos.has(normalizado)) {
        contexto.addIssue({
          code: "custom",
          path: ["valores", indice],
          message: `El tipo «${tipo.nombre}» repite el valor "${valor}" (no se distinguen mayúsculas)`,
        });
      }
      vistos.add(normalizado);
    });
  });
export type TipoEnumeradoInput = z.infer<typeof tipoEnumeradoSchema>;

export const tiposEnumeradosSchema = z
  .array(tipoEnumeradoSchema)
  .max(MAXIMO_TIPOS_ENUMERADOS, `Se permiten como máximo ${MAXIMO_TIPOS_ENUMERADOS} tipos enumerados por formato`)
  .default([])
  .superRefine((tipos, contexto) => {
    const vistos = new Set<string>();

    tipos.forEach((tipo, indice) => {
      const normalizado = normalizarValorEnumerado(tipo.nombre);

      if (vistos.has(normalizado)) {
        contexto.addIssue({
          code: "custom",
          path: [indice, "nombre"],
          message: `Ya existe un tipo enumerado llamado «${tipo.nombre}»`,
        });
      }
      vistos.add(normalizado);
    });
  });

const columnaFormatoExcelSchema = z
  .object({
    nombre: z.string().trim().min(1, "El nombre de la columna no puede estar vacío"),
    requerida: z.boolean(),
    tipoDato: tipoDatoColumnaSchema,
    // Opcional para no romper clientes que aún no lo envían; vacío u omitido equivale a `null`.
    tipoEnumeradoNombre: z
      .string()
      .normalize("NFC")
      .trim()
      .max(LARGO_MAXIMO_NOMBRE_ENUMERADO, "El nombre del tipo enumerado es demasiado largo")
      .nullish()
      .transform((valor) => (valor && valor.length > 0 ? valor : null)),
  })
  .superRefine((columna, contexto) => {
    // Invariante `tipoDato = ENUMERADO` ⇔ `tipoEnumeradoNombre` no nulo (también CHECK en BD).
    if (columna.tipoDato === "ENUMERADO" && columna.tipoEnumeradoNombre === null) {
      contexto.addIssue({
        code: "custom",
        path: ["tipoEnumeradoNombre"],
        message: `Selecciona el tipo enumerado de la columna "${columna.nombre}"`,
      });
    }

    if (columna.tipoDato !== "ENUMERADO" && columna.tipoEnumeradoNombre !== null) {
      contexto.addIssue({
        code: "custom",
        path: ["tipoEnumeradoNombre"],
        message: `La columna "${columna.nombre}" solo puede indicar un tipo enumerado si su tipo de dato es enumerado`,
      });
    }
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

// Tipos de regla (ver `TIPOS_REGLA_VALIDACION` en `domain/entities/FormatoExcel.ts`):
// `ALGUNA_COLUMNA_CON_VALOR` exige un conjunto de columnas del que al menos una debe traer valor;
// `FECHA_EFECTIVA_DENTRO_DEL_ANIO_VENTANA` exige una columna principal + al menos una alternativa
// (todas `FECHA`) cuya "fecha efectiva" resultante debe caer dentro del AÑO
// calendario de esa ventana (ampliación posterior); `FILA_DUPLICADA` exige al menos una columna
// (sin restricción de tipo de dato) cuya combinación de valores no puede repetirse entre filas del
// mismo archivo (ampliación posterior). El evaluador que las ejecuta contra un archivo real vive
// en `modules/reporte-excel/`; aquí solo se persiste y valida la configuración.
export const fuenteFechaSchema = z.discriminatedUnion("modo", [
 z.strictObject({ modo: z.literal("COLUMNA"), columna: z.string().trim().min(1) }),
 z.strictObject({ modo: z.literal("COMPONENTES"), dia: z.string().trim().min(1), mes: z.string().trim().min(1), anio: z.string().trim().min(1) }),
]);
export const configuracionComparacionFechasSchema = z.strictObject({ origen: fuenteFechaSchema, referencia: fuenteFechaSchema });

const reglaValidacionFormatoExcelSchema = z.object({
  configuracion: configuracionComparacionFechasSchema.nullish(),
  tipo: tipoReglaValidacionSchema,
  columnas: z
    .array(z.string().trim().min(1, "Selecciona todas las columnas de la regla")).default([])
    // Sin mínimo genérico aquí (RF-32): `CONTENIDO_HTML` y `FILA_VACIA` exigen `[]`, así que la
    // cardinalidad depende del tipo y se valida en `validarReferenciasDeReglas`.
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
}).superRefine((regla, contexto) => {
  if ((regla.tipo === "FECHA_POSTERIOR_O_IGUAL") !== Boolean(regla.configuracion)) {
    contexto.addIssue({ code: "custom", path: ["configuracion"], message: "Define las dos fechas únicamente para la regla de comparación de fechas" });
  }
}).transform((regla) => ({ ...regla, columnas: regla.tipo === "FECHA_POSTERIOR_O_IGUAL" && regla.configuracion
  ? [...new Set([regla.configuracion.origen, regla.configuracion.referencia].flatMap((fuente) => fuente.modo === "COLUMNA" ? [fuente.columna] : [fuente.dia, fuente.mes, fuente.anio]))]
  : regla.columnas }));

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
  // `.default([])`: un cliente que no lo envía (formatos sin enumerados) sigue siendo válido.
  tiposEnumerados: tiposEnumeradosSchema,
};

// Tipos de columna admitidos por `FECHA_EFECTIVA_DENTRO_DEL_ANIO_VENTANA`: compara la celda como
// fecha, así que la columna referenciada debe ser una que el sistema sabe parsear como tal.
const TIPOS_DATO_FECHA: readonly string[] = ["FECHA"];

// Principal + al menos una alternativa (ver convención de `columnas[]` en
// `domain/entities/FormatoExcel.ts`), sin tope fijo de alternativas.
const MINIMO_COLUMNAS_FECHA_EFECTIVA = 2;

// RUT completo en una columna, o número + dígito verificador en dos (convención de `columnas[]`
// en `domain/entities/FormatoExcel.ts`).
const MINIMO_COLUMNAS_RUT = 1;
const MAXIMO_COLUMNAS_RUT = 2;

function esTipoTodasLasColumnas(tipo: string): boolean {
  return (TIPOS_REGLA_TODAS_LAS_COLUMNAS as readonly string[]).includes(tipo);
}

// Nombre visible del tipo (el mismo del selector del editor), nunca el código del enum.
function etiquetaTipoRegla(tipo: string): string {
  return ETIQUETAS_TIPO_REGLA_VALIDACION[tipo as TipoReglaValidacion] ?? tipo;
}

// Las columnas referenciadas por cada regla deben existir entre las columnas del mismo payload
// (comparación case-insensitive, mismo criterio que `nombresDeColumnaUnicos` usa para la
// unicidad de nombres de columna), y cada tipo de regla exige su propia cantidad y tipo de
// columnas. Compartida entre creación y edición: en ambos casos las columnas viajan en el mismo
// payload que las reglas.
function validarReferenciasDeReglas(
  datos: {
    columnas: { nombre: string; tipoDato: string }[];
    reglasValidacion: { tipo: string; columnas: string[]; configuracion?: import("@/modules/formatos-excel/domain/entities/FormatoExcel").ConfiguracionComparacionFechas | null }[];
  },
  contexto: z.RefinementCtx,
): void {
  const columnasPorNombre = new Map(
    datos.columnas.map((columna) => [columna.nombre.trim().toLowerCase(), columna]),
  );

  // RF-32: como máximo una regla de cada tipo "todas las columnas" por formato; dos reglas iguales
  // duplicarían cada error del informe.
  const tiposTodasLasColumnasVistos = new Set<string>();

  datos.reglasValidacion.forEach((regla, indiceRegla) => {
    if (esTipoTodasLasColumnas(regla.tipo)) {
      if (regla.columnas.length > 0) {
        contexto.addIssue({
          code: "custom",
          path: ["reglasValidacion", indiceRegla, "columnas"],
          message: `La regla ${indiceRegla + 1} se aplica a todas las columnas y no admite columnas`,
        });
      }

      if (tiposTodasLasColumnasVistos.has(regla.tipo)) {
        contexto.addIssue({
          code: "custom",
          path: ["reglasValidacion", indiceRegla, "tipo"],
          message: `Ya existe una regla «${etiquetaTipoRegla(regla.tipo)}» en este formato`,
        });
      }
      tiposTodasLasColumnasVistos.add(regla.tipo);
      return;
    }

    if (regla.tipo === "FECHA_POSTERIOR_O_IGUAL" && regla.configuracion) {
      for (const [lado, fuente] of Object.entries(regla.configuracion)) {
        const nombres = fuente.modo === "COLUMNA" ? [fuente.columna] : [fuente.dia, fuente.mes, fuente.anio];
        if (new Set(nombres.map((nombre) => nombre.toLowerCase())).size !== nombres.length) {
          contexto.addIssue({ code: "custom", path: ["reglasValidacion", indiceRegla, "configuracion", lado], message: "Día, mes y año deben usar columnas distintas" });
        }
        for (const nombre of nombres) {
          const columna = columnasPorNombre.get(nombre.toLowerCase());
          if (!columna || columna.tipoDato !== (fuente.modo === "COLUMNA" ? "FECHA" : "ENTERO")) {
            contexto.addIssue({ code: "custom", path: ["reglasValidacion", indiceRegla, "configuracion", lado], message: "Selecciona columnas existentes de tipo Fecha o componentes de tipo Entero" });
          }
        }
      }
    }

    // Los demás tipos siguen exigiendo al menos una columna (antes vivía en
    // `reglaValidacionFormatoExcelSchema.columnas`; mismo mensaje y sin cambio de comportamiento).
    if (regla.columnas.length === 0) {
      contexto.addIssue({
        code: "custom",
        path: ["reglasValidacion", indiceRegla, "columnas"],
        message: "Selecciona al menos una columna",
      });
    }

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
    // genérico de 1 que se exige más arriba en esta misma función, sin restricción adicional aquí.
    if (regla.tipo === "ALGUNA_COLUMNA_CON_VALOR" && regla.columnas.length < MINIMO_COLUMNAS_POR_REGLA) {
      contexto.addIssue({
        code: "custom",
        path: ["reglasValidacion", indiceRegla, "columnas"],
        message: `La regla ${indiceRegla + 1} debe tener al menos ${MINIMO_COLUMNAS_POR_REGLA} columnas`,
      });
    }

    // `RUT_VALIDO`: 1 columna (RUT completo) o 2 (número + dígito verificador), sin restricción
    // de tipo de dato: el RUT puede venir como texto o como número en un Excel.
    if (
      regla.tipo === "RUT_VALIDO" &&
      (regla.columnas.length < MINIMO_COLUMNAS_RUT || regla.columnas.length > MAXIMO_COLUMNAS_RUT)
    ) {
      contexto.addIssue({
        code: "custom",
        path: ["reglasValidacion", indiceRegla, "columnas"],
        message: `La regla ${indiceRegla + 1} debe tener una columna con el RUT completo, o dos columnas: número y dígito verificador`,
      });
    }

    if (regla.tipo === "FECHA_EFECTIVA_DENTRO_DEL_ANIO_VENTANA") {
      if (regla.columnas.length < MINIMO_COLUMNAS_FECHA_EFECTIVA) {
        contexto.addIssue({
          code: "custom",
          path: ["reglasValidacion", indiceRegla, "columnas"],
          message: `La regla ${indiceRegla + 1} debe tener una columna principal y al menos una columna alternativa`,
        });
      }

      // Todas las columnas referenciadas (principal Y alternativas) deben ser de tipo fecha.
      regla.columnas.forEach((nombreColumna, indiceColumna) => {
        const columna = columnasPorNombre.get(nombreColumna.trim().toLowerCase());

        if (columna && !TIPOS_DATO_FECHA.includes(columna.tipoDato)) {
          contexto.addIssue({
            code: "custom",
            path: ["reglasValidacion", indiceRegla, "columnas", indiceColumna],
            message: `La regla ${indiceRegla + 1} exige que todas sus columnas sean de tipo Fecha`,
          });
        }
      });
    }
  });
}

// Cada columna `ENUMERADO` debe apuntar a un tipo enumerado definido en el MISMO payload
// (comparación sin mayúsculas, `buscarTipoEnumeradoPorNombre`). Los tipos que ninguna columna usa
// se permiten.
function validarReferenciasDeTiposEnumerados(
  datos: {
    columnas: { nombre: string; tipoEnumeradoNombre: string | null }[];
    tiposEnumerados: { nombre: string }[];
  },
  contexto: z.RefinementCtx,
): void {
  datos.columnas.forEach((columna, indice) => {
    if (columna.tipoEnumeradoNombre === null) return;

    if (!buscarTipoEnumeradoPorNombre(datos.tiposEnumerados, columna.tipoEnumeradoNombre)) {
      contexto.addIssue({
        code: "custom",
        path: ["columnas", indice, "tipoEnumeradoNombre"],
        message: `La columna "${columna.nombre}" usa un tipo enumerado que no existe: "${columna.tipoEnumeradoNombre}"`,
      });
    }
  });
}

function validarReferenciasDelFormato(
  datos: Parameters<typeof validarReferenciasDeReglas>[0] & Parameters<typeof validarReferenciasDeTiposEnumerados>[0],
  contexto: z.RefinementCtx,
): void {
  validarReferenciasDeReglas(datos, contexto);
  validarReferenciasDeTiposEnumerados(datos, contexto);
}

function normalizarFuentesFechas<T extends { columnas: { nombre: string }[]; reglasValidacion: { configuracion?: import("@/modules/formatos-excel/domain/entities/FormatoExcel").ConfiguracionComparacionFechas | null; columnas: string[] }[] }>(datos: T): T {
  const nombres = new Map(datos.columnas.map((columna) => [columna.nombre.toLowerCase(), columna.nombre]));
  for (const regla of datos.reglasValidacion) {
    if (!regla.configuracion) continue;
    for (const fuente of [regla.configuracion.origen, regla.configuracion.referencia]) {
      if (fuente.modo === "COLUMNA") fuente.columna = nombres.get(fuente.columna.toLowerCase()) ?? fuente.columna;
      else for (const campo of ["dia", "mes", "anio"] as const) fuente[campo] = nombres.get(fuente[campo].toLowerCase()) ?? fuente[campo];
    }
    regla.columnas = [...new Set([regla.configuracion.origen, regla.configuracion.referencia].flatMap((fuente) => fuente.modo === "COLUMNA" ? [fuente.columna] : [fuente.dia, fuente.mes, fuente.anio]))];
  }
  return datos;
}
export const crearFormatoExcelSchema = z.object(camposFormatoExcelSchema).superRefine(validarReferenciasDelFormato).transform(normalizarFuentesFechas);
export type CrearFormatoExcelInput = z.infer<typeof crearFormatoExcelSchema>;

// La edición comparte los campos de la creación (la plantilla no se reemplaza al editar) y agrega
// el separador CSV, editable. `tipoArchivo` NO viaja: es inmutable. Si `separadorCsv` se omite se
// conserva el actual; su coherencia con el `tipoArchivo` persistido se valida en
// `ActualizarFormatoExcel`, que es quien lo conoce.
export const editarFormatoExcelSchema = z
  .object({ ...camposFormatoExcelSchema, separadorCsv: separadorCsvSchema.nullable().optional() })
  .superRefine(validarReferenciasDelFormato).transform(normalizarFuentesFechas);
export type EditarFormatoExcelInput = z.infer<typeof editarFormatoExcelSchema>;

export const cambiarEstadoFormatoExcelSchema = z.object({ activo: z.boolean() });
export type CambiarEstadoFormatoExcelInput = z.infer<typeof cambiarEstadoFormatoExcelSchema>;

function sinRepetidos(ids: string[]): boolean {
  return new Set(ids).size === ids.length;
}

const idsUsuariosLoteSchema = z
  .array(z.uuid("Identificador de usuario inválido"))
  .default([])
  .refine(sinRepetidos, "No repitas un usuario dentro del mismo lote");

// Asignación masiva de un formato: solo la DIFERENCIA respecto del estado mostrado. Compartido
// entre el Route Handler y el modal (`ModalAsignarFormatoUsuarios`), que lo usa para no enviar un
// lote que el servidor rechazaría.
export const asignacionMasivaFormatoSchema = z
  .object({ agregarIds: idsUsuariosLoteSchema, quitarIds: idsUsuariosLoteSchema })
  .superRefine((datos, contexto) => {
    const agregar = new Set(datos.agregarIds);
    if (datos.quitarIds.some((id) => agregar.has(id))) {
      contexto.addIssue({
        code: "custom",
        path: ["quitarIds"],
        message: "Un mismo usuario no puede agregarse y quitarse en el mismo lote",
      });
    }

    const total = datos.agregarIds.length + datos.quitarIds.length;
    if (total === 0) {
      contexto.addIssue({ code: "custom", message: "No hay cambios que guardar" });
    } else if (total > MAXIMO_CAMBIOS_ASIGNACION_MASIVA) {
      contexto.addIssue({
        code: "custom",
        message: `Se permiten como máximo ${MAXIMO_CAMBIOS_ASIGNACION_MASIVA} cambios por lote`,
      });
    }
  });
export type AsignacionMasivaFormatoInput = z.infer<typeof asignacionMasivaFormatoSchema>;
