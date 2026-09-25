"use client";

import { useMemo, useState, ViewTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Boton, type VarianteBoton } from "@/shared/components/Boton";
import { CampoTexto } from "@/shared/components/CampoTexto";
import { CampoSelect, type OpcionSelect } from "@/shared/components/CampoSelect";
import { DialogoConfirmacion } from "@/shared/components/DialogoConfirmacion";
import { Interruptor } from "@/shared/components/Interruptor";
import { IconoArchivar, IconoEliminar } from "@/shared/components/iconos";
import { formatearFechaCalendario } from "@/shared/utils/fecha";
import { useAccionConfirmable } from "@/shared/hooks/useAccionConfirmable";

// Opción sintética que representa "sin filtro" en el `<select>` de formato de archivo del
// buscador: no es un formato real, así que no puede viajar como uno de `opcionesFormatoExcel`.
const OPCION_TODOS_LOS_FORMATOS: OpcionSelect = { valor: "", etiqueta: "Todos" };

// El año se elige desde una lista cerrada, en vez de escribirse libremente: evita valores
// negativos y mantiene el rango exactamente alineado con `anioVentanaCargaSchema`.
const ANIO_MINIMO_VENTANA = 2015;
const ANIO_MAXIMO_VENTANA = new Date().getFullYear();
const OPCIONES_ANIO_VENTANA: OpcionSelect[] = [
  { valor: "", etiqueta: "Selecciona un año" },
  ...Array.from({ length: ANIO_MAXIMO_VENTANA - ANIO_MINIMO_VENTANA + 1 }, (_, indice) => {
    const anio = String(ANIO_MINIMO_VENTANA + indice);
    return { valor: anio, etiqueta: anio };
  }),
];

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
  // Oculta la ventana de la vista por defecto (recuperable con "Mostrar archivadas"). Archivar
  // despublica automáticamente en el servidor, así que nunca se observa `archivada: true` junto a
  // `publicada: true`.
  archivada: boolean;
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

type EstadoVentana = { texto: string; claseColor: string };

// Jerarquía visual del estado, de mayor a menor prioridad: "Eliminada" gana siempre, aunque la
// ventana también esté archivada (mismo criterio documentado en el modelo de dominio: eliminar es
// el eje más fuerte, irreversible). Luego "Archivada", después el estado calculado de fechas.
function resolverEstadoVentana(
  ventana: Pick<VentanaCargaVista, "eliminadaEn" | "archivada" | "abierta">,
): EstadoVentana {
  if (ventana.eliminadaEn) return { texto: "Eliminada", claseColor: "border-gob-danger text-gob-danger" };
  if (ventana.archivada) return { texto: "Archivada", claseColor: "border-gob-gray-a text-gob-gray-a" };
  if (ventana.abierta) return { texto: "Abierta", claseColor: "border-gob-primary text-gob-primary" };
  return { texto: "Cerrada", claseColor: "border-gob-gray-a text-gob-gray-a" };
}

// Motivo por el que el interruptor "Publicada" está bloqueado, o `undefined` si no lo está.
// Eliminada gana sobre archivada en el mensaje (mismo orden de prioridad que `resolverEstadoVentana`),
// aunque en la práctica ambos bloquean igual.
function resolverTooltipPublicacion(ventana: Pick<VentanaCargaVista, "eliminadaEn" | "archivada">): string | undefined {
  if (ventana.eliminadaEn !== null) return "No puedes publicar una ventana eliminada";
  if (ventana.archivada) return "No puedes publicar una ventana archivada";
  return undefined;
}

// Descripción del diálogo de archivar/desarchivar. Al archivar una ventana publicada, advierte
// explícitamente el efecto secundario (se despublica en la misma escritura); al archivar una en
// borrador, mensaje simple. Desarchivar nunca republica sola, así que siempre lo aclara.
function descripcionCambioArchivado(ventana: VentanaCargaVista): string {
  if (ventana.archivada) {
    return `La ventana del año ${ventana.anio} volverá a aparecer en este listado. Queda como borrador (sin publicar); si necesitas que esté disponible para el notificador, publícala de nuevo.`;
  }

  if (ventana.publicada) {
    return `Al archivar la ventana del año ${ventana.anio} se ocultará de este listado y se despublicará automáticamente: dejará de estar disponible para que el notificador suba archivos. Puedes encontrarla luego con "Mostrar archivadas"; para volver a habilitarla debes desarchivarla y publicarla de nuevo.`;
  }

  return `Vas a archivar la ventana del año ${ventana.anio}. Se ocultará de este listado; puedes encontrarla luego activando "Mostrar archivadas".`;
}

