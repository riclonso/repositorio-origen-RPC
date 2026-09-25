"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { nombreCompleto } from "@/modules/usuarios/domain/entities/Usuario";
import { esPerfilAdministrador } from "@/modules/perfiles/domain/entities/Perfil";
import { BotonIcono } from "@/shared/components/BotonIcono";
import { Interruptor } from "@/shared/components/Interruptor";
import { IconoContrasena, IconoDesbloquear, IconoEditar } from "@/shared/components/iconos";
import { DialogoConfirmacion } from "@/shared/components/DialogoConfirmacion";
import { TablaPanel, type ColumnaTabla } from "@/shared/components/TablaPanel";

// Compartida entre `/dashboard/usuarios` (ADMIN) y `/revisor/usuarios` (REVISOR_REPOSITORIO):
// misma tabla, cada área aporta su propia base de ruta y si su actor es o no ADMIN.
export type FilaUsuarioVista = {
  id: string;
  nombres: string;
  apellidos: string;
  rut: string;
  email: string;
  username: string;
  perfilCodigo: string;
  perfilNombre: string;
  activo: boolean;
  tieneContrasena: boolean;
  creadoEl: string;
  // Bloqueo progresivo por intentos fallidos de login. `bloqueada` ya viene calculado desde el
  // servidor (contra el `ahora` de esa petición); `vecesBloqueada` alimenta el tooltip del chip;
  // `bloqueadaHastaTexto` es la fecha/hora ya formateada en el servidor, o `null` sin bloqueo.
  bloqueada: boolean;
  vecesBloqueada: number;
  bloqueadaHastaTexto: string | null;
};

const MENSAJE_ERROR_GENERICO = "No se pudo actualizar el estado del usuario. Intenta nuevamente.";
const MENSAJE_ERROR_DESBLOQUEO = "No se pudo desbloquear la cuenta. Intenta nuevamente.";

type ControlEstadoCuentaProps = {
  fila: FilaUsuarioVista;
  esPropia: boolean;
  puedeGestionarCuenta: boolean;
  persona: string;
  onCambiarEstado: () => void;
};

// Extraído de `AccionesFila` para mantener la complejidad de esa función dentro de un rango
// legible: es la única parte con tres desenlaces posibles (cuenta propia / gestionable / ajena
// sin permiso), el resto de `AccionesFila` son botones independientes con un solo `if`.
//
// Una cuenta no puede desactivarse a sí misma, así que en la fila propia NO se muestra el
// interruptor: mostrarlo bloqueado invitaba a intentarlo. En su lugar, una etiqueta neutra indica
// que es la cuenta en uso. El interruptor reemplaza a la columna Estado (muestra y cambia el
// estado a la vez); el texto al lado mantiene el estado legible sin depender del color.
function ControlEstadoCuenta({
  fila,
  esPropia,
  puedeGestionarCuenta,
  persona,
  onCambiarEstado,
}: ControlEstadoCuentaProps) {
  if (esPropia) {
    // Conserva el ancho de la columna de estado: sin el espacio del interruptor, los botones
    // de editar y contraseña de la fila propia se desplazan respecto de las demás filas.
    return (
      <span className="flex w-28 items-center gap-2">
        <span aria-hidden="true" className="h-5 w-9 shrink-0" />
        <span className="text-sm text-gob-gray-a">Tu cuenta</span>
      </span>
    );
  }

  const etiquetaEstado = fila.activo ? "Activo" : "Inactivo";

  if (!puedeGestionarCuenta) {
    return (
      <span className="flex w-28 items-center gap-2">
        <span aria-hidden="true" className="h-5 w-9 shrink-0" />
        <span className="w-16 text-sm text-gob-gray-a">{etiquetaEstado}</span>
      </span>
    );
  }

  return (
    <span className="flex w-28 items-center gap-2">
      <Interruptor
        activado={fila.activo}
        etiqueta={`Cuenta de ${persona} activa`}
        onCambiar={onCambiarEstado}
      />
      <span className="w-16 text-sm text-gob-gray-a">{etiquetaEstado}</span>
    </span>
  );
}

type AccionesFilaProps = {
  fila: FilaUsuarioVista;
  esPropia: boolean;
  rutaBase: string;
  actorEsAdmin: boolean;
  onCambiarEstado: () => void;
  onDesbloquear: () => void;
};

