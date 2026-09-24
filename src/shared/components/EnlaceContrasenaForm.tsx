"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Boton } from "@/shared/components/Boton";

const MENSAJE_ERROR_GENERICO = "No se pudo enviar el enlace. Intenta nuevamente.";

type EstadoFormulario = { error: string | null };

const ESTADO_INICIAL: EstadoFormulario = { error: null };

type EnlaceContrasenaFormProps = { usuarioId: string; rutaBase: string };

// Opción 1: la persona fija su propia contraseña con un enlace de un solo uso. No sale contraseña
// alguna de este formulario; solo dispara el envío. Compartido entre `/dashboard/usuarios` (ADMIN)
// y `/revisor/usuarios` (REVISOR_REPOSITORIO): cada área aporta su propia base de ruta.
export function EnlaceContrasenaForm({ usuarioId, rutaBase }: EnlaceContrasenaFormProps) {
  const router = useRouter();

  const [estado, enviarFormulario, enviando] = useActionState<EstadoFormulario, FormData>(
    async () => {
      try {
        const respuesta = await fetch(`/api/usuarios/${usuarioId}/enlace-contrasena`, {
          method: "POST",
        });

        if (!respuesta.ok) {
          const datos = await respuesta.json().catch(() => null);
          return { error: datos?.error ?? MENSAJE_ERROR_GENERICO };
        }
      } catch {
        return { error: MENSAJE_ERROR_GENERICO };
      }

      router.push(`${rutaBase}?enlace=enviado`);
      router.refresh();
      return ESTADO_INICIAL;
    },
    ESTADO_INICIAL,
  );

  return (
    <form action={enviarFormulario} className="mt-4">
      {estado.error ? (
        <p role="alert" className="mb-3 text-sm font-medium text-gob-danger">
          {estado.error}
        </p>
      ) : null}

      <Boton type="submit" variante="primario" cargando={enviando} textoCargando="Enviando...">
        Enviar enlace
      </Boton>
    </form>
  );
}
