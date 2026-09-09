import type { SelectHTMLAttributes } from "react";

export type OpcionSelect = { valor: string; etiqueta: string };

type CampoSelectProps = {
  id: string;
  etiqueta: string;
  opciones: OpcionSelect[];
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
        {opciones.map((opcion) => (
          <option key={opcion.valor} value={opcion.valor}>
            {opcion.etiqueta}
          </option>
        ))}
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
