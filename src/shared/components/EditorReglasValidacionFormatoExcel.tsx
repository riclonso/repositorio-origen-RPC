"use client";

import {
  ANIOS_RANGO_MAXIMO,
  ANIOS_RANGO_MINIMO,
  DESPLAZAMIENTO_ANIOS_MAXIMO,
  DESPLAZAMIENTO_ANIOS_MINIMO,
  esConfiguracionComparacionFechas,
  MARCADOR_ANIO_DESDE,
  MARCADOR_ANIO_HASTA,
  MARCADOR_ANIO_VENTANA,
  TIPOS_REGLA_TODAS_LAS_COLUMNAS,
  TIPOS_REGLA_VALIDACION,
  type OperadorComparacionFechas,
  type TipoReglaValidacion,
} from "@/modules/formatos-excel/domain/entities/FormatoExcel";
import { ETIQUETAS_TIPO_REGLA_VALIDACION, OPCIONES_OPERADOR_COMPARACION } from "@/shared/utils/reglasValidacion";
import {
  aplicarCamposDerivados,
  CONFIGURACION_COMPARACION_FECHAS_INICIAL,
  configuracionAnioRangoEditable,
  configuracionAnioVentanaEditable,
  configuracionInicial,
  conDesplazamientoAnios,
  errorAniosRango,
  errorDesplazamientoAnios,
  MENSAJE_REGLA_MAXIMO,
  type ReglaValidacionEditable,
} from "@/shared/utils/edicionReglasValidacion";
import type { OpcionSelect } from "@/shared/components/CampoSelect";
import { CampoSelect } from "@/shared/components/CampoSelect";
import { CampoSeleccionMultiple } from "@/shared/components/CampoSeleccionMultiple";
import { CampoEntero } from "@/shared/components/CampoEntero";
import { CampoTexto } from "@/shared/components/CampoTexto";
import { BotonIcono } from "@/shared/components/BotonIcono";
import { Boton } from "@/shared/components/Boton";
import { IconoEliminar } from "@/shared/components/iconos";
import { EditorColumnasReglaRut, type ModoReglaRut } from "@/shared/components/EditorColumnasReglaRut";
import { EditorComparacionFechas } from "@/shared/components/EditorComparacionFechas";

// Se reexporta: el asistente y el formulario de edición lo importan desde este componente.
export type { ReglaValidacionEditable };

// Sin modo explícito (p. ej. una regla ya guardada que se abre para editar), se deduce de la
// cantidad de columnas: la convención de `columnas[]` de `RUT_VALIDO` es 1 = RUT completo,
// 2 = número + dígito verificador.
function modoReglaRut(regla: ReglaValidacionEditable): ModoReglaRut {
  return regla.modoRut ?? (regla.columnas.length === 2 ? "NUMERO_Y_DV" : "COMPLETO");
}

// Columna del formato, tal como la ve este editor: solo lo necesario para listar nombres y
// filtrar por tipo de dato (RF-15).
export type ColumnaDisponible = { nombre: string; tipoDato: string };

// Tipos de dato que `COMPARACION_ANIO_VENTANA` puede evaluar: compara la celda como
// fecha, así que solo tiene sentido ofrecer columnas que el sistema sabe parsear como tal.
const TIPOS_DATO_FECHA = new Set(["FECHA"]);

// Mismo orden que `TIPOS_REGLA_VALIDACION`, con las etiquetas compartidas con los mensajes del
// esquema (`shared/utils/reglasValidacion.ts`).
const OPCIONES_TIPO_REGLA: OpcionSelect[] = TIPOS_REGLA_VALIDACION.map((tipo) => ({
  valor: tipo,
  etiqueta: ETIQUETAS_TIPO_REGLA_VALIDACION[tipo],
}));

// RF-32: tipos que se aplican a todas las columnas (sin selector) y admiten como máximo una regla
// por formato. La garantía real es el esquema del servidor; aquí solo se ocultan del selector.
const TIPOS_UNICOS_POR_FORMATO = new Set<string>(TIPOS_REGLA_TODAS_LAS_COLUMNAS);

