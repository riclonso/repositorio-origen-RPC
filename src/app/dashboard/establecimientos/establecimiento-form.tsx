"use client";

import { useActionState, useReducer } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ZodError } from "zod";
import { establecimientoFormSchema } from "@/modules/establecimiento/schemas/establecimiento.schema";
import { Boton } from "@/shared/components/Boton";
import { CampoSelect, type OpcionSelect } from "@/shared/components/CampoSelect";
import { CampoTexto } from "@/shared/components/CampoTexto";
import { RUTA_ESTABLECIMIENTOS } from "./ruta-establecimientos";

const MENSAJE_ERROR_GENERICO = "No se pudo guardar el establecimiento. Intenta nuevamente.";

export type ValoresEstablecimientoForm = {
  rut: string;
  nombre: string;
  direccion: string;
  tipoId: string;
};

type EstadoEstablecimientoForm = {
  errores: Record<string, string>;
  errorGeneral: string | null;
};

const ESTADO_INICIAL: EstadoEstablecimientoForm = { errores: {}, errorGeneral: null };

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

type EstablecimientoFormProps = {
  modo: "crear" | "editar";
  endpoint: string;
  metodo: "POST" | "PUT";
  valoresIniciales: ValoresEstablecimientoForm;
  // Vienen de la base a través de la página. En el alta incluyen una opción vacía que el esquema
  // rechaza; en la edición incluyen el tipo vigente aunque esté inactivo.
  opcionesTipo: OpcionSelect[];
};

export function EstablecimientoForm({
  modo,
  endpoint,
  metodo,
  valoresIniciales,
  opcionesTipo,
}: EstablecimientoFormProps) {
  const router = useRouter();
  const esCreacion = modo === "crear";

  // Campos controlados: un error de validación no debe borrar lo que el operador ya escribió
  // (React 19 resetea los campos no controlados de un `<form action>` al terminar la acción).
  const [valores, actualizarValores] = useReducer(
    (actuales: ValoresEstablecimientoForm, cambios: Partial<ValoresEstablecimientoForm>) => ({
      ...actuales,
      ...cambios,
    }),
    valoresIniciales,
  );

  function actualizarCampo(campo: keyof ValoresEstablecimientoForm, valor: string) {
    actualizarValores({ [campo]: valor });
  }

  const [estado, enviarFormulario, enviando] = useActionState<
    EstadoEstablecimientoForm,
    FormData
  >(async (_estadoPrevio, formData) => {
    const bruto = {
      rut: String(formData.get("rut") ?? ""),
      nombre: String(formData.get("nombre") ?? ""),
      direccion: String(formData.get("direccion") ?? ""),
      tipoId: String(formData.get("tipoId") ?? ""),
    };

    const analisis = establecimientoFormSchema.safeParse(bruto);

    if (!analisis.success) {
      return { errores: aErroresPorCampo(analisis.error), errorGeneral: null };
    }

    try {
      const respuesta = await fetch(endpoint, {
        method: metodo,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(analisis.data),
      });

      if (!respuesta.ok) {
        const datos = await respuesta.json().catch(() => null);
        const mensaje: string = datos?.error ?? MENSAJE_ERROR_GENERICO;

        if (datos?.campo) {
          return { errores: { [String(datos.campo)]: mensaje }, errorGeneral: null };
        }

        return { errores: {}, errorGeneral: mensaje };
      }
    } catch {
      return { errores: {}, errorGeneral: MENSAJE_ERROR_GENERICO };
    }

    router.push(esCreacion ? `${RUTA_ESTABLECIMIENTOS}?creado=1` : RUTA_ESTABLECIMIENTOS);
    router.refresh();
    return ESTADO_INICIAL;
  }, ESTADO_INICIAL);

  return (
    <form action={enviarFormulario} className="mt-6 flex flex-col gap-5">
      <div className="grid gap-5 md:grid-cols-2">
        <CampoTexto
          id="rut"
          name="rut"
          etiqueta="RUT"
          ayuda="Con guion y dígito verificador."
          placeholder="76123456-7"
          value={valores.rut}
          onChange={(evento) => actualizarCampo("rut", evento.target.value)}
          error={estado.errores.rut}
        />

        <CampoTexto
          id="nombre"
          name="nombre"
          etiqueta="Nombre"
          value={valores.nombre}
          onChange={(evento) => actualizarCampo("nombre", evento.target.value)}
          error={estado.errores.nombre}
        />

        <CampoTexto
          id="direccion"
          name="direccion"
          etiqueta="Dirección"
          value={valores.direccion}
          onChange={(evento) => actualizarCampo("direccion", evento.target.value)}
          error={estado.errores.direccion}
        />

        <CampoSelect
          id="tipoId"
          name="tipoId"
          etiqueta="Tipo de establecimiento"
          opciones={opcionesTipo}
          value={valores.tipoId}
          onChange={(evento) => actualizarCampo("tipoId", evento.target.value)}
          error={estado.errores.tipoId}
        />
      </div>

      {estado.errorGeneral ? (
        <p role="alert" className="text-sm font-medium text-gob-danger">
          {estado.errorGeneral}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Boton type="submit" variante="primario" cargando={enviando} textoCargando="Guardando...">
          {esCreacion ? "Crear establecimiento" : "Guardar cambios"}
        </Boton>

        <Link
          href={RUTA_ESTABLECIMIENTOS}
          className="inline-flex items-center justify-center rounded-md border border-gob-accent bg-white px-4 py-2 text-sm font-medium text-gob-gray-a transition-colors hover:bg-gob-neutral active:translate-y-[1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
