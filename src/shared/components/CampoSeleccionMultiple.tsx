export type OpcionSeleccionMultiple = { valor: string; etiqueta: string };

type CampoSeleccionMultipleProps = {
  id: string;
  etiqueta: string;
  opciones: OpcionSeleccionMultiple[];
  valoresSeleccionados: string[];
  onCambiar: (valores: string[]) => void;
  ayuda?: string;
  error?: string | null;
};

// Checkboxes dentro de un contenedor con scroll, no un `<select multiple>` nativo: es más
// accesible (cada opción es un control propio, con su etiqueta) y más fácil de mantener dentro
// de la paleta `gob-*` que un `<select>` múltiple, que el navegador estiliza de forma muy
// limitada. `CampoSelect` no sirve aquí porque es de selección única.
export function CampoSeleccionMultiple({
  id,
  etiqueta,
  opciones,
  valoresSeleccionados,
  onCambiar,
  ayuda,
  error,
}: CampoSeleccionMultipleProps) {
  const idAyuda = `${id}-ayuda`;
  const idError = `${id}-error`;
  const descripciones = [ayuda ? idAyuda : null, error ? idError : null].filter(Boolean).join(" ");

  function alternar(valor: string, marcado: boolean) {
    onCambiar(
      marcado
        ? [...valoresSeleccionados, valor]
        : valoresSeleccionados.filter((seleccionado) => seleccionado !== valor),
    );
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium text-gob-black">{etiqueta}</legend>

      <div
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={descripciones || undefined}
        className={`flex max-h-48 flex-col gap-1 overflow-y-auto rounded-md border bg-white p-2 ${
          error ? "border-gob-danger" : "border-gob-accent"
        }`}
      >
        {opciones.length === 0 ? (
          <p className="px-2 py-1 text-sm text-gob-gray-a">No hay opciones disponibles.</p>
        ) : (
          opciones.map((opcion) => {
            const idOpcion = `${id}-${opcion.valor}`;

            return (
              <label
                key={opcion.valor}
                htmlFor={idOpcion}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-gob-black hover:bg-gob-neutral"
              >
                <input
                  id={idOpcion}
                  type="checkbox"
                  checked={valoresSeleccionados.includes(opcion.valor)}
                  onChange={(evento) => alternar(opcion.valor, evento.target.checked)}
                  className="h-4 w-4 rounded border-gob-accent text-gob-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary"
                />
                {opcion.etiqueta}
              </label>
            );
          })
        )}
      </div>

      {ayuda ? (
        <p id={idAyuda} className="text-xs text-gob-gray-a">
          {ayuda}
        </p>
      ) : null}

      {error ? (
        <p id={idError} role="alert" className="text-sm font-medium text-gob-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
