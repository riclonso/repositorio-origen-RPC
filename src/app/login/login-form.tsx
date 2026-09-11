"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Boton } from "@/shared/components/Boton";
import { CLASES_ENLACE_PUBLICO } from "@/shared/components/MarcoPublico";
import { CampoContrasena } from "@/shared/components/CampoContrasena";
import { CampoTexto } from "@/shared/components/CampoTexto";

type LoginState = { error: string | null };

const estadoInicial: LoginState = { error: null };
const MENSAJE_ERROR_GENERICO = "RUT o contraseña incorrectos";

export function LoginForm() {
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

      // Navegación dura a propósito, no `router.push`: al iniciar sesión cambia la cookie de
      // sesión, y una navegación suave del App Router puede reutilizar una entrada previa de la
      // caché de rutas del cliente —por ejemplo el rebote a /login de un intento con un perfil
      // sin acceso al panel— en vez de volver a pedir /inicio con la cookie recién emitida.
      // `window.location.assign` fuerza una petición nueva: el despachador /inicio se evalúa con
      // la sesión actual y redirige al panel del perfil, sin caché de cliente de por medio. La
      // regla de ESLint sugiere `router.push()`, que es justo la navegación suave que reintroduce
      // este bug, así que se desactiva de forma acotada y documentada solo en esta línea.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- ver nota arriba
      window.location.assign("/inicio");
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
