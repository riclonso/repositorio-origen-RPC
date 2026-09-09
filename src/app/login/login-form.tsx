"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";

type LoginState = { error: string | null };

const estadoInicial: LoginState = { error: null };
const MENSAJE_ERROR_GENERICO = "RUT o contraseña incorrectos";

export function LoginForm() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);

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
      <div className="flex flex-col gap-1.5">
        <label htmlFor="rut" className="text-sm font-medium text-gob-black">
          RUT
        </label>
        <input
          id="rut"
          name="rut"
          type="text"
          autoComplete="username"
          placeholder="12345678-9"
          className="rounded-md border border-gob-accent bg-white px-3 py-2 text-gob-black outline-none placeholder:text-gob-gray-b focus:border-gob-primary focus:ring-2 focus:ring-gob-primary/30"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="contrasena" className="text-sm font-medium text-gob-black">
          Contraseña
        </label>
        <div className="relative">
          <input
            id="contrasena"
            name="contrasena"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            className="w-full rounded-md border border-gob-accent bg-white px-3 py-2 pr-10 text-gob-black outline-none focus:border-gob-primary focus:ring-2 focus:ring-gob-primary/30"
          />
          <button
            type="button"
            onClick={() => setShowPassword((visible) => !visible)}
            aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
            className="absolute inset-y-0 right-0 flex items-center px-3 text-gob-gray-b hover:text-gob-primary"
          >
            {showPassword ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>
      </div>

      {estado.error && (
        <p role="alert" className="text-sm text-gob-secondary">
          {estado.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 flex items-center justify-center rounded-md bg-gob-primary px-4 py-2.5 font-medium text-white transition-colors hover:bg-gob-tertiary disabled:cursor-not-allowed disabled:opacity-70"
      >
        {pending ? "Ingresando…" : "Ingresar"}
      </button>
    </form>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-5 w-5">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 12s3.75-7.5 9.75-7.5 9.75 7.5 9.75 7.5-3.75 7.5-9.75 7.5S2.25 12 2.25 12Z"
      />
      <circle cx="12" cy="12" r="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-5 w-5">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 3l18 18M10.58 10.58a3 3 0 0 0 4.24 4.24M9.88 5.09A9.77 9.77 0 0 1 12 4.5c6 0 9.75 7.5 9.75 7.5a17.6 17.6 0 0 1-3.22 4.31M6.53 6.53C4.06 8.14 2.25 12 2.25 12s3.75 7.5 9.75 7.5a9.7 9.7 0 0 0 4.02-.84"
      />
    </svg>
  );
}