function AccionesFila({
  fila,
  esPropia,
  rutaBase,
  actorEsAdmin,
  onCambiarEstado,
  onDesbloquear,
}: AccionesFilaProps) {
  const persona = nombreCompleto(fila);

  // Un actor sin perfil ADMIN (área /revisor) no puede editar, cambiar la contraseña ni
  // activar/desactivar una cuenta con perfil ADMIN: la regla de negocio vive en `application/`
  // (fuente de verdad, ver CrearUsuario/ActualizarUsuario/CambiarEstadoUsuario/
  // RestablecerContrasena); aquí solo se OCULTA la acción para no ofrecer un botón que el
  // servidor rechazaría con PERFIL_ADMIN_RESTRINGIDO.
  const puedeGestionarCuenta = actorEsAdmin || !esPerfilAdministrador(fila.perfilCodigo);

  return (
    <div className="flex items-center justify-end gap-2">
      {puedeGestionarCuenta ? (
        <BotonIcono
          etiqueta={`Editar a ${persona}`}
          Icono={IconoEditar}
          href={`${rutaBase}/${fila.id}/editar`}
        />
      ) : null}

      {puedeGestionarCuenta ? (
        <BotonIcono
          etiqueta={
            fila.tieneContrasena
              ? `Cambiar la contraseña de ${persona}`
              : `Definir la contraseña de ${persona}`
          }
          Icono={IconoContrasena}
          href={`${rutaBase}/${fila.id}/contrasena`}
        />
      ) : null}

      {puedeGestionarCuenta && fila.bloqueada ? (
        <BotonIcono
          etiqueta={`Desbloquear la cuenta de ${persona}`}
          Icono={IconoDesbloquear}
          onClick={onDesbloquear}
        />
      ) : null}

      <ControlEstadoCuenta
        fila={fila}
        esPropia={esPropia}
        puedeGestionarCuenta={puedeGestionarCuenta}
        persona={persona}
        onCambiarEstado={onCambiarEstado}
      />
    </div>
  );
}

function ChipPendiente() {
  return (
    <span className="mt-1 block w-fit rounded-full bg-[#fff5e3] px-2 py-0.5 text-xs font-semibold text-[#7a4b10]">
      Pendiente de activación
    </span>
  );
}

// Texto del tooltip: cuenta cuántas veces se ha bloqueado la cuenta EN TOTAL (histórico
// monotónico, ver `vecesBloqueada` en `modules/usuarios/domain/entities/Usuario.ts`), junto a la
// fecha/hora hasta la que dura el bloqueo VIGENTE.
function tituloChipBloqueada(fila: FilaUsuarioVista): string {
  const veces = fila.vecesBloqueada === 1 ? "1 vez" : `${fila.vecesBloqueada} veces`;
  const hasta = fila.bloqueadaHastaTexto ? ` Bloqueada hasta ${fila.bloqueadaHastaTexto}.` : "";
  return `Bloqueada ${veces} en total.${hasta}`;
}

function ChipBloqueada({ fila }: { fila: FilaUsuarioVista }) {
  return (
    <span
      title={tituloChipBloqueada(fila)}
      className="mt-1 block w-fit rounded-full bg-gob-danger/10 px-2 py-0.5 text-xs font-semibold text-gob-danger"
    >
      Bloqueada
    </span>
  );
}

const COLUMNAS: ColumnaTabla<FilaUsuarioVista>[] = [
  {
    encabezado: "Nombre",
    encabezadoFila: true,
    className: "min-w-36 px-3 py-2 font-medium text-gob-black",
    contenido: (fila) => (
      <>
        <span>{nombreCompleto(fila)}</span>
        {!fila.tieneContrasena ? <ChipPendiente /> : null}
        {fila.bloqueada ? <ChipBloqueada fila={fila} /> : null}
      </>
    ),
  },
  {
    encabezado: "RUT",
    className: "whitespace-nowrap px-3 py-2 tabular-nums text-gob-gray-a",
    contenido: (fila) => fila.rut,
  },
  {
    encabezado: "Email",
    className: "px-3 py-2 text-gob-gray-a",
    contenido: (fila) => fila.email,
  },
  {
    encabezado: "Perfil",
    className: "whitespace-nowrap px-3 py-2 text-gob-gray-a",
    contenido: (fila) => fila.perfilNombre,
  },
  {
    encabezado: "Creado",
    className: "whitespace-nowrap px-3 py-2 tabular-nums text-gob-gray-a",
    contenido: (fila) => fila.creadoEl,
  },
];

type TablaUsuariosProps = {
  filas: FilaUsuarioVista[];
  actorId: string;
  descripcion: string;
  rutaBase: string;
  // `true` en `/dashboard` (perfil ADMIN), `false` en `/revisor` (perfil REVISOR_REPOSITORIO).
  // Como cada área mapea 1:1 a un perfil (garantizado por `src/proxy.ts`), basta un literal que
  // cada `page.tsx` de área pasa directamente, sin leer la sesión en este componente compartido.
  actorEsAdmin: boolean;
};

