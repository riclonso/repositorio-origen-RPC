"use client";

import { startTransition, useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ZodError } from "zod";
import {
  crearUsuarioFormSchema,
  editarUsuarioSchema,
} from "@/modules/usuarios/schemas/usuario.schema";
import { esPerfilNotificador } from "@/modules/perfiles/domain/entities/Perfil";
import { Boton } from "@/shared/components/Boton";
import { CampoSelect, type OpcionSelect } from "@/shared/components/CampoSelect";
import { CampoSeleccionMultiple, type OpcionSeleccionMultiple } from "@/shared/components/CampoSeleccionMultiple";
import { CampoTexto } from "@/shared/components/CampoTexto";
import { RUTA_USUARIOS } from "./ruta-usuarios";

const MENSAJE_ERROR_GENERICO = "No se pudo guardar el usuario. Intenta nuevamente.";

export type ValoresUsuarioForm = {
  nombres: string;
  apellidos: string;
  rut: string;
  email: string;
  perfilCodigo: string;
  formatosExcelIds: string[];
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
  // Vienen de la base a través de la página. En el alta incluyen una opción vacía que el
  // esquema rechaza, para que el perfil sea una elección explícita del operador.
  opcionesPerfil: OpcionSelect[];
  // Formatos activos + los que la persona ya tuviera asignados (ver `opciones-formato-excel.ts`).
  opcionesFormatoExcel: OpcionSeleccionMultiple[];
};

export function UsuarioForm({
  modo,
  endpoint,
  metodo,
  valoresIniciales,
  opcionesPerfil,
  opcionesFormatoExcel,
}: UsuarioFormProps) {
  const router = useRouter();
  const esCreacion = modo === "crear";

  // Los campos van CONTROLADOS a propósito. React 19 resetea los campos no controlados de un
  // `<form action={...}>` en cuanto la acción termina, también cuando devuelve errores de
  // validación: el operador corregía un RUT mal escrito y encontraba el resto del formulario en
  // blanco. Con el valor en estado, un error deja de costar volver a teclear todo. Al crear NO hay
  // campos de contraseña: la cuenta nace pendiente y la persona la fija por el enlace.
  const [valores, setValores] = useState(valoresIniciales);

  function actualizarCampo(campo: keyof ValoresUsuarioForm, valor: string) {
    setValores((previos) => ({ ...previos, [campo]: valor }));
  }

  const [estado, enviarFormulario, enviando] = useActionState<EstadoUsuarioForm, FormData>(
    async (_estadoPrevio, formData) => {
      // `formatosExcelIds` NO sale de `formData`: el multi-select controla su propio estado
      // (`valores.formatosExcelIds`) y se lee directamente de ahí, igual que el resto de los
      // campos controlados de este formulario.
      const bruto = {
        nombres: String(formData.get("nombres") ?? ""),
        apellidos: String(formData.get("apellidos") ?? ""),
        email: String(formData.get("email") ?? ""),
        perfilCodigo: String(formData.get("perfilCodigo") ?? ""),
        rut: String(formData.get("rut") ?? ""),
        formatosExcelIds: valores.formatosExcelIds,
      };

      let cuerpo: Record<string, unknown>;

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
          perfilCodigo: analisis.data.perfilCodigo,
          formatosExcelIds: analisis.data.formatosExcelIds,
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

      router.push(esCreacion ? `${RUTA_USUARIOS}?creado=1` : RUTA_USUARIOS);
      router.refresh();
      return ESTADO_INICIAL;
    },
    ESTADO_INICIAL,
  );

  return (
    // NO se usa `action={enviarFormulario}`: React reconoce ese patrón como una "form action" y,
    // al asentarse, llama al `.reset()` NATIVO del `<form>` (ver `TransitionAwareHostComponent` /
    // el flag `Reset` en `react-dom-client`) para limpiar los campos no controlados. Ese reseteo
    // nativo toca TODOS los controles del formulario, incluido un `<select>`/checkbox recién
    // remontado con su valor correcto: pisa ese valor en el mismo commit. Ese mecanismo está
    // gateado específicamente por la prop `action` del elemento `<form>` (una comprobación
    // estática de `tagName`+nombre de prop en la fase de commit, ajena a `ReactSharedInternals.T`
    // / `startTransition`), así que evitarla evita el reseteo por completo sin importar cómo se
    // invoque la función después.
    //
    // `enviarFormulario` (el dispatch que devuelve `useActionState`) sigue pudiendo llamarse
    // directamente, pero DEBE envolverse en `startTransition`: sin eso, React no marca la
    // actualización como transición (`dispatchActionState` revisa `ReactSharedInternals.T`), y
    // `enviando` (`isPending`) deja de reflejar la petición en curso — React lo advierte en
    // consola ("called outside of a transition"). Con `startTransition`, `estado`/`enviando`
    // vuelven a trackearse igual que con `action={...}`.
    <form
      onSubmit={(evento) => {
        evento.preventDefault();
        const formData = new FormData(evento.currentTarget);

        startTransition(() => {
          enviarFormulario(formData);
        });
      }}
      className="mt-6 flex flex-col gap-5"
    >
      <div className="grid gap-5 md:grid-cols-2">
        <CampoTexto
          id="nombres"
          name="nombres"
          etiqueta="Nombres"
          autoComplete="given-name"
          value={valores.nombres}
          onChange={(evento) => actualizarCampo("nombres", evento.target.value)}
          error={estado.errores.nombres}
        />

        <CampoTexto
          id="apellidos"
          name="apellidos"
          etiqueta="Apellidos"
          autoComplete="family-name"
          value={valores.apellidos}
          onChange={(evento) => actualizarCampo("apellidos", evento.target.value)}
          error={estado.errores.apellidos}
        />

        {esCreacion ? (
          <CampoTexto
            id="rut"
            name="rut"
            etiqueta="RUT"
            ayuda="Con guion y dígito verificador. Será el usuario de ingreso."
            placeholder="12345678-9"
            value={valores.rut}
            onChange={(evento) => actualizarCampo("rut", evento.target.value)}
            error={estado.errores.rut}
          />
        ) : null}

        <CampoTexto
          id="email"
          name="email"
          etiqueta="Email"
          type="email"
          autoComplete="email"
          value={valores.email}
          onChange={(evento) => actualizarCampo("email", evento.target.value)}
          error={estado.errores.email}
        />

        <CampoSelect
          id="perfilCodigo"
          name="perfilCodigo"
          etiqueta="Perfil"
          opciones={opcionesPerfil}
          value={valores.perfilCodigo}
          onChange={(evento) => {
            const perfilCodigo = evento.target.value;

            setValores((previos) => ({
              ...previos,
              perfilCodigo,
              // Cambiar a un perfil que no sea Notificador RPC limpia la selección: conservarla
              // en silencio dejaría formatos asignados a un perfil que el esquema los rechaza.
              formatosExcelIds: esPerfilNotificador(perfilCodigo) ? previos.formatosExcelIds : [],
            }));
          }}
          error={estado.errores.perfilCodigo}
        />
      </div>

      {esPerfilNotificador(valores.perfilCodigo) ? (
        <CampoSeleccionMultiple
          id="formatosExcelIds"
          etiqueta="Formatos de archivo asignados"
          opciones={opcionesFormatoExcel}
          valoresSeleccionados={valores.formatosExcelIds}
          onCambiar={(formatosExcelIds) =>
            setValores((previos) => ({ ...previos, formatosExcelIds }))
          }
          ayuda="Un notificador debe tener al menos un formato asignado."
          error={estado.errores.formatosExcelIds}
        />
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
