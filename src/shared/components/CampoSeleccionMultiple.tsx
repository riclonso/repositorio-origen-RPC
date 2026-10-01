export type OpcionSeleccionMultiple = { valor: string; etiqueta: string };

type CampoSeleccionMultipleProps = {
  id: string;
  etiqueta: string;
  opciones: OpcionSeleccionMultiple[];
  valoresSeleccionados: string[];
  onCambiar: (valores: string[]) => void;
  ayuda?: string;
  error?: string | null;
  // Agrega al inicio de la lista una casilla "Seleccionar todas" que marca o desmarca todas las
  // opciones visibles (queda en estado intermedio si hay solo algunas marcadas).
  conSeleccionarTodas?: boolean;
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
  conSeleccionarTodas = false,
}: CampoSeleccionMultipleProps) {
  const idAyuda = `${id}-ayuda`;
  const idSeleccionarTodas = `${id}-seleccionar-todas`;
  const cantidadMarcadas = opciones.filter((opcion) => valoresSeleccionados.includes(opcion.valor)).length;
  const todasMarcadas = opciones.length > 0 && cantidadMarcadas === opciones.length;
  const algunasMarcadas = cantidadMarcadas > 0 && !todasMarcadas;

  // Solo actúa sobre las opciones visibles: valores seleccionados que ya no están entre las
  // opciones (p. ej. una columna eliminada del formato) se conservan para que el error siga visible.
  function alternarTodas(marcado: boolean) {
    const valoresOpciones = opciones.map((opcion) => opcion.valor);
    const ajenos = valoresSeleccionados.filter((valor) => !valoresOpciones.includes(valor));
    onCambiar(marcado ? [...ajenos, ...valoresOpciones] : ajenos);
  }
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
          <>
          {conSeleccionarTodas ? (
            <label
              htmlFor={idSeleccionarTodas}
              className="flex cursor-pointer items-center gap-2 rounded border-b border-gob-gray-b px-2 py-1.5 text-sm font-medium text-gob-black hover:bg-gob-neutral"
            >
              <input
                id={idSeleccionarTodas}
                type="checkbox"
                checked={todasMarcadas}
                ref={(casilla) => {
                  if (casilla) casilla.indeterminate = algunasMarcadas;
                }}
                onChange={(evento) => alternarTodas(evento.target.checked)}
                className="h-4 w-4 rounded border-gob-accent text-gob-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary"
              />
              Seleccionar todas las columnas
            </label>
          ) : null}
          {opciones.map((opcion) => {
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
          })}
          </>
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
