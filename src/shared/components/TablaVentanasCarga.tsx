"use client";

import { useState, ViewTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Boton } from "@/shared/components/Boton";
import { CampoTexto } from "@/shared/components/CampoTexto";
import { CampoSelect, type OpcionSelect } from "@/shared/components/CampoSelect";
import { DialogoConfirmacion } from "@/shared/components/DialogoConfirmacion";
import { Interruptor } from "@/shared/components/Interruptor";
import { IconoEliminar } from "@/shared/components/iconos";
import { formatearFechaCalendario } from "@/shared/utils/fecha";

const MENSAJE_ERROR_GENERICO = "No se pudo completar la operación. Intenta nuevamente.";

// Vista liviana para la tabla: fechas ya como texto ISO (llegan así del servidor). `abierta` es
// un estado calculado en el servidor al momento del `fetch`/render, nunca persistido.
export type VentanaCargaVista = {
  id: string;
  anio: number;
  fechaApertura: string;
  fechaVencimiento: string;
  // Formato de archivo concreto que la ventana acepta (corrección posterior a RF-15 ampliación:
  // reemplaza el enum `tipoArchivo`). `formatoExcelNombre` viene denormalizado del servidor.
  formatoExcelId: string;
  formatoExcelNombre: string;
  // `publicada` sí es un campo persistido (a diferencia de `abierta`): nace en `false` y se
  // cambia con su propio endpoint PATCH, nunca junto a fechas/formato.
  publicada: boolean;
  creadoPorId: string;
  creadoPorNombre: string;
  // No nulo si la ventana ya fue eliminada (lógicamente, porque tenía cargas asociadas). Una
  // eliminación física simplemente hace desaparecer la fila del listado siguiente.
  eliminadaEn: string | null;
  abierta: boolean;
  // Cantidad de `CargaArchivo` en estado APROBADA asociadas a esta ventana, resuelta server-side
  // vía `_count` de Prisma (nunca contada en el cliente).
  cantidadCargas: number;
  // Ruta de detalle ya resuelta en el servidor (`ListadoVentanasCarga.tsx`), como string: este
  // componente es Client ("use client" arriba, por sus formularios/diálogos) y no puede recibir
  // una función como prop desde un Server Component.
  rutaDetalle: string;
};

// Un `<input type="date">` espera "AAAA-MM-DD". El ISO ya viaja en UTC "de pared" (mismo
// convenio que el resto del proyecto), así que tomar los primeros 10 caracteres es equivalente a
// convertir con `getUTCFullYear`/`getUTCMonth`/`getUTCDate`, sin arrastrar la hora local del
// navegador.
function aFechaInputValue(iso: string): string {
  return iso.slice(0, 10);
}

function formatearFechaIso(iso: string): string {
  return formatearFechaCalendario(new Date(iso));
}

type FormularioCreacion = { anio: string; fechaApertura: string; fechaVencimiento: string; formatoExcelId: string };

function formularioCreacionVacio(opcionesFormatoExcel: OpcionSelect[]): FormularioCreacion {
  return {
    anio: "",
    fechaApertura: "",
    fechaVencimiento: "",
    formatoExcelId: opcionesFormatoExcel[0]?.valor ?? "",
  };
}

type FormularioEdicion = { fechaApertura: string; fechaVencimiento: string; formatoExcelId: string };

// Tabla + formulario de creación, compartidos entre `/dashboard/ventanas-carga` (ADMIN) y
// `/revisor/ventanas-carga` (REVISOR_REPOSITORIO): ambos perfiles pueden crear ventanas, editar
// sus fechas/formato de archivo y publicarlas (RF-15). Las fechas y el formato de archivo se
// pueden editar SIEMPRE, incluso si la ventana ya tiene cargas asociadas (decisión explícita del
// diseño): no hay ninguna comprobación de eso aquí. Eliminar es distinto: ADMIN puede eliminar
// cualquiera, REVISOR_REPOSITORIO solo las que él mismo creó — el botón se oculta según
// `esAdmin`/`actorId`, pero la regla real la aplica el servidor (`EliminarVentanaCarga.ts`), esto
// es solo para no ofrecer una acción que igual se rechazaría. Publicar/despublicar SÍ es simétrico
// entre ambos perfiles, sin ocultamiento alguno.
type TablaVentanasCargaProps = {
  ventanas: VentanaCargaVista[];
  actorId: string;
  esAdmin: boolean;
  // Formatos activos + los que alguna ventana ya tuviera asignados aunque estén dados de baja
  // (resuelto server-side en `ListadoVentanasCarga.tsx`), para poblar tanto el `<select>` de
  // creación como el de edición inline.
  opcionesFormatoExcel: OpcionSelect[];
};

