"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Boton } from "@/shared/components/Boton";
import { RUTA_USUARIOS } from "../../ruta-usuarios";

const MENSAJE_ERROR_GENERICO = "No se pudo enviar el enlace. Intenta nuevamente.";

type EstadoFormulario = { error: string | null };

const ESTADO_INICIAL: EstadoFormulario = { error: null };

export function EnlaceContrasenaForm({ usuarioId }: { usuarioId: string }) {
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

      router.push(`${RUTA_USUARIOS}?enlace=enviado`);
      router.refresh();
      return ESTADO_INICIAL;
    },
    ESTADO_INICIAL,
  );

  return (
    <form action={enviarFormulario} className="mt-6 flex flex-col gap-5">
      {estado.error ? (
        <p role="alert" className="text-sm font-medium text-gob-danger">
          {estado.error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Boton
          type="submit"
          variante="primario"
          cargando={enviando}
          textoCargando="Enviando..."
        >
          Enviar enlace
        </Boton>

        <Link
          href={RUTA_USUARIOS}
          className="inline-flex items-center justify-center rounded-md border border-gob-accent bg-white px-4 py-2 text-sm font-medium text-gob-gray-a transition-colors hover:bg-gob-neutral active:translate-y-[1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
