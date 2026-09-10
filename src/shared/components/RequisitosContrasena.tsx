"use client";

import { REGLAS_CONTRASENA } from "@/shared/schemas/contrasena.schema";
import { IconoCumplido, IconoPendiente } from "@/shared/components/iconos";

type RequisitosContrasenaProps = {
  contrasena: string;
  id?: string;
};

// Recorre las mismas reglas que usa la validación del servidor, así que la lista no puede
// quedar diciendo algo distinto de lo que el backend acepta.
export function RequisitosContrasena({ contrasena, id }: RequisitosContrasenaProps) {
  return (
    <ul
      id={id}
      // `polite` anuncia el requisito que acaba de cumplirse sin interrumpir lo que el lector
      // esté leyendo. Como cambia un ítem por pulsación, el anuncio queda corto.
      aria-live="polite"
      className="mt-2 flex flex-col gap-1"
    >
      {REGLAS_CONTRASENA.map((regla) => {
        const cumplida = regla.cumple(contrasena);

        return (
          <li
            key={regla.id}
            className={`flex items-center gap-1.5 text-xs ${
              cumplida ? "font-medium text-gob-success" : "text-gob-gray-a"
            }`}
          >
            {/* El icono cambia de forma además de color: quien no distingue verde de gris
                sigue viendo la diferencia entre un tilde y un círculo vacío. */}
            {cumplida ? <IconoCumplido /> : <IconoPendiente />}
            {regla.etiqueta}
            {/* El color y el icono no llegan al lector de pantalla: el estado va en texto. */}
            <span className="sr-only">{cumplida ? ": cumplido" : ": pendiente"}</span>
          </li>
        );
      })}
    </ul>
  );
}
