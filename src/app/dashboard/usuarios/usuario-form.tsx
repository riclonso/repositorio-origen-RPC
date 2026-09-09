"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ZodError } from "zod";
import type { RolUsuario } from "@/modules/usuarios/domain/entities/Usuario";
import {
  MENSAJE_COMPLEJIDAD_CONTRASENA,
  crearUsuarioFormSchema,
  editarUsuarioSchema,
} from "@/modules/usuarios/schemas/usuario.schema";
import { Boton } from "@/shared/components/Boton";
import { CampoContrasena } from "@/shared/components/CampoContrasena";
import { CampoSelect } from "@/shared/components/CampoSelect";
import { CampoTexto } from "@/shared/components/CampoTexto";
import { RUTA_USUARIOS } from "./ruta-usuarios";

const MENSAJE_ERROR_GENERICO = "No se pudo guardar el usuario. Intenta nuevamente.";

const OPCIONES_ROL = [
  { valor: "USUARIO", etiqueta: "Usuario" },
  { valor: "ADMIN", etiqueta: "Administrador" },
];

export type ValoresUsuarioForm = {
  nombres: string;
  apellidos: string;
  rut: string;
  email: string;
  rol: RolUsuario;
};

type EstadoUsuarioForm = {
  errores: Record<string, string>;
  errorGeneral: string | null;
};

const ESTADO_INICIAL: EstadoUsuarioForm = { errores: {}, errorGeneral: null };

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

// El servidor deriva el username desde el RUT, así que un conflicto de username se muestra
// sobre el campo RUT, que es el que el operador puede corregir.
function campoDeRespuesta(campo: unknown): string {
  return campo === "username" ? "rut" : String(campo);
}

type UsuarioFormProps = {
  modo: "crear" | "editar";
  endpoint: string;
  metodo: "POST" | "PUT";
  valoresIniciales: ValoresUsuarioForm;
};

export function UsuarioForm({ modo, endpoint, metodo, valoresIniciales }: UsuarioFormProps) {
  const router = useRouter();
  const esCreacion = modo === "crear";

  const [estado, enviarFormulario, enviando] = useActionState<EstadoUsuarioForm, FormData>(
    async (_estadoPrevio, formData) => {
      const bruto = {
        nombres: String(formData.get("nombres") ?? ""),
        apellidos: String(formData.get("apellidos") ?? ""),
        email: String(formData.get("email") ?? ""),
        rol: String(formData.get("rol") ?? ""),
        rut: String(formData.get("rut") ?? ""),
        contrasena: String(formData.get("contrasena") ?? ""),
        confirmacionContrasena: String(formData.get("confirmacionContrasena") ?? ""),
      };

      let cuerpo: Record<string, string>;

      if (esCreacion) {
        const analisis = crearUsuarioFormSchema.safeParse(bruto);

        if (!analisis.success) {
          return { errores: aErroresPorCampo(analisis.error), errorGeneral: null };
        }

        cuerpo = {
          nombres: analisis.data.nombres,
          apellidos: analisis.data.apellidos,
          rut: analisis.data.rut,
          email: analisis.data.email,
          rol: analisis.data.rol,
          contrasena: analisis.data.contrasena,
        };
      } else {
        const analisis = editarUsuarioSchema.safeParse(bruto);

        if (!analisis.success) {
          return { errores: aErroresPorCampo(analisis.error), errorGeneral: null };
        }

        cuerpo = analisis.data;
      }

      try {
        const respuesta = await fetch(endpoint, {
          method: metodo,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cuerpo),
        });

        if (!respuesta.ok) {
          const datos = await respuesta.json().catch(() => null);
          const mensaje: string = datos?.error ?? MENSAJE_ERROR_GENERICO;

          if (datos?.campo) {
            return { errores: { [campoDeRespuesta(datos.campo)]: mensaje }, errorGeneral: null };
          }

          return { errores: {}, errorGeneral: mensaje };
        }
      } catch {
        return { errores: {}, errorGeneral: MENSAJE_ERROR_GENERICO };
      }

      router.push(RUTA_USUARIOS);
      router.refresh();
      return ESTADO_INICIAL;
    },
    ESTADO_INICIAL,
  );

  return (
    <form action={enviarFormulario} className="mt-6 flex flex-col gap-5">
      <div className="grid gap-5 md:grid-cols-2">
        <CampoTexto
          id="nombres"
          name="nombres"
          etiqueta="Nombres"
          autoComplete="given-name"
          defaultValue={valoresIniciales.nombres}
          error={estado.errores.nombres}
        />

        <CampoTexto
          id="apellidos"
          name="apellidos"
          etiqueta="Apellidos"
          autoComplete="family-name"
          defaultValue={valoresIniciales.apellidos}
          error={estado.errores.apellidos}
        />

        {esCreacion ? (
          <CampoTexto
            id="rut"
            name="rut"
            etiqueta="RUT"
            ayuda="Con guion y dígito verificador. Será el usuario de ingreso."
            placeholder="12345678-9"
            defaultValue={valoresIniciales.rut}
            error={estado.errores.rut}
          />
        ) : null}

        <CampoTexto
          id="email"
          name="email"
          etiqueta="Email"
          type="email"
          autoComplete="email"
          defaultValue={valoresIniciales.email}
          error={estado.errores.email}
        />

        <CampoSelect
          id="rol"
          name="rol"
          etiqueta="Rol"
          opciones={OPCIONES_ROL}
          defaultValue={valoresIniciales.rol}
          error={estado.errores.rol}
        />
      </div>

      {esCreacion ? (
        <div className="grid gap-5 md:grid-cols-2">
          <CampoContrasena
            id="contrasena"
            name="contrasena"
            etiqueta="Contraseña"
            ayuda={MENSAJE_COMPLEJIDAD_CONTRASENA}
            autoComplete="new-password"
            error={estado.errores.contrasena}
          />

          <CampoContrasena
            id="confirmacionContrasena"
            name="confirmacionContrasena"
            etiqueta="Repetir contraseña"
            autoComplete="new-password"
            error={estado.errores.confirmacionContrasena}
          />
        </div>
      ) : null}

      {estado.errorGeneral ? (
        <p role="alert" className="text-sm font-medium text-gob-danger">
          {estado.errorGeneral}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Boton
          type="submit"
          variante="primario"
          cargando={enviando}
          textoCargando="Guardando..."
        >
          {esCreacion ? "Crear usuario" : "Guardar cambios"}
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
