"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import type { ZodError } from "zod";
import { restablecerContrasenaFormSchema } from "@/modules/usuarios/schemas/usuario.schema";
import { Boton } from "@/shared/components/Boton";
import { CampoContrasena } from "@/shared/components/CampoContrasena";
import { RequisitosContrasena } from "@/shared/components/RequisitosContrasena";
import { CoincidenciaContrasena } from "@/shared/components/CoincidenciaContrasena";

const MENSAJE_ERROR_GENERICO = "No se pudo definir la contraseña. Intenta nuevamente.";

type EstadoContrasenaForm = {
  errores: Record<string, string>;
  errorGeneral: string | null;
};

const ESTADO_INICIAL: EstadoContrasenaForm = { errores: {}, errorGeneral: null };

function aErroresPorCampo(error: ZodError): Record<string, string> {
  const errores: Record<string, string> = {};

  for (const problema of error.issues) {
    const campo = String(problema.path[0] ?? "general");
    if (!errores[campo]) {
      errores[campo] = problema.message;
    }
  }

  return errores;
}

type ContrasenaFormProps = { usuarioId: string; rutaBase: string };

// Opción 2: el administrador fija la contraseña directamente. La confirmación NO viaja al
// servidor: solo la contraseña definitiva. Los campos son controlados a propósito (React 19
// resetea los no controlados de un `<form action>` al terminar la acción, incluso al devolver
// errores de validación; sin esto se borraría lo tecleado). Compartido entre `/dashboard/usuarios`
// (ADMIN) y `/revisor/usuarios` (REVISOR_REPOSITORIO): cada área aporta su propia base de ruta.
export function ContrasenaForm({ usuarioId, rutaBase }: ContrasenaFormProps) {
  const router = useRouter();
  const [contrasena, setContrasena] = useState("");
  const [confirmacion, setConfirmacion] = useState("");

  const [estado, enviarFormulario, enviando] = useActionState<EstadoContrasenaForm, FormData>(
    async (_estadoPrevio, formData) => {
      const analisis = restablecerContrasenaFormSchema.safeParse({
        contrasena: String(formData.get("contrasena") ?? ""),
        confirmacionContrasena: String(formData.get("confirmacionContrasena") ?? ""),
      });

      if (!analisis.success) {
        return { errores: aErroresPorCampo(analisis.error), errorGeneral: null };
      }

      try {
        const respuesta = await fetch(`/api/usuarios/${usuarioId}/contrasena`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contrasena: analisis.data.contrasena }),
        });

        if (!respuesta.ok) {
          const datos = await respuesta.json().catch(() => null);
          return { errores: {}, errorGeneral: datos?.error ?? MENSAJE_ERROR_GENERICO };
        }
      } catch {
        return { errores: {}, errorGeneral: MENSAJE_ERROR_GENERICO };
      }

      router.push(`${rutaBase}?contrasena=definida`);
      router.refresh();
      return ESTADO_INICIAL;
    },
    ESTADO_INICIAL,
  );

  return (
    <form action={enviarFormulario} className="mt-4 flex flex-col gap-5">
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <CampoContrasena
            id="contrasena"
            name="contrasena"
            etiqueta="Nueva contraseña"
            autoComplete="new-password"
            error={estado.errores.contrasena}
            aria-describedby="requisitos-contrasena"
            value={contrasena}
            onChange={(evento) => setContrasena(evento.target.value)}
          />
          <RequisitosContrasena id="requisitos-contrasena" contrasena={contrasena} />
        </div>

        <div>
          <CampoContrasena
            id="confirmacionContrasena"
            name="confirmacionContrasena"
            etiqueta="Repetir contraseña"
            autoComplete="new-password"
            error={estado.errores.confirmacionContrasena}
            aria-describedby="coincidencia-contrasena"
            value={confirmacion}
            onChange={(evento) => setConfirmacion(evento.target.value)}
          />
          <CoincidenciaContrasena
            id="coincidencia-contrasena"
            contrasena={contrasena}
            confirmacion={confirmacion}
          />
        </div>
      </div>

      {estado.errorGeneral ? (
        <p role="alert" className="text-sm font-medium text-gob-danger">
          {estado.errorGeneral}
        </p>
      ) : null}

      <Boton type="submit" variante="primario" cargando={enviando} textoCargando="Guardando...">
        Guardar contraseña
      </Boton>
    </form>
  );
}