type ContenidoDialogoAccion = { titulo: string; descripcion: string; textoConfirmar: string; variante: VarianteBoton };

// Resuelve título/descripción/texto/variante del diálogo de publicar-despublicar en una sola
// función pura, en vez de cuatro ternarios sueltos dentro del JSX de `TablaVentanasCarga`: reduce
// la complejidad de control de flujo de ese componente sin cambiar el mensaje que ve el usuario.
function resolverDialogoPublicacion(ventana: VentanaCargaVista | null): ContenidoDialogoAccion {
  if (ventana?.publicada) {
    return {
      titulo: "Despublicar ventana",
      descripcion: `La ventana del año ${ventana.anio} dejará de ser visible para los notificadores.`,
      textoConfirmar: "Despublicar",
      variante: "peligro",
    };
  }

  return {
    titulo: "Publicar ventana",
    descripcion: ventana
      ? `La ventana del año ${ventana.anio} quedará visible para los notificadores con el formato ${ventana.formatoExcelNombre} asignado.`
      : "",
    textoConfirmar: "Publicar",
    variante: "primario",
  };
}

// Mismo criterio que `resolverDialogoPublicacion`, para el diálogo de archivar/desarchivar.
function resolverDialogoArchivado(ventana: VentanaCargaVista | null): ContenidoDialogoAccion {
  if (ventana?.archivada) {
    return {
      titulo: "Desarchivar ventana",
      descripcion: descripcionCambioArchivado(ventana),
      textoConfirmar: "Desarchivar",
      variante: "primario",
    };
  }

  return {
    titulo: "Archivar ventana",
    descripcion: ventana ? descripcionCambioArchivado(ventana) : "",
    textoConfirmar: "Archivar",
    variante: "peligro",
  };
}

// Descripción del diálogo de eliminación: única acción irreversible del módulo (física o lógica
// según tenga cargas asociadas), sin la advertencia de despublicación de las otras dos.
function descripcionDialogoEliminacion(ventana: VentanaCargaVista | null): string {
  if (!ventana) return "";

  return `Vas a eliminar la ventana del año ${ventana.anio}. Si no tiene ninguna carga de archivo asociada, se elimina por completo; si ya tiene alguna, queda marcada como eliminada (se conserva para no perder a qué ventana pertenecen esas cargas) y deja de habilitar nuevas subidas para ese año. Esta acción no se puede deshacer.`;
}

type MensajeVacio = { titulo: string; cuerpo: string };

// Resuelve el mensaje de "sin filas que mostrar" en sus dos variantes (sin ventanas creadas
// todavía, o ninguna coincide con el buscador/filtros); `null` cuando corresponde mostrar la
// tabla. Extraído para no anidar un segundo ternario dentro del JSX de `TablaVentanasCarga`.
function resolverMensajeVacio(totalVentanas: number, totalFiltradas: number): MensajeVacio | null {
  if (totalVentanas === 0) {
    return {
      titulo: "Aún no hay ventanas de carga",
      cuerpo: "Crea la primera ventana para habilitar la subida de archivos a los notificadores.",
    };
  }

  if (totalFiltradas === 0) {
    return {
      titulo: "Ninguna ventana coincide con la búsqueda",
      cuerpo: 'Ajusta el término de búsqueda, el filtro de formato o activa "Mostrar archivadas".',
    };
  }

  return null;
}

type CriteriosBusquedaVentanas = { termino: string; filtroFormato: string; mostrarArchivadas: boolean };

function coincideConBusqueda(ventana: VentanaCargaVista, termino: string): boolean {
  if (!termino) return true;
  return String(ventana.anio).includes(termino) || ventana.formatoExcelNombre.toLowerCase().includes(termino);
}