// Opciones del selector de tipo para una regla: oculta los tipos únicos ya usados por OTRA regla
// del formato; la regla actual siempre conserva su propio valor.
function opcionesTipoRegla(reglas: ReglaValidacionEditable[], indiceActual: number): OpcionSelect[] {
  const tiposUnicosEnOtrasReglas = new Set<string>(
    reglas
      .filter((regla, indice) => indice !== indiceActual && TIPOS_UNICOS_POR_FORMATO.has(regla.tipo))
      .map((regla) => regla.tipo),
  );

  return OPCIONES_TIPO_REGLA.filter((opcion) => !tiposUnicosEnOtrasReglas.has(opcion.valor));
}

const AYUDA_REGLA_TODAS_LAS_COLUMNAS: Partial<Record<TipoReglaValidacion, string>> = {
  CONTENIDO_HTML: [
    "Se revisan todas las columnas del formato.",
    "Rechaza celdas con etiquetas HTML (p. ej. <p>, <a>, <br>) o entidades (p. ej. &nbsp;, &amp;).",
    "Textos como «<5 años» o «A & B» se permiten.",
  ].join(" "),
  FILA_VACIA: [
    "Rechaza toda fila sin ningún dato que esté entre filas con datos.",
    "Las filas vacías al final del archivo se ignoran.",
  ].join(" "),
};

const REGLA_POR_DEFECTO: ReglaValidacionEditable = {
  tipo: "ALGUNA_COLUMNA_CON_VALOR",
  columnas: [],
  mensaje: "",
};

// Tope de seguridad, igual que `REGLAS_MAXIMO` en `schemas/formato-excel.schema.ts`: deshabilita
// "Agregar regla" antes de que el envío llegue a rechazarse en el servidor.
const REGLAS_MAXIMO = 100;

function columnaExiste(nombreColumna: string, nombresDisponibles: string[]): boolean {
  const buscado = nombreColumna.trim().toLowerCase();
  return nombresDisponibles.some((nombre) => nombre.trim().toLowerCase() === buscado);
}

type EditorReglasValidacionFormatoExcelProps = {
  reglas: ReglaValidacionEditable[];
  columnasDisponibles: ColumnaDisponible[];
  onCambiar: (reglas: ReglaValidacionEditable[]) => void;
  error?: string | null;
};

