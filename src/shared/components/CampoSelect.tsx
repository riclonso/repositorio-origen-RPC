import type { SelectHTMLAttributes } from "react";

export type OpcionSelect = { valor: string; etiqueta: string };

// Grupo de opciones, dibujado como `<optgroup label>`. Se puede mezclar con opciones planas en la
// misma lista (p. ej. una opción "Todas" suelta seguida de grupos por región).
export type GrupoOpcionesSelect = { grupo: string; opciones: OpcionSelect[] };

export type ElementoSelect = OpcionSelect | GrupoOpcionesSelect;

function esGrupo(elemento: ElementoSelect): elemento is GrupoOpcionesSelect {
  return "grupo" in elemento;
}

function Opcion({ opcion }: { opcion: OpcionSelect }) {
  return <option value={opcion.valor}>{opcion.etiqueta}</option>;
}

type CampoSelectProps = {
  id: string;
  etiqueta: string;
  opciones: ElementoSelect[];
  ayuda?: string;
  error?: string | null;
} & Omit<SelectHTMLAttributes<HTMLSelectElement>, "id">;

export function CampoSelect({
  id,
  etiqueta,
  opciones,
  ayuda,
  error,
  className = "",
  ...atributos
}: CampoSelectProps) {
  const idAyuda = `${id}-ayuda`;
  const idError = `${id}-error`;
  const descripciones = [ayuda ? idAyuda : null, error ? idError : null].filter(Boolean).join(" ");

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium text-gob-black">
        {etiqueta}
      </label>

      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={descripciones || undefined}
        className={`w-full rounded-md border bg-white px-3 py-2 text-gob-black outline-none focus:ring-2 disabled:bg-gob-neutral ${
          error
            ? "border-gob-danger focus:border-gob-danger focus:ring-gob-danger/30"
            : "border-gob-accent focus:border-gob-primary focus:ring-gob-primary/30"
        } ${className}`}
        {...atributos}
      >
        {opciones.map((elemento) =>
          esGrupo(elemento) ? (
            <optgroup key={`grupo:${elemento.grupo}`} label={elemento.grupo}>
              {elemento.opciones.map((opcion) => (
                <Opcion key={opcion.valor} opcion={opcion} />
              ))}
            </optgroup>
          ) : (
            <Opcion key={elemento.valor} opcion={elemento} />
          ),
        )}
      </select>

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
    </div>
  );
}