// Filtro combinado del buscador (RF-15 ampliación): resuelto en cliente sobre el arreglo ya
// cargado, sin pedir nada nuevo al servidor. `mostrarArchivadas` en falso oculta las archivadas
// sin importar el resto de criterios.
function filtrarVentanas(ventanas: VentanaCargaVista[], criterios: CriteriosBusquedaVentanas): VentanaCargaVista[] {
  const termino = criterios.termino.trim().toLowerCase();

  return ventanas.filter((ventana) => {
    if (!criterios.mostrarArchivadas && ventana.archivada) return false;
    if (criterios.filtroFormato && ventana.formatoExcelId !== criterios.filtroFormato) return false;
    return coincideConBusqueda(ventana, termino);
  });
}

// Buscador y filtros del listado, resueltos en cliente sobre el arreglo ya cargado (sin pedir
// nada nuevo al servidor). Extraído como componente propio para que `TablaVentanasCarga` no
// cargue también con el marcado del panel de filtros.
type BuscadorVentanasCargaProps = {
  terminoBusqueda: string;
  onCambiarBusqueda: (valor: string) => void;
  filtroFormato: string;
  onCambiarFiltroFormato: (valor: string) => void;
  opciones: OpcionSelect[];
  mostrarArchivadas: boolean;
  onCambiarMostrarArchivadas: () => void;
};

function BuscadorVentanasCarga({
  terminoBusqueda,
  onCambiarBusqueda,
  filtroFormato,
  onCambiarFiltroFormato,
  opciones,
  mostrarArchivadas,
  onCambiarMostrarArchivadas,
}: BuscadorVentanasCargaProps) {
  return (
    <section aria-labelledby="titulo-buscador-ventanas" className="rounded-lg border border-gob-accent bg-white p-4">
      <h2 id="titulo-buscador-ventanas" className="text-sm font-semibold text-gob-black">
        Buscar ventanas
      </h2>

      <div className="mt-3 grid gap-4 sm:grid-cols-3">
        <CampoTexto
          id="busqueda-ventanas"
          etiqueta="Buscar por año o formato"
          type="text"
          placeholder="Ej: 2025 o el nombre del formato"
          value={terminoBusqueda}
          onChange={(evento) => onCambiarBusqueda(evento.target.value)}
        />
        <CampoSelect
          id="filtro-formato-ventanas"
          etiqueta="Filtrar por formato de archivo"
          opciones={opciones}
          value={filtroFormato}
          onChange={(evento) => onCambiarFiltroFormato(evento.target.value)}
        />
        <div className="flex items-end gap-2 pb-2">
          <Interruptor
            activado={mostrarArchivadas}
            etiqueta="Mostrar ventanas archivadas"
            onCambiar={onCambiarMostrarArchivadas}
          />
          <span className="text-sm text-gob-gray-a">Mostrar archivadas</span>
        </div>
      </div>
    </section>
  );
}

// Celda de acciones de una fila: Editar/Guardar/Cancelar y Eliminar se ocultan cuando la ventana
// ya fue eliminada lógicamente (comportamiento existente, sin cambios); Archivar/Desarchivar es
// independiente y va siempre, incluso eliminada o en edición. Extraída aparte de `FilaVentanaCarga`
// porque concentra casi toda su ramificación (cuatro estados posibles de esta celda).
type AccionesFilaVentanaProps = {
  ventana: Pick<VentanaCargaVista, "eliminadaEn" | "archivada" | "anio">;
  enEdicion: boolean;
  guardandoEdicion: boolean;
  puedeEliminarFila: boolean;
  onIniciarEdicion: () => void;
  onGuardarEdicion: () => void;
  onCancelarEdicion: () => void;
  onSolicitarEliminacion: () => void;
  onSolicitarArchivado: () => void;
};