// Un formato puede tener varias reglas. `ALGUNA_COLUMNA_CON_VALOR`: de un subconjunto de
// columnas, al menos una debe traer valor; si todas vienen vacías, se rechaza.
// `FILA_DUPLICADA` (ampliación posterior): de un subconjunto de columnas (cualquier tipo de
// dato), ninguna fila puede repetir exactamente los mismos valores (comparados tras recortar
// espacios, distinguiendo mayúsculas de minúsculas) que otra fila anterior del mismo archivo; solo
// se rechaza la 2ª aparición en adelante, y las filas con esas columnas totalmente vacías quedan
// excluidas del chequeo. `CONTENIDO_HTML` y `FILA_VACIA` (RF-32) se aplican a todas las
// columnas (`columnas: []`), sin selector, y solo puede haber una de cada una. Los campos
// requeridos de `TablaColumnasFormatoExcel` se validan primero; estas reglas se evalúan después
// (ver `CLAUDE.md`), pero ese evaluador vive en `modules/reporte-excel/`: este componente solo
// gestiona la configuración.
export function EditorReglasValidacionFormatoExcel({
  reglas,
  columnasDisponibles,
  onCambiar,
  error,
}: EditorReglasValidacionFormatoExcelProps) {
  function actualizarRegla(indice: number, cambios: Partial<ReglaValidacionEditable>) {
    onCambiar(reglas.map((regla, i) => (i === indice ? aplicarCamposDerivados(regla, cambios) : regla)));
  }

  function agregarRegla() {
    onCambiar([...reglas, { ...REGLA_POR_DEFECTO }]);
  }

  function eliminarRegla(indice: number) {
    onCambiar(reglas.filter((_, i) => i !== indice));
  }

  const nombresColumnasDisponibles = columnasDisponibles.map((columna) => columna.nombre);
  const opcionesColumnas = nombresColumnasDisponibles.map((nombre) => ({ valor: nombre, etiqueta: nombre }));
  const opcionesColumnasFecha = columnasDisponibles
    .filter((columna) => TIPOS_DATO_FECHA.has(columna.tipoDato))
    .map((columna) => ({ valor: columna.nombre, etiqueta: columna.nombre }));

  return (
    <div className="flex flex-col gap-3">
      <div>
        <span className="text-sm font-medium text-gob-black">Reglas de validación</span>
        <p className="text-xs text-gob-gray-a">
          &ldquo;Al menos una columna con valor&rdquo; exige que, de un conjunto de columnas, al
          menos una venga con valor en el registro; si todas vienen vacías, se rechaza.
          &ldquo;Fila duplicada&rdquo; exige que, de un conjunto de columnas, ninguna
          fila repita exactamente los mismos valores que otra fila anterior del mismo archivo
          (comparación sensible a mayúsculas); solo se rechaza la 2ª aparición en adelante, y las
          filas con esas columnas totalmente vacías quedan excluidas del chequeo. &ldquo;Validar
          RUT&rdquo; comprueba el dígito verificador del RUT, ya sea completo en una columna o
          repartido en número y dígito verificador. &ldquo;Sin contenido HTML en las
          celdas&rdquo; rechaza celdas con etiquetas o entidades HTML, revisando todas las
          columnas. &ldquo;Sin filas vacías entre filas con datos&rdquo; rechaza las filas sin
          ningún dato que queden entre filas con datos. &ldquo;Año de una fecha comparado con el
          año de la ventana&rdquo; compara el año de una columna de fecha con el año de la ventana
          de carga (menor, menor o igual, igual, mayor o igual, o mayor), opcionalmente sumándole
          antes un ajuste en años (p. ej. 1 o -2); las celdas vacías se
          omiten, y en su mensaje puedes escribir {MARCADOR_ANIO_VENTANA} para mostrar el año de la
          ventana. &ldquo;Año de fechas dentro de un rango en torno al año de la ventana&rdquo; exige
          que el año de cada fecha de las columnas elegidas esté entre el año de la ventana menos
          los años antes y el año de la ventana más los años después (ambos extremos incluidos); las
          celdas vacías se omiten, y en su mensaje puedes escribir {MARCADOR_ANIO_VENTANA},{" "}
          {MARCADOR_ANIO_DESDE} y {MARCADOR_ANIO_HASTA}. Se evalúan después de comprobar las
          columnas requeridas.
        </p>
      </div>

      {reglas.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gob-accent bg-white px-3 py-4 text-sm text-gob-gray-a">
          Este formato no tiene reglas de validación configuradas.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {reglas.map((regla, indice) => {
            // Las posiciones vacías (columna aún sin elegir) no son columnas "faltantes".
            const columnasFaltantes = regla.columnas.filter(
              (nombreColumna) =>
                nombreColumna.length > 0 && !columnaExiste(nombreColumna, nombresColumnasDisponibles),
            );
            const configuracionAnioVentana = configuracionAnioVentanaEditable(regla) ?? { operador: "MAYOR_IGUAL" as const };
            const configuracionAnioRango = configuracionAnioRangoEditable(regla) ?? { aniosAntes: 0, aniosDespues: 0 };

            return (
              <div
                key={indice}
                className="flex flex-col gap-3 rounded-lg border border-gob-accent bg-white p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-gob-black">Regla {indice + 1}</span>
                  <BotonIcono
                    etiqueta={`Eliminar la regla ${indice + 1}`}
                    Icono={IconoEliminar}
                    tono="peligro"
                    onClick={() => eliminarRegla(indice)}
                  />
                </div>

                <CampoSelect
                  id={`regla-${indice}-tipo`}
                  etiqueta="Tipo de regla"
                  opciones={opcionesTipoRegla(reglas, indice)}
                  value={regla.tipo}
                  onChange={(evento) =>
                    // Cambiar de tipo reinicia las columnas seleccionadas: los dos tipos exigen
                    // formas distintas (conjunto vs. una sola columna de fecha), así que un
                    // arreglo heredado del tipo anterior no tendría sentido.
                    actualizarRegla(indice, {
                      tipo: evento.target.value as TipoReglaValidacion,
                      columnas: [],
                      modoRut: undefined,
                      configuracion: configuracionInicial(evento.target.value as TipoReglaValidacion),
                    })
                  }
                />

                {TIPOS_UNICOS_POR_FORMATO.has(regla.tipo) ? (
                  // Sin selector de columnas: estas reglas guardan `columnas: []` ("todas"), y
                  // cambiar de tipo ya reinicia `columnas` a `[]`.
                  <p className="text-xs text-gob-gray-a">{AYUDA_REGLA_TODAS_LAS_COLUMNAS[regla.tipo]}</p>
                ) : regla.tipo === "FECHA_POSTERIOR_O_IGUAL" ? (
                  <EditorComparacionFechas idBase={`regla-${indice}`} columnas={columnasDisponibles} configuracion={esConfiguracionComparacionFechas(regla.configuracion) ? regla.configuracion : CONFIGURACION_COMPARACION_FECHAS_INICIAL} onCambiar={(configuracion) => actualizarRegla(indice, { configuracion })} />
                ) : regla.tipo === "RUT_VALIDO" ? (
                  <EditorColumnasReglaRut
                    idBase={`regla-${indice}`}
                    modo={modoReglaRut(regla)}
                    columnas={regla.columnas}
                    opcionesColumnas={opcionesColumnas}
                    columnasFaltantes={columnasFaltantes}
                    onCambiar={(cambios) => actualizarRegla(indice, cambios)}
                  />
                ) : regla.tipo === "COMPARACION_ANIO_VENTANA" ? (
                  <>
                    <CampoSelect
                      id={`regla-${indice}-columna-anio-ventana`}
                      etiqueta="Columna de fecha"
                      opciones={[{ valor: "", etiqueta: "Selecciona una columna" }, ...opcionesColumnasFecha]}
                      value={regla.columnas[0] ?? ""}
                      onChange={(evento) => actualizarRegla(indice, { columnas: evento.target.value ? [evento.target.value] : [] })}
                      ayuda="Se compara el año de esta fecha con el año de la ventana de carga. Las celdas vacías se omiten."
                      error={
                        opcionesColumnasFecha.length === 0
                          ? "Este formato no tiene ninguna columna de tipo Fecha"
                          : columnasFaltantes.length > 0
                            ? `Hace referencia a columnas que ya no existen en este formato: ${columnasFaltantes.map((nombre) => `"${nombre}"`).join(", ")}`
                            : null
                      }
                    />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <CampoSelect
                        id={`regla-${indice}-operador-anio-ventana`}
                        etiqueta="Año de la columna respecto del año de la ventana"
                        opciones={OPCIONES_OPERADOR_COMPARACION}
                        value={configuracionAnioVentana.operador}
                        onChange={(evento) =>
                          actualizarRegla(indice, {
                            configuracion: { ...configuracionAnioVentana, operador: evento.target.value as OperadorComparacionFechas },
                          })
                        }
                      />
                      <CampoEntero
                        id={`regla-${indice}-desplazamiento-anio-ventana`}
                        etiqueta="Ajuste en años"
                        permitirNegativos
                        valor={configuracionAnioVentana.desplazamientoAnios ?? 0}
                        onCambiarValor={(ajuste) =>
                          actualizarRegla(indice, { configuracion: conDesplazamientoAnios(configuracionAnioVentana.operador, ajuste) })
                        }
                        ayuda={`Se suma al año de la fecha antes de comparar (p. ej. 1 o -2). De ${DESPLAZAMIENTO_ANIOS_MINIMO} a ${DESPLAZAMIENTO_ANIOS_MAXIMO}.`}
                        error={errorDesplazamientoAnios(configuracionAnioVentana.desplazamientoAnios)}
                      />
                    </div>
                  </>
                ) : regla.tipo === "ANIO_DENTRO_DE_RANGO_VENTANA" ? (
                  <>
                    <CampoSeleccionMultiple
                      id={`regla-${indice}-columnas-anio-rango`}
                      conSeleccionarTodas
                      etiqueta="Columnas de fecha"
                      opciones={opcionesColumnasFecha}
                      valoresSeleccionados={regla.columnas}
                      onCambiar={(columnas) => actualizarRegla(indice, { columnas })}
                      ayuda={`Selecciona al menos 1 columna. Se rechaza la fila si el año de alguna fecha queda fuera del rango; las celdas vacías se omiten. En el mensaje puedes usar ${MARCADOR_ANIO_VENTANA}, ${MARCADOR_ANIO_DESDE} y ${MARCADOR_ANIO_HASTA}.`}
                      error={
                        opcionesColumnasFecha.length === 0
                          ? "Este formato no tiene ninguna columna de tipo Fecha"
                          : columnasFaltantes.length > 0
                            ? `Hace referencia a columnas que ya no existen en este formato: ${columnasFaltantes.map((nombre) => `"${nombre}"`).join(", ")}`
                            : null
                      }
                    />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <CampoEntero
                        id={`regla-${indice}-anios-antes`}
                        etiqueta="Años antes del año de la ventana"
                        valor={configuracionAnioRango.aniosAntes}
                        onCambiarValor={(aniosAntes) =>
                          actualizarRegla(indice, { configuracion: { ...configuracionAnioRango, aniosAntes } })
                        }
                        ayuda={`De ${ANIOS_RANGO_MINIMO} a ${ANIOS_RANGO_MAXIMO}`}
                        error={errorAniosRango(configuracionAnioRango.aniosAntes, "Los años antes")}
                      />
                      <CampoEntero
                        id={`regla-${indice}-anios-despues`}
                        etiqueta="Años después del año de la ventana"
                        valor={configuracionAnioRango.aniosDespues}
                        onCambiarValor={(aniosDespues) =>
                          actualizarRegla(indice, { configuracion: { ...configuracionAnioRango, aniosDespues } })
                        }
                        ayuda={`De ${ANIOS_RANGO_MINIMO} a ${ANIOS_RANGO_MAXIMO}`}
                        error={errorAniosRango(configuracionAnioRango.aniosDespues, "Los años después")}
                      />
                    </div>
                  </>
                ) : regla.tipo === "FECHA_NO_FUTURA" ? (
                  <CampoSelect
                    id={`regla-${indice}-columna-no-futura`}
                    etiqueta="Columna de fecha"
                    opciones={[{ valor: "", etiqueta: "Selecciona una columna" }, ...opcionesColumnasFecha]}
                    value={regla.columnas[0] ?? ""}
                    onChange={(evento) => actualizarRegla(indice, { columnas: evento.target.value ? [evento.target.value] : [] })}
                    ayuda="Se rechaza la fila si la fecha es posterior al día en que se sube el archivo (hora de Chile). Hoy y fechas pasadas se aceptan; las celdas vacías se omiten."
                    error={
                      opcionesColumnasFecha.length === 0
                        ? "Este formato no tiene ninguna columna de tipo Fecha"
                        : columnasFaltantes.length > 0
                          ? `Hace referencia a columnas que ya no existen en este formato: ${columnasFaltantes.map((nombre) => `"${nombre}"`).join(", ")}`
                          : null
                    }
                  />
                ) : regla.tipo === "FILA_DUPLICADA" ? (
                  <>
                    <CampoSeleccionMultiple
                      id={`regla-${indice}-columnas`}
                      conSeleccionarTodas
                      etiqueta="Columnas de la clave de duplicado"
                      opciones={opcionesColumnas}
                      valoresSeleccionados={regla.columnas}
                      onCambiar={(columnas) => actualizarRegla(indice, { columnas })}
                      ayuda="Selecciona al menos 1 columna. Dos filas se consideran duplicadas si tienen exactamente los mismos valores en estas columnas; las filas con estas columnas totalmente vacías no se comparan."
                      error={
                        columnasFaltantes.length > 0
                          ? `Hace referencia a columnas que ya no existen en este formato: ${columnasFaltantes
                              .map((nombre) => `"${nombre}"`)
                              .join(", ")}`
                          : null
                      }
                    />
                  </>
                ) : (
                  <CampoSeleccionMultiple
                    id={`regla-${indice}-columnas`}
                    conSeleccionarTodas
                    etiqueta="Columnas de la regla"
                    opciones={opcionesColumnas}
                    valoresSeleccionados={regla.columnas}
                    onCambiar={(columnas) => actualizarRegla(indice, { columnas })}
                    ayuda="Selecciona al menos 2 columnas. Si el registro trae vacías todas las seleccionadas, se rechaza."
                    error={
                      columnasFaltantes.length > 0
                        ? `Hace referencia a columnas que ya no existen en este formato: ${columnasFaltantes
                            .map((nombre) => `"${nombre}"`)
                            .join(", ")}`
                        : null
                    }
                  />
                )}

                <CampoTexto
                  id={`regla-${indice}-mensaje`}
                  etiqueta="Mensaje de rechazo"
                  maxLength={MENSAJE_REGLA_MAXIMO}
                  value={regla.mensaje}
                  onChange={(evento) => actualizarRegla(indice, { mensaje: evento.target.value })}
                />
              </div>
            );
          })}
        </div>
      )}

      {error ? (
        <p role="alert" className="text-sm font-medium text-gob-danger">
          {error}
        </p>
      ) : null}

      <Boton
        type="button"
        variante="secundario"
        disabled={reglas.length >= REGLAS_MAXIMO}
        onClick={agregarRegla}
        className="w-fit"
      >
        Agregar regla
      </Boton>
    </div>
  );
}
