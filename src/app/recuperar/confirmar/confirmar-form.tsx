"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ZodError } from "zod";
import { confirmarRecuperacionFormSchema } from "@/modules/auth/schemas/recuperacion.schema";
import { Boton } from "@/shared/components/Boton";
import { CampoContrasena } from "@/shared/components/CampoContrasena";
import { RequisitosContrasena } from "@/shared/components/RequisitosContrasena";
import { CoincidenciaContrasena } from "@/shared/components/CoincidenciaContrasena";
import { CLASES_ENLACE_PUBLICO } from "@/shared/components/MarcoPublico";

const MENSAJE_ERROR_GENERICO = "No se pudo guardar la contraseña. Intenta nuevamente.";
const CODIGO_TOKEN_INVALIDO = "TOKEN_INVALIDO";

type EstadoConfirmarForm = {
  errores: Record<string, string>;
  errorGeneral: string | null;
  // Estado terminal: el enlace ya no sirve, así que se retira el formulario en vez de dejar
  // reintentar algo condenado a fallar siempre.
  enlaceInvalido: string | null;
};

const ESTADO_INICIAL: EstadoConfirmarForm = {
  errores: {},
  errorGeneral: null,
  enlaceInvalido: null,
};

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

export function ConfirmarForm({ token }: { token: string }) {
  const router = useRouter();
  // Campos controlados a propósito: React 19 resetea los no controlados de un
  // `<form action={...}>` en cuanto la acción termina, también al devolver errores de
  // validación.
  const [contrasena, setContrasena] = useState("");
  const [confirmacion, setConfirmacion] = useState("");

  const [estado, enviarFormulario, enviando] = useActionState<EstadoConfirmarForm, FormData>(
    async (_estadoPrevio, formData) => {
      const analisis = confirmarRecuperacionFormSchema.safeParse({
        contrasena: String(formData.get("contrasena") ?? ""),
        confirmacionContrasena: String(formData.get("confirmacionContrasena") ?? ""),
      });

      if (!analisis.success) {
        return {
          errores: aErroresPorCampo(analisis.error),
          errorGeneral: null,
          enlaceInvalido: null,
        };
      }

      try {
        // La confirmación no se envía al servidor: solo el token y la contraseña definitiva.
        const respuesta = await fetch("/api/auth/recuperacion/confirmar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, contrasena: analisis.data.contrasena }),
        });

        if (!respuesta.ok) {
          const datos = await respuesta.json().catch(() => null);

          if (datos?.codigo === CODIGO_TOKEN_INVALIDO) {
            return {
              errores: {},
              errorGeneral: null,
              enlaceInvalido: datos.error ?? MENSAJE_ERROR_GENERICO,
            };
          }

          return {
            errores: {},
            errorGeneral: datos?.error ?? MENSAJE_ERROR_GENERICO,
            enlaceInvalido: null,
          };
        }
      } catch {
        return { errores: {}, errorGeneral: MENSAJE_ERROR_GENERICO, enlaceInvalido: null };
      }

      // No se inicia sesión automáticamente: la persona vuelve a /login e ingresa con su
      // contraseña nueva.
      router.push("/login?restablecida=1");
      router.refresh();
      return ESTADO_INICIAL;
    },
    ESTADO_INICIAL,
  );

  if (estado.enlaceInvalido) {
    return (
      <div className="flex flex-col gap-4">
        <p role="alert" className="text-sm leading-relaxed text-gob-gray-a">
          {estado.enlaceInvalido}
        </p>
        <p className="text-center text-sm">
          <Link href="/recuperar" className={CLASES_ENLACE_PUBLICO}>
            Solicitar un enlace nuevo
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form action={enviarFormulario} className="flex w-full flex-col gap-5">
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

      {estado.errorGeneral ? (
        <p role="alert" className="text-sm font-medium text-gob-danger">
          {estado.errorGeneral}
        </p>
      ) : null}

      <Boton
        type="submit"
        variante="primario"
        cargando={enviando}
        textoCargando="Guardando..."
        className="mt-2 w-full py-2.5"
      >
        Guardar contraseña
      </Boton>

      <p className="text-center text-sm">
        <Link href="/login" className={CLASES_ENLACE_PUBLICO}>
          Volver al inicio de sesión
        </Link>
      </p>
    </form>
  );
}