function AccionesFilaVentana({
  ventana,
  enEdicion,
  guardandoEdicion,
  puedeEliminarFila,
  onIniciarEdicion,
  onGuardarEdicion,
  onCancelarEdicion,
  onSolicitarEliminacion,
  onSolicitarArchivado,
}: AccionesFilaVentanaProps) {
  const textoAccionArchivado = ventana.archivada ? "Desarchivar" : "Archivar";

  let accionesEdicion: ReactNode = null;
  if (!ventana.eliminadaEn) {
    accionesEdicion = enEdicion ? (
      <>
        <Boton variante="texto" cargando={guardandoEdicion} textoCargando="Guardando..." onClick={onGuardarEdicion}>
          Guardar
        </Boton>
        <Boton variante="texto" disabled={guardandoEdicion} onClick={onCancelarEdicion}>
          Cancelar
        </Boton>
      </>
    ) : (
      <>
        <Boton variante="texto" onClick={onIniciarEdicion}>
          Editar
        </Boton>
        {puedeEliminarFila ? (
          <Boton variante="textoPeligro" onClick={onSolicitarEliminacion} aria-label={`Eliminar la ventana ${ventana.anio}`}>
            <IconoEliminar />
            Eliminar
          </Boton>
        ) : null}
      </>
    );
  } else {
    accionesEdicion = <span className="text-xs text-gob-gray-a">—</span>;
  }

  return (
    <div className="flex items-center justify-end gap-3">
      {accionesEdicion}
      {/* Independiente de Editar/Eliminar: visible siempre, incluso si la ventana ya fue
          eliminada lógicamente o está en edición. */}
      <Boton
        variante="texto"
        onClick={onSolicitarArchivado}
        aria-label={`${textoAccionArchivado} la ventana ${ventana.anio}`}
      >
        <IconoArchivar />
        {textoAccionArchivado}
      </Boton>
    </div>
  );
}

// Una fila de la tabla, con su propia rama de edición inline. Sin estado propio: todo (qué fila
// está en edición, el borrador de edición, los distintos "objetivo de..." que abren un diálogo)
// vive en `TablaVentanasCarga`, que es quien decide qué mostrar; esta fila solo renderiza y
// reenvía eventos, mismo criterio de separar UI y lógica que el resto de `shared/components`.
type FilaVentanaCargaProps = {
  ventana: VentanaCargaVista;
  enEdicion: boolean;
  edicion: FormularioEdicion;
  guardandoEdicion: boolean;
  opcionesFormatoExcel: OpcionSelect[];
  puedeEliminarFila: boolean;
  onCambiarEdicion: (cambio: Partial<FormularioEdicion>) => void;
  onIniciarEdicion: () => void;
  onGuardarEdicion: () => void;
  onCancelarEdicion: () => void;
  onSolicitarEliminacion: () => void;
  onSolicitarPublicacion: () => void;
  onSolicitarArchivado: () => void;
};