export function TablaVentanasCarga({
  ventanas,
  actorId,
  esAdmin,
  opcionesFormatoExcel,
}: TablaVentanasCargaProps) {
  const router = useRouter();

  const [formulario, setFormulario] = useState<FormularioCreacion>(() =>
    formularioCreacionVacio(opcionesFormatoExcel),
  );
  const [creando, setCreando] = useState(false);
  const [erroresCreacion, setErroresCreacion] = useState<Record<string, string>>({});

  const [idEnEdicion, setIdEnEdicion] = useState<string | null>(null);
  const [edicion, setEdicion] = useState<FormularioEdicion>({
    fechaApertura: "",
    fechaVencimiento: "",
    formatoExcelId: opcionesFormatoExcel[0]?.valor ?? "",
  });
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  const [errorEdicion, setErrorEdicion] = useState<string | null>(null);

  const [objetivoEliminacion, setObjetivoEliminacion] = useState<VentanaCargaVista | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [errorEliminacion, setErrorEliminacion] = useState<string | null>(null);

  const [objetivoPublicacion, setObjetivoPublicacion] = useState<VentanaCargaVista | null>(null);
  const [cambiandoPublicacion, setCambiandoPublicacion] = useState(false);
  const [errorPublicacion, setErrorPublicacion] = useState<string | null>(null);

  async function crearVentana() {
    setCreando(true);
    setErroresCreacion({});

    try {
      const respuesta = await fetch("/api/dashboard/ventanas-carga", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          anio: formulario.anio,
          fechaApertura: formulario.fechaApertura,
          fechaVencimiento: formulario.fechaVencimiento,
          formatoExcelId: formulario.formatoExcelId,
        }),
      });

      if (!respuesta.ok) {
        const datos = await respuesta.json().catch(() => null);
        const mensaje: string = datos?.error ?? MENSAJE_ERROR_GENERICO;
        setErroresCreacion({ [String(datos?.campo ?? "general")]: mensaje });
        return;
      }

      setFormulario(formularioCreacionVacio(opcionesFormatoExcel));
      router.refresh();
    } catch {
      setErroresCreacion({ general: MENSAJE_ERROR_GENERICO });
    } finally {
      setCreando(false);
    }
  }

  function iniciarEdicion(ventana: VentanaCargaVista) {
    setIdEnEdicion(ventana.id);
    setErrorEdicion(null);
    setEdicion({
      fechaApertura: aFechaInputValue(ventana.fechaApertura),
      fechaVencimiento: aFechaInputValue(ventana.fechaVencimiento),
      formatoExcelId: ventana.formatoExcelId,
    });
  }

  function cancelarEdicion() {
    if (guardandoEdicion) return;
    setIdEnEdicion(null);
    setErrorEdicion(null);
  }

  async function guardarEdicion() {
    if (!idEnEdicion) return;

    setGuardandoEdicion(true);
    setErrorEdicion(null);

    try {
      const respuesta = await fetch(`/api/dashboard/ventanas-carga/${idEnEdicion}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(edicion),
      });

      if (!respuesta.ok) {
        const datos = await respuesta.json().catch(() => null);
        setErrorEdicion(datos?.error ?? MENSAJE_ERROR_GENERICO);
        return;
      }

      setIdEnEdicion(null);
      router.refresh();
    } catch {
      setErrorEdicion(MENSAJE_ERROR_GENERICO);
    } finally {
      setGuardandoEdicion(false);
    }
  }

  async function confirmarEliminacion() {
    if (!objetivoEliminacion) return;

    setEliminando(true);
    setErrorEliminacion(null);

    try {
      const respuesta = await fetch(`/api/dashboard/ventanas-carga/${objetivoEliminacion.id}`, {
        method: "DELETE",
      });

      if (!respuesta.ok) {
        const datos = await respuesta.json().catch(() => null);
        setErrorEliminacion(datos?.error ?? MENSAJE_ERROR_GENERICO);
        setEliminando(false);
        return;
      }

      setObjetivoEliminacion(null);
      setEliminando(false);
      router.refresh();
    } catch {
      setErrorEliminacion(MENSAJE_ERROR_GENERICO);
      setEliminando(false);
    }
  }

  async function confirmarCambioPublicacion() {
    if (!objetivoPublicacion) return;

    setCambiandoPublicacion(true);
    setErrorPublicacion(null);

    try {
      const respuesta = await fetch(`/api/dashboard/ventanas-carga/${objetivoPublicacion.id}/publicacion`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicada: !objetivoPublicacion.publicada }),
      });

      if (!respuesta.ok) {
        const datos = await respuesta.json().catch(() => null);
        setErrorPublicacion(datos?.error ?? MENSAJE_ERROR_GENERICO);
        setCambiandoPublicacion(false);
        return;
      }

      setObjetivoPublicacion(null);
      setCambiandoPublicacion(false);
      router.refresh();
    } catch {
      setErrorPublicacion(MENSAJE_ERROR_GENERICO);
      setCambiandoPublicacion(false);
    }
  }

  function puedeEliminar(ventana: VentanaCargaVista): boolean {
    return esAdmin || ventana.creadoPorId === actorId;
  }

  return (
    <div className="mt-6 flex flex-col gap-6">
      <section aria-labelledby="titulo-nueva-ventana" className="rounded-lg border border-gob-accent bg-white p-4">
        <h2 id="titulo-nueva-ventana" className="text-sm font-semibold text-gob-black">
          Nueva ventana de carga
        </h2>

        <div className="mt-3 grid gap-4 sm:grid-cols-4">
          <CampoTexto
            id="anio-nueva-ventana"
            etiqueta="Año"
            type="number"
            value={formulario.anio}
            onChange={(evento) => setFormulario((actual) => ({ ...actual, anio: evento.target.value }))}
            disabled={creando}
            error={erroresCreacion.anio}
          />
          <CampoTexto
            id="apertura-nueva-ventana"
            etiqueta="Fecha de apertura"
            type="date"
            value={formulario.fechaApertura}
            onChange={(evento) =>
              setFormulario((actual) => ({ ...actual, fechaApertura: evento.target.value }))
            }
            disabled={creando}
            error={erroresCreacion.fechaApertura}
          />
          <CampoTexto
            id="vencimiento-nueva-ventana"
            etiqueta="Fecha de vencimiento"
            type="date"
            value={formulario.fechaVencimiento}
            onChange={(evento) =>
              setFormulario((actual) => ({ ...actual, fechaVencimiento: evento.target.value }))
            }
            disabled={creando}
            error={erroresCreacion.fechaVencimiento}
          />
          <CampoSelect
            id="formato-archivo-nueva-ventana"
            etiqueta="Formato de archivo"
            opciones={opcionesFormatoExcel}
            value={formulario.formatoExcelId}
            onChange={(evento) =>
              setFormulario((actual) => ({ ...actual, formatoExcelId: evento.target.value }))
            }
            disabled={creando}
            error={erroresCreacion.formatoExcelId}
          />
        </div>

        {erroresCreacion.general ? (
          <p role="alert" className="mt-3 text-sm font-medium text-gob-danger">
            {erroresCreacion.general}
          </p>
        ) : null}

        <Boton
          type="button"
          variante="primario"
          className="mt-4 w-fit"
          cargando={creando}
          textoCargando="Creando..."
          onClick={() => void crearVentana()}
        >
          Crear ventana
        </Boton>
      </section>

      {ventanas.length === 0 ? (
        <div className="rounded-lg border border-gob-accent bg-white p-8 text-center">
          <p className="text-base font-semibold text-gob-black">Aún no hay ventanas de carga</p>
          <p className="mt-2 text-sm text-gob-gray-a">
            Crea la primera ventana para habilitar la subida de archivos a los notificadores.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gob-accent bg-white">
          <table className="w-full min-w-2xl border-collapse text-left text-sm">
            <caption className="sr-only">Ventanas de carga configuradas</caption>
            <thead className="bg-gob-neutral text-xs uppercase tracking-wide text-gob-gray-a">
              <tr>
                <th scope="col" className="px-3 py-3 font-semibold">Año</th>
                <th scope="col" className="px-3 py-3 font-semibold">Formato de archivo</th>
                <th scope="col" className="px-3 py-3 font-semibold">Apertura</th>
                <th scope="col" className="px-3 py-3 font-semibold">Vencimiento</th>
                <th scope="col" className="px-3 py-3 font-semibold">Estado</th>
                <th scope="col" className="px-3 py-3 font-semibold">Publicada</th>
                <th scope="col" className="px-3 py-3 font-semibold">Creada por</th>
                <th scope="col" className="px-3 py-3 font-semibold">Cargas</th>
                <th scope="col" className="whitespace-nowrap px-3 py-3 text-right font-semibold">
                  Detalle
                </th>
                <th scope="col" className="whitespace-nowrap px-3 py-3 text-right font-semibold">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gob-accent/60">
              {ventanas.map((ventana) => {
                const enEdicion = idEnEdicion === ventana.id;

                return (
                  <tr key={ventana.id} className="align-middle transition-colors hover:bg-gob-neutral/50">
                    <th scope="row" className="px-3 py-2 font-medium text-gob-black tabular-nums">
                      {ventana.anio}
                    </th>
                    <td className="whitespace-nowrap px-3 py-2 text-gob-gray-a">
                      {enEdicion ? (
                        <select
                          aria-label={`Formato de archivo de la ventana ${ventana.anio}`}
                          value={edicion.formatoExcelId}
                          disabled={guardandoEdicion}
                          onChange={(evento) =>
                            setEdicion((actual) => ({ ...actual, formatoExcelId: evento.target.value }))
                          }
                          className="rounded-md border border-gob-accent bg-white px-2 py-1 text-sm text-gob-black outline-none focus:border-gob-primary focus:ring-2 focus:ring-gob-primary/30"
                        >
                          {opcionesFormatoExcel.map((opcion) => (
                            <option key={opcion.valor} value={opcion.valor}>
                              {opcion.etiqueta}
                            </option>
                          ))}
                        </select>
                      ) : (
                        ventana.formatoExcelNombre
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-gob-gray-a">
                      {enEdicion ? (
                        <input
                          type="date"
                          aria-label={`Fecha de apertura de la ventana ${ventana.anio}`}
                          value={edicion.fechaApertura}
                          disabled={guardandoEdicion}
                          onChange={(evento) =>
                            setEdicion((actual) => ({ ...actual, fechaApertura: evento.target.value }))
                          }
                          className="rounded-md border border-gob-accent bg-white px-2 py-1 text-sm text-gob-black outline-none focus:border-gob-primary focus:ring-2 focus:ring-gob-primary/30"
                        />
                      ) : (
                        formatearFechaIso(ventana.fechaApertura)
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-gob-gray-a">
                      {enEdicion ? (
                        <input
                          type="date"
                          aria-label={`Fecha de vencimiento de la ventana ${ventana.anio}`}
                          value={edicion.fechaVencimiento}
                          disabled={guardandoEdicion}
                          onChange={(evento) =>
                            setEdicion((actual) => ({ ...actual, fechaVencimiento: evento.target.value }))
                          }
                          className="rounded-md border border-gob-accent bg-white px-2 py-1 text-sm text-gob-black outline-none focus:border-gob-primary focus:ring-2 focus:ring-gob-primary/30"
                        />
                      ) : (
                        formatearFechaIso(ventana.fechaVencimiento)
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <span
                        className={`inline-flex items-center rounded-full border bg-white px-2 py-0.5 text-xs font-semibold ${
                          ventana.eliminadaEn
                            ? "border-gob-danger text-gob-danger"
                            : ventana.abierta
                              ? "border-gob-primary text-gob-primary"
                              : "border-gob-gray-a text-gob-gray-a"
                        }`}
                      >
                        {ventana.eliminadaEn ? "Eliminada" : ventana.abierta ? "Abierta" : "Cerrada"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <span className="flex items-center gap-2">
                        <Interruptor
                          activado={ventana.publicada}
                          etiqueta={`Ventana ${ventana.anio} publicada`}
                          onCambiar={() => {
                            setErrorPublicacion(null);
                            setObjetivoPublicacion(ventana);
                          }}
                          bloqueado={ventana.eliminadaEn !== null}
                          tooltip={ventana.eliminadaEn !== null ? "No puedes publicar una ventana eliminada" : undefined}
                        />
                        <span className="w-16 text-sm text-gob-gray-a">
                          {ventana.publicada ? "Publicada" : "Borrador"}
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gob-gray-a">{ventana.creadoPorNombre}</td>
                    <td className="px-3 py-2 tabular-nums text-gob-gray-a">{ventana.cantidadCargas}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      <ViewTransition>
                        <Link
                          href={ventana.rutaDetalle}
                          className="text-sm font-medium text-gob-primary underline-offset-2 hover:underline"
                        >
                          Detalle
                        </Link>
                      </ViewTransition>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      {ventana.eliminadaEn ? (
                        <span className="text-xs text-gob-gray-a">—</span>
                      ) : enEdicion ? (
                        <div className="flex items-center justify-end gap-3">
                          <Boton
                            variante="texto"
                            cargando={guardandoEdicion}
                            textoCargando="Guardando..."
                            onClick={() => void guardarEdicion()}
                          >
                            Guardar
                          </Boton>
                          <Boton variante="texto" disabled={guardandoEdicion} onClick={cancelarEdicion}>
                            Cancelar
                          </Boton>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-3">
                          <Boton variante="texto" onClick={() => iniciarEdicion(ventana)}>
                            Editar
                          </Boton>
                          {puedeEliminar(ventana) ? (
                            <Boton
                              variante="textoPeligro"
                              onClick={() => {
                                setErrorEliminacion(null);
                                setObjetivoEliminacion(ventana);
                              }}
                              aria-label={`Eliminar la ventana ${ventana.anio}`}
                            >
                              <IconoEliminar />
                              Eliminar
                            </Boton>
                          ) : null}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {errorEdicion ? (
            <p role="alert" className="border-t border-gob-accent px-3 py-2 text-sm font-medium text-gob-danger">
              {errorEdicion}
            </p>
          ) : null}
        </div>
      )}

      <DialogoConfirmacion
        abierto={objetivoEliminacion !== null}
        titulo="Eliminar ventana de carga"
        descripcion={
          objetivoEliminacion
            ? `Vas a eliminar la ventana del año ${objetivoEliminacion.anio}. Si no tiene ninguna carga de archivo asociada, se elimina por completo; si ya tiene alguna, queda marcada como eliminada (se conserva para no perder a qué ventana pertenecen esas cargas) y deja de habilitar nuevas subidas para ese año. Esta acción no se puede deshacer.`
            : ""
        }
        textoConfirmar="Eliminar"
        textoConfirmando="Eliminando..."
        variante="peligro"
        procesando={eliminando}
        error={errorEliminacion}
        onConfirmar={() => void confirmarEliminacion()}
        onCancelar={() => {
          if (eliminando) return;
          setObjetivoEliminacion(null);
          setErrorEliminacion(null);
        }}
      />

      <DialogoConfirmacion
        abierto={objetivoPublicacion !== null}
        titulo={objetivoPublicacion?.publicada ? "Despublicar ventana" : "Publicar ventana"}
        descripcion={
          objetivoPublicacion
            ? objetivoPublicacion.publicada
              ? `La ventana del año ${objetivoPublicacion.anio} dejará de ser visible para los notificadores.`
              : `La ventana del año ${objetivoPublicacion.anio} quedará visible para los notificadores con el formato ${objetivoPublicacion.formatoExcelNombre} asignado.`
            : ""
        }
        textoConfirmar={objetivoPublicacion?.publicada ? "Despublicar" : "Publicar"}
        textoConfirmando="Guardando..."
        variante={objetivoPublicacion?.publicada ? "peligro" : "primario"}
        procesando={cambiandoPublicacion}
        error={errorPublicacion}
        onConfirmar={() => void confirmarCambioPublicacion()}
        onCancelar={() => {
          if (cambiandoPublicacion) return;
          setObjetivoPublicacion(null);
          setErrorPublicacion(null);
        }}
      />
    </div>
  );
}
