"use client";

import { useActionState } from "react";
import Link from "next/link";
import { solicitarRecuperacionSchema } from "@/modules/auth/schemas/recuperacion.schema";
import { HORAS_VIGENCIA_TOKEN_AUTOSERVICIO } from "@/modules/auth/domain/entities/PasswordResetToken";
import { Boton } from "@/shared/components/Boton";
import { CampoTexto } from "@/shared/components/CampoTexto";
import { CLASES_ENLACE_PUBLICO } from "@/shared/components/MarcoPublico";

const MENSAJE_ERROR_GENERICO = "No se pudo enviar la solicitud. Intenta nuevamente.";

// Mensaje idéntico exista o no la cuenta, esté activa o no, y haya llegado o no el correo. La
// segunda frase es lo que hace tolerable la ambigüedad de la primera: le da una salida a quien
// de verdad tiene cuenta y no recibió nada, sin decirle a nadie si la cuenta existe.
const MENSAJE_ENVIADO = `Si el correo ingresado corresponde a una cuenta habilitada, enviamos un enlace para elegir una contraseña nueva. Revisa tu bandeja de entrada y la carpeta de correo no deseado; el enlace vence en ${HORAS_VIGENCIA_TOKEN_AUTOSERVICIO} horas.`;

type EstadoRecuperarForm = {
  enviado: boolean;
  error: string | null;
};

const ESTADO_INICIAL: EstadoRecuperarForm = { enviado: false, error: null };

export function RecuperarForm() {
  const [estado, enviarFormulario, enviando] = useActionState<EstadoRecuperarForm, FormData>(
    async (_estadoPrevio, formData) => {
      const analisis = solicitarRecuperacionSchema.safeParse({
        email: String(formData.get("email") ?? ""),
      });

      if (!analisis.success) {
        return {
          enviado: false,
          error: analisis.error.issues[0]?.message ?? MENSAJE_ERROR_GENERICO,
        };
      }

      try {
        const respuesta = await fetch("/api/auth/recuperacion", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: analisis.data.email }),
        });

        if (!respuesta.ok) {
          const datos = await respuesta.json().catch(() => null);
          return { enviado: false, error: datos?.error ?? MENSAJE_ERROR_GENERICO };
        }
      } catch {
        return { enviado: false, error: MENSAJE_ERROR_GENERICO };
      }

      return { enviado: true, error: null };
    },
    ESTADO_INICIAL,
  );

  if (estado.enviado) {
    return (
      <div className="flex flex-col gap-4">
        <p role="status" className="text-sm leading-relaxed text-gob-gray-a">
          {MENSAJE_ENVIADO}
        </p>
        <p className="text-sm leading-relaxed text-gob-gray-a">
          Si no llega en unos minutos, vuelve a intentarlo o comunícate con el administrador del
          sistema.
        </p>
        <p className="text-center text-sm">
          <Link href="/login" className={CLASES_ENLACE_PUBLICO}>
            Volver al inicio de sesión
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form action={enviarFormulario} className="flex w-full flex-col gap-5">
      <CampoTexto
        id="email"
        name="email"
        type="email"
        inputMode="email"
        etiqueta="Correo institucional"
        autoComplete="email"
        placeholder="persona@redsalud.gob.cl"
        ayuda="Debe ser el correo con el que está registrada tu cuenta."
      />

      {estado.error ? (
        <p role="alert" className="text-sm font-medium text-gob-danger">
          {estado.error}
        </p>
      ) : null}

      <Boton
        type="submit"
        variante="primario"
        cargando={enviando}
        textoCargando="Enviando..."
        className="mt-2 w-full py-2.5"
      >
        Enviar enlace
      </Boton>

      {/* Quien no recuerde con qué correo está registrado no puede autoservirse: es la
          contrapartida aceptada de pedir el correo y no el RUT. */}
      <p className="text-sm leading-relaxed text-gob-gray-a">
        Si no recuerdas con qué correo está registrada tu cuenta, comunícate con el administrador
        del sistema.
      </p>

      <p className="text-center text-sm">
        <Link href="/login" className={CLASES_ENLACE_PUBLICO}>
          Volver al inicio de sesión
        </Link>
      </p>
    </form>
  );
}