function FilaVentanaCarga({
  ventana,
  enEdicion,
  edicion,
  guardandoEdicion,
  opcionesFormatoExcel,
  puedeEliminarFila,
  onCambiarEdicion,
  onIniciarEdicion,
  onGuardarEdicion,
  onCancelarEdicion,
  onSolicitarEliminacion,
  onSolicitarPublicacion,
  onSolicitarArchivado,
}: FilaVentanaCargaProps) {
  const estado = resolverEstadoVentana(ventana);

  return (
    <tr className="align-middle transition-colors hover:bg-gob-neutral/50">
      <th scope="row" className="px-3 py-2 font-medium text-gob-black tabular-nums">
        {ventana.anio}
      </th>
      <td className="whitespace-nowrap px-3 py-2 text-gob-gray-a">
        {enEdicion ? (
          <select
            aria-label={`Formato de archivo de la ventana ${ventana.anio}`}
            value={edicion.formatoExcelId}
            disabled={guardandoEdicion}
            onChange={(evento) => onCambiarEdicion({ formatoExcelId: evento.target.value })}
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
            onChange={(evento) => onCambiarEdicion({ fechaApertura: evento.target.value })}
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
            onChange={(evento) => onCambiarEdicion({ fechaVencimiento: evento.target.value })}
            className="rounded-md border border-gob-accent bg-white px-2 py-1 text-sm text-gob-black outline-none focus:border-gob-primary focus:ring-2 focus:ring-gob-primary/30"
          />
        ) : (
          formatearFechaIso(ventana.fechaVencimiento)
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-2">
        <span
          className={`inline-flex items-center rounded-full border bg-white px-2 py-0.5 text-xs font-semibold ${estado.claseColor}`}
        >
          {estado.texto}
        </span>
      </td>
      <td className="whitespace-nowrap px-3 py-2">
        <span className="flex items-center gap-2">
          <Interruptor
            activado={ventana.publicada}
            etiqueta={`Ventana ${ventana.anio} publicada`}
            onCambiar={onSolicitarPublicacion}
            bloqueado={ventana.eliminadaEn !== null || ventana.archivada}
            tooltip={resolverTooltipPublicacion(ventana)}
          />
          <span className="w-16 text-sm text-gob-gray-a">{ventana.publicada ? "Publicada" : "Borrador"}</span>
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
        <AccionesFilaVentana
          ventana={ventana}
          enEdicion={enEdicion}
          guardandoEdicion={guardandoEdicion}
          puedeEliminarFila={puedeEliminarFila}
          onIniciarEdicion={onIniciarEdicion}
          onGuardarEdicion={onGuardarEdicion}
          onCancelarEdicion={onCancelarEdicion}
          onSolicitarEliminacion={onSolicitarEliminacion}
          onSolicitarArchivado={onSolicitarArchivado}
        />
      </td>
    </tr>
  );
}

// Tabla + formulario de creación, compartidos entre `/dashboard/ventanas-carga` (ADMIN) y
// `/revisor/ventanas-carga` (REVISOR_REPOSITORIO): ambos perfiles pueden crear ventanas, editar
// sus fechas/formato de archivo y publicarlas (RF-15). Las fechas y el formato de archivo se
// pueden editar SIEMPRE, incluso si la ventana ya tiene cargas asociadas (decisión explícita del
// diseño): no hay ninguna comprobación de eso aquí. Eliminar es distinto: ADMIN puede eliminar
// cualquiera, REVISOR_REPOSITORIO solo las que él mismo creó — el botón se oculta según
// `esAdmin`/`actorId`, pero la regla real la aplica el servidor (`EliminarVentanaCarga.ts`), esto
// es solo para no ofrecer una acción que igual se rechazaría. Publicar/despublicar SÍ es simétrico
// entre ambos perfiles, sin ocultamiento alguno. Archivar/desarchivar también es simétrico y, a
// diferencia de Editar/Eliminar, no se oculta nunca (ni con la ventana eliminada lógicamente).
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

  // Elimina la ventana: `DELETE`, sin cuerpo. `EliminarVentanaCarga.ts` decide si es física o
  // lógica; el resultado no cambia esta llamada.
  const eliminacion = useAccionConfirmable<VentanaCargaVista>(
    (ventana) => fetch(`/api/dashboard/ventanas-carga/${ventana.id}`, { method: "DELETE" }),
    () => router.refresh(),
  );

  // Publica/despublica: invierte el estado actual de la ventana objetivo.
  const publicacion = useAccionConfirmable<VentanaCargaVista>(
    (ventana) =>
      fetch(`/api/dashboard/ventanas-carga/${ventana.id}/publicacion`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicada: !ventana.publicada }),
      }),
    () => router.refresh(),
  );

  // Archiva/desarchiva: invierte el estado actual de la ventana objetivo. El servidor decide la
  // publicación resultante (`publicacionResultanteAlArchivar`), este cliente no la calcula.
  const archivado = useAccionConfirmable<VentanaCargaVista>(
    (ventana) =>
      fetch(`/api/dashboard/ventanas-carga/${ventana.id}/archivado`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archivada: !ventana.archivada }),
      }),
    () => router.refresh(),
  );

  // Buscador y filtros del listado (RF-15 ampliación): resueltos en cliente sobre el arreglo ya
  // cargado, sin pedir nada nuevo al servidor. `mostrarArchivadas` apagado por defecto: una
  // ventana archivada solo aparece si se activa el interruptor, sin importar el resto de filtros.
  const [terminoBusqueda, setTerminoBusqueda] = useState("");
  const [filtroFormato, setFiltroFormato] = useState("");
  const [mostrarArchivadas, setMostrarArchivadas] = useState(false);

  const opcionesFiltroFormato: OpcionSelect[] = [OPCION_TODOS_LOS_FORMATOS, ...opcionesFormatoExcel];

  const ventanasFiltradas = useMemo(
    () => filtrarVentanas(ventanas, { termino: terminoBusqueda, filtroFormato, mostrarArchivadas }),
    [ventanas, terminoBusqueda, filtroFormato, mostrarArchivadas],
  );

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

  function puedeEliminar(ventana: VentanaCargaVista): boolean {
    return esAdmin || ventana.creadoPorId === actorId;
  }

  const mensajeVacio = resolverMensajeVacio(ventanas.length, ventanasFiltradas.length);
  const dialogoPublicacion = resolverDialogoPublicacion(publicacion.objetivo);
  const dialogoArchivado = resolverDialogoArchivado(archivado.objetivo);

  return (
    <div className="mt-6 flex flex-col gap-6">
      <section aria-labelledby="titulo-nueva-ventana" className="rounded-lg border border-gob-accent bg-white p-4">
        <h2 id="titulo-nueva-ventana" className="text-sm font-semibold text-gob-black">
          Nueva ventana de carga
        </h2>

        <div className="mt-3 grid gap-4 sm:grid-cols-4">
          <CampoSelect
            id="anio-nueva-ventana"
            etiqueta="Año"
            opciones={OPCIONES_ANIO_VENTANA}
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

      {ventanas.length > 0 ? (
        <BuscadorVentanasCarga
          terminoBusqueda={terminoBusqueda}
          onCambiarBusqueda={setTerminoBusqueda}
          filtroFormato={filtroFormato}
          onCambiarFiltroFormato={setFiltroFormato}
          opciones={opcionesFiltroFormato}
          mostrarArchivadas={mostrarArchivadas}
          onCambiarMostrarArchivadas={() => setMostrarArchivadas((actual) => !actual)}
        />
      ) : null}

      {mensajeVacio ? (
        <div className="rounded-lg border border-gob-accent bg-white p-8 text-center">
          <p className="text-base font-semibold text-gob-black">{mensajeVacio.titulo}</p>
          <p className="mt-2 text-sm text-gob-gray-a">{mensajeVacio.cuerpo}</p>
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
              {ventanasFiltradas.map((ventana) => (
                <FilaVentanaCarga
                  key={ventana.id}
                  ventana={ventana}
                  enEdicion={idEnEdicion === ventana.id}
                  edicion={edicion}
                  guardandoEdicion={guardandoEdicion}
                  opcionesFormatoExcel={opcionesFormatoExcel}
                  puedeEliminarFila={puedeEliminar(ventana)}
                  onCambiarEdicion={(cambio) => setEdicion((actual) => ({ ...actual, ...cambio }))}
                  onIniciarEdicion={() => iniciarEdicion(ventana)}
                  onGuardarEdicion={() => void guardarEdicion()}
                  onCancelarEdicion={cancelarEdicion}
                  onSolicitarEliminacion={() => eliminacion.solicitar(ventana)}
                  onSolicitarPublicacion={() => publicacion.solicitar(ventana)}
                  onSolicitarArchivado={() => archivado.solicitar(ventana)}
                />
              ))}
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
        abierto={eliminacion.objetivo !== null}
        titulo="Eliminar ventana de carga"
        descripcion={descripcionDialogoEliminacion(eliminacion.objetivo)}
        textoConfirmar="Eliminar"
        textoConfirmando="Eliminando..."
        variante="peligro"
        procesando={eliminacion.procesando}
        error={eliminacion.error}
        onConfirmar={() => void eliminacion.confirmar()}
        onCancelar={eliminacion.cancelar}
      />

      <DialogoConfirmacion
        abierto={publicacion.objetivo !== null}
        titulo={dialogoPublicacion.titulo}
        descripcion={dialogoPublicacion.descripcion}
        textoConfirmar={dialogoPublicacion.textoConfirmar}
        textoConfirmando="Guardando..."
        variante={dialogoPublicacion.variante}
        procesando={publicacion.procesando}
        error={publicacion.error}
        onConfirmar={() => void publicacion.confirmar()}
        onCancelar={publicacion.cancelar}
      />

      <DialogoConfirmacion
        abierto={archivado.objetivo !== null}
        titulo={dialogoArchivado.titulo}
        descripcion={dialogoArchivado.descripcion}
        textoConfirmar={dialogoArchivado.textoConfirmar}
        textoConfirmando="Guardando..."
        variante={dialogoArchivado.variante}
        procesando={archivado.procesando}
        error={archivado.error}
        onConfirmar={() => void archivado.confirmar()}
        onCancelar={archivado.cancelar}
      />
    </div>
  );
}
