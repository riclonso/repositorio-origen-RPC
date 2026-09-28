"use client";

import { CampoSelect, type OpcionSelect } from "@/shared/components/CampoSelect";

export type ModoReglaRut = "COMPLETO" | "NUMERO_Y_DV";

const OPCIONES_MODO_RUT: OpcionSelect[] = [
  { valor: "COMPLETO", etiqueta: "RUT completo en una columna" },
  { valor: "NUMERO_Y_DV", etiqueta: "Número + dígito verificador" },
];

const OPCION_SIN_SELECCION: OpcionSelect = { valor: "", etiqueta: "Selecciona una columna" };

type EditorColumnasReglaRutProps = {
  idBase: string;
  modo: ModoReglaRut;
  columnas: string[];
  opcionesColumnas: OpcionSelect[];
  columnasFaltantes: string[];
  onCambiar: (cambios: { modoRut: ModoReglaRut; columnas: string[] }) => void;
};

// Selectores de columnas de la regla "Validar RUT". En modo "número + dígito verificador" se
// guardan SIEMPRE dos posiciones (`[número, dv]`), con cadena vacía en la que falte elegir: así el
// servidor rechaza la regla incompleta en vez de convertirla en silencio a una de una columna.
export function EditorColumnasReglaRut({
  idBase,
  modo,
  columnas,
  opcionesColumnas,
  columnasFaltantes,
  onCambiar,
}: EditorColumnasReglaRutProps) {
  const opciones = [OPCION_SIN_SELECCION, ...opcionesColumnas];
  const errorFaltantes =
    columnasFaltantes.length > 0
      ? `Hace referencia a columnas que ya no existen en este formato: ${columnasFaltantes
          .map((nombre) => `"${nombre}"`)
          .join(", ")}`
      : null;

  function cambiarPosicion(posicion: 0 | 1, valor: string) {
    const siguientes = [columnas[0] ?? "", columnas[1] ?? ""];
    siguientes[posicion] = valor;
    onCambiar({ modoRut: modo, columnas: siguientes });
  }

  return (
    <>
      <CampoSelect
        id={`${idBase}-modo-rut`}
        etiqueta="¿Cómo viene el RUT?"
        opciones={OPCIONES_MODO_RUT}
        value={modo}
        onChange={(evento) => {
          const nuevoModo = evento.target.value === "NUMERO_Y_DV" ? "NUMERO_Y_DV" : "COMPLETO";
          onCambiar({ modoRut: nuevoModo, columnas: nuevoModo === "NUMERO_Y_DV" ? ["", ""] : [] });
        }}
        ayuda="Se acepta con o sin puntos y guion, y dígito verificador K o k. Si todas las columnas vienen vacías la regla no se aplica; si falta solo una, se rechaza."
      />

      {modo === "COMPLETO" ? (
        <CampoSelect
          id={`${idBase}-columna-rut`}
          etiqueta="Columna con el RUT"
          opciones={opciones}
          value={columnas[0] ?? ""}
          onChange={(evento) => onCambiar({ modoRut: modo, columnas: evento.target.value ? [evento.target.value] : [] })}
          error={errorFaltantes}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          <CampoSelect
            id={`${idBase}-columna-numero`}
            etiqueta="Número"
            opciones={opciones}
            value={columnas[0] ?? ""}
            onChange={(evento) => cambiarPosicion(0, evento.target.value)}
          />
          <CampoSelect
            id={`${idBase}-columna-dv`}
            etiqueta="Dígito verificador"
            opciones={opciones}
            value={columnas[1] ?? ""}
            onChange={(evento) => cambiarPosicion(1, evento.target.value)}
            error={errorFaltantes}
          />
        </div>
      )}
    </>
  );
}
