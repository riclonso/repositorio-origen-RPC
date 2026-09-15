"use client";

import type { TipoReglaValidacion } from "@/modules/formatos-excel/domain/entities/FormatoExcel";
import type { OpcionSelect } from "@/shared/components/CampoSelect";
import { CampoSelect } from "@/shared/components/CampoSelect";
import { CampoSeleccionMultiple } from "@/shared/components/CampoSeleccionMultiple";
import { CampoTexto } from "@/shared/components/CampoTexto";
import { BotonIcono } from "@/shared/components/BotonIcono";
import { Boton } from "@/shared/components/Boton";
import { IconoEliminar } from "@/shared/components/iconos";

export type ReglaValidacionEditable = {
  tipo: TipoReglaValidacion;
  columnas: string[];
  mensaje: string;
};

// Columna del formato, tal como la ve este editor: solo lo necesario para listar nombres y
// filtrar por tipo de dato (RF-15).
export type ColumnaDisponible = { nombre: string; tipoDato: string };

// Tipos de dato que `FECHA_DENTRO_DE_VENTANA_VIGENTE` puede evaluar: la regla compara la celda
// contra un rango de fechas, así que solo tiene sentido ofrecer columnas que el sistema sabe
// parsear como fecha.
const TIPOS_DATO_FECHA = new Set(["FECHA", "FECHA_HORA"]);

const OPCIONES_TIPO_REGLA: OpcionSelect[] = [
  { valor: "ALGUNA_COLUMNA_CON_VALOR", etiqueta: "Al menos una columna con valor" },
  { valor: "FECHA_DENTRO_DE_VENTANA_VIGENTE", etiqueta: "Fecha dentro de la ventana de carga vigente" },
];

const REGLA_POR_DEFECTO: ReglaValidacionEditable = {
  tipo: "ALGUNA_COLUMNA_CON_VALOR",
  columnas: [],
  mensaje: "",
};

// Tope de seguridad, igual que `REGLAS_MAXIMO` en `schemas/formato-excel.schema.ts`: deshabilita
// "Agregar regla" antes de que el envío llegue a rechazarse en el servidor.
const REGLAS_MAXIMO = 100;
// Igual que `MENSAJE_REGLA_MAXIMO` en `schemas/formato-excel.schema.ts`: evita el viaje redondo
// al servidor solo para enterarse de que el mensaje es demasiado largo.
const MENSAJE_REGLA_MAXIMO = 300;

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
// `FECHA_DENTRO_DE_VENTANA_VIGENTE` (RF-15): una única columna de fecha debe caer dentro del
// rango de la ventana de carga elegida por el notificador para esa subida. Los campos requeridos
// de `TablaColumnasFormatoExcel` se validan primero; estas reglas se evalúan después (ver
// `CLAUDE.md`), pero ese evaluador vive en `modules/reporte-excel/`: este componente solo
// gestiona la configuración.
export function EditorReglasValidacionFormatoExcel({
  reglas,
  columnasDisponibles,
  onCambiar,
  error,
}: EditorReglasValidacionFormatoExcelProps) {
  function actualizarRegla(indice: number, cambios: Partial<ReglaValidacionEditable>) {
    onCambiar(reglas.map((regla, i) => (i === indice ? { ...regla, ...cambios } : regla)));
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
          &ldquo;Fecha dentro de la ventana de carga vigente&rdquo; exige que una columna de fecha
          caiga dentro del rango de la ventana elegida por el notificador al subir el archivo. Se
          evalúan después de comprobar las columnas requeridas.
        </p>
      </div>

      {reglas.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gob-accent bg-white px-3 py-4 text-sm text-gob-gray-a">
          Este formato no tiene reglas de validación configuradas.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {reglas.map((regla, indice) => {
            const columnasFaltantes = regla.columnas.filter(
              (nombreColumna) => !columnaExiste(nombreColumna, nombresColumnasDisponibles),
            );

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
                  opciones={OPCIONES_TIPO_REGLA}
                  value={regla.tipo}
                  onChange={(evento) =>
                    // Cambiar de tipo reinicia las columnas seleccionadas: los dos tipos exigen
                    // formas distintas (conjunto vs. una sola columna de fecha), así que un
                    // arreglo heredado del tipo anterior no tendría sentido.
                    actualizarRegla(indice, {
                      tipo: evento.target.value as TipoReglaValidacion,
                      columnas: [],
                    })
                  }
                />

                {regla.tipo === "FECHA_DENTRO_DE_VENTANA_VIGENTE" ? (
                  <CampoSelect
                    id={`regla-${indice}-columna-fecha`}
                    etiqueta="Columna de fecha"
                    opciones={[{ valor: "", etiqueta: "Selecciona una columna" }, ...opcionesColumnasFecha]}
                    value={regla.columnas[0] ?? ""}
                    onChange={(evento) =>
                      actualizarRegla(indice, {
                        columnas: evento.target.value ? [evento.target.value] : [],
                      })
                    }
                    ayuda="Solo se listan las columnas de tipo Fecha o Fecha y hora de este formato."
                    error={
                      columnasFaltantes.length > 0
                        ? `Hace referencia a una columna que ya no existe en este formato: "${columnasFaltantes[0]}"`
                        : opcionesColumnasFecha.length === 0
                          ? "Este formato no tiene ninguna columna de tipo Fecha o Fecha y hora"
                          : null
                    }
                  />
                ) : (
                  <CampoSeleccionMultiple
                    id={`regla-${indice}-columnas`}
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
