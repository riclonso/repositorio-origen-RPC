"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Boton } from "@/shared/components/Boton";
import { CLASES_ENLACE_PUBLICO } from "@/shared/components/MarcoPublico";
import { CampoContrasena } from "@/shared/components/CampoContrasena";
import { CampoTexto } from "@/shared/components/CampoTexto";

type LoginState = { error: string | null };

const estadoInicial: LoginState = { error: null };
const MENSAJE_ERROR_GENERICO = "RUT o contraseña incorrectos";

export function LoginForm() {
  const router = useRouter();

  const [estado, formAction, pending] = useActionState<LoginState, FormData>(
    async (_estadoPrevio, formData) => {
      const respuesta = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rut: formData.get("rut"),
          contrasena: formData.get("contrasena"),
        }),
      });

      if (!respuesta.ok) {
        const datos = await respuesta.json().catch(() => null);
        return { error: datos?.error ?? MENSAJE_ERROR_GENERICO };
      }

      router.push("/dashboard");
      router.refresh();
      return estadoInicial;
    },
    estadoInicial,
  );

  return (
    <form action={formAction} className="flex w-full flex-col gap-5">
      <CampoTexto
        id="rut"
        name="rut"
        etiqueta="RUT"
        autoComplete="username"
        placeholder="12345678-9"
      />

      <CampoContrasena
        id="contrasena"
        name="contrasena"
        etiqueta="Contraseña"
        autoComplete="current-password"
      />

      {estado.error ? (
        <p role="alert" className="text-sm font-medium text-gob-danger">
          {estado.error}
        </p>
      ) : null}

      <Boton
        type="submit"
        variante="primario"
        cargando={pending}
        textoCargando="Ingresando..."
        className="mt-2 w-full py-2.5"
      >
        Ingresar
      </Boton>

      <p className="text-center text-sm">
        <Link href="/recuperar" className={CLASES_ENLACE_PUBLICO}>
          ¿Olvidó su contraseña?
        </Link>
      </p>
    </form>
  );
}
