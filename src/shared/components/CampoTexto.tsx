import type { InputHTMLAttributes, ReactNode } from "react";

type CampoTextoProps = {
  id: string;
  etiqueta: string;
  ayuda?: string;
  error?: string | null;
  // Contenido superpuesto al input (por ejemplo, el botón de mostrar contraseña).
  adorno?: ReactNode;
  // Ícono a la izquierda del valor (por ejemplo, usuario/candado en las pantallas públicas).
  // Decorativo: la etiqueta ya identifica el campo para lectores de pantalla.
  icono?: ReactNode;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "id">;

export function CampoTexto({
  id,
  etiqueta,
  ayuda,
  error,
  adorno,
  icono,
  className = "",
  ...atributos
}: CampoTextoProps) {
  const idAyuda = `${id}-ayuda`;
  const idError = `${id}-error`;
  const descripciones = [ayuda ? idAyuda : null, error ? idError : null].filter(Boolean).join(" ");

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium text-gob-black">
        {etiqueta}
      </label>

      <div className="relative">
        {icono ? (
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gob-gray-a">
            {icono}
          </span>
        ) : null}
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={descripciones || undefined}
          className={`w-full rounded-md border bg-white px-3 py-2 text-gob-black outline-none placeholder:text-gob-gray-b focus:ring-2 disabled:bg-gob-neutral disabled:text-gob-gray-a ${
            error
              ? "border-gob-danger focus:border-gob-danger focus:ring-gob-danger/30"
              : "border-gob-accent focus:border-gob-primary focus:ring-gob-primary/30"
          } ${adorno ? "pr-10" : ""} ${icono ? "pl-10" : ""} ${className}`}
          {...atributos}
        />
        {adorno}
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
    </div>
  );
}