export function TablaUsuarios({ filas, actorId, descripcion, rutaBase, actorEsAdmin }: TablaUsuariosProps) {
  const router = useRouter();
  const [objetivo, setObjetivo] = useState<FilaUsuarioVista | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [objetivoDesbloqueo, setObjetivoDesbloqueo] = useState<FilaUsuarioVista | null>(null);
  const [procesandoDesbloqueo, setProcesandoDesbloqueo] = useState(false);
  const [errorDesbloqueo, setErrorDesbloqueo] = useState<string | null>(null);

  function cerrarDialogo() {
    if (procesando) return;
    setObjetivo(null);
    setError(null);
  }

  async function confirmarCambioEstado() {
    if (!objetivo) return;

    setProcesando(true);
    setError(null);

    try {
      const respuesta = await fetch(`/api/usuarios/${objetivo.id}/estado`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activo: !objetivo.activo }),
      });

      if (!respuesta.ok) {
        const datos = await respuesta.json().catch(() => null);
        setProcesando(false);
        setError(datos?.error ?? MENSAJE_ERROR_GENERICO);
        return;
      }

      setProcesando(false);
      setObjetivo(null);
      router.refresh();
    } catch {
      setProcesando(false);
      setError(MENSAJE_ERROR_GENERICO);
    }
  }

  function cerrarDialogoDesbloqueo() {
    if (procesandoDesbloqueo) return;
    setObjetivoDesbloqueo(null);
    setErrorDesbloqueo(null);
  }

  async function confirmarDesbloqueo() {
    if (!objetivoDesbloqueo) return;

    setProcesandoDesbloqueo(true);
    setErrorDesbloqueo(null);

    try {
      const respuesta = await fetch(`/api/usuarios/${objetivoDesbloqueo.id}/desbloqueo`, {
        method: "POST",
      });

      if (!respuesta.ok) {
        const datos = await respuesta.json().catch(() => null);
        setProcesandoDesbloqueo(false);
        setErrorDesbloqueo(datos?.error ?? MENSAJE_ERROR_DESBLOQUEO);
        return;
      }

      setProcesandoDesbloqueo(false);
      setObjetivoDesbloqueo(null);
      router.refresh();
    } catch {
      setProcesandoDesbloqueo(false);
      setErrorDesbloqueo(MENSAJE_ERROR_DESBLOQUEO);
    }
  }

  return (
    <>
      <TablaPanel
        descripcion={descripcion}
        columnas={COLUMNAS}
        filas={filas}
        claveFila={(fila) => fila.id}
        anchoMinimo="min-w-3xl"
        acciones={(fila) => (
          <AccionesFila
            fila={fila}
            esPropia={fila.id === actorId}
            rutaBase={rutaBase}
            actorEsAdmin={actorEsAdmin}
            onCambiarEstado={() => setObjetivo(fila)}
            onDesbloquear={() => setObjetivoDesbloqueo(fila)}
          />
        )}
        tarjeta={(fila) => (
          <>
            <p className="font-semibold text-gob-black">{nombreCompleto(fila)}</p>
            {!fila.tieneContrasena ? <ChipPendiente /> : null}
            {fila.bloqueada ? <ChipBloqueada fila={fila} /> : null}
            <p className="mt-1 tabular-nums">{fila.rut}</p>
            <p className="break-all">{fila.email}</p>
            <p className="mt-1">
              {fila.perfilNombre}, creado el {fila.creadoEl}
            </p>
            <div className="mt-3">
              <AccionesFila
                fila={fila}
                esPropia={fila.id === actorId}
                rutaBase={rutaBase}
                actorEsAdmin={actorEsAdmin}
                onCambiarEstado={() => setObjetivo(fila)}
                onDesbloquear={() => setObjetivoDesbloqueo(fila)}
              />
            </div>
          </>
        )}
      />

      <DialogoConfirmacion
        abierto={objetivo !== null}
        titulo={objetivo?.activo ? "Desactivar usuario" : "Activar usuario"}
        descripcion={
          objetivo
            ? objetivo.activo
              ? `${nombreCompleto(objetivo)} dejará de poder ingresar al sistema. Su historial se conserva.`
              : `${nombreCompleto(objetivo)} podrá volver a ingresar al sistema.`
            : ""
        }
        textoConfirmar={objetivo?.activo ? "Desactivar" : "Activar"}
        textoConfirmando="Guardando..."
        variante={objetivo?.activo ? "peligro" : "primario"}
        procesando={procesando}
        error={error}
        onConfirmar={confirmarCambioEstado}
        onCancelar={cerrarDialogo}
      />

      <DialogoConfirmacion
        abierto={objetivoDesbloqueo !== null}
        titulo="Desbloquear cuenta"
        descripcion={
          objetivoDesbloqueo
            ? `${nombreCompleto(objetivoDesbloqueo)} podrá volver a intentar iniciar sesión de inmediato.`
            : ""
        }
        textoConfirmar="Desbloquear"
        textoConfirmando="Desbloqueando..."
        variante="primario"
        procesando={procesandoDesbloqueo}
        error={errorDesbloqueo}
        onConfirmar={confirmarDesbloqueo}
        onCancelar={cerrarDialogoDesbloqueo}
      />
    </>
  );
}
