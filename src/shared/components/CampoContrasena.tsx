"use client";

import { useState } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { CampoTexto } from "@/shared/components/CampoTexto";
import { IconoOjo, IconoOjoTachado } from "@/shared/components/iconos";

type CampoContrasenaProps = {
  id: string;
  etiqueta: string;
  ayuda?: string;
  error?: string | null;
  icono?: ReactNode;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "type">;

export function CampoContrasena({ id, etiqueta, ayuda, error, icono, ...atributos }: CampoContrasenaProps) {
  const [visible, setVisible] = useState(false);

  return (
    <CampoTexto
      id={id}
      etiqueta={etiqueta}
      ayuda={ayuda}
      error={error}
      icono={icono}
      type={visible ? "text" : "password"}
      adorno={
        <button
          type="button"
          onClick={() => setVisible((estabaVisible) => !estabaVisible)}
          aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 flex items-center rounded-md px-3 text-gob-gray-a hover:text-gob-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary"
        >
          {visible ? <IconoOjoTachado /> : <IconoOjo />}
        </button>
      }
      {...atributos}
    />
  );
}
