"use client";

import { Suspense, use, useEffect, useId, useRef, useState } from "react";
import {
  MAXIMO_CAMBIOS_ASIGNACION_MASIVA,
  type CandidatoAsignacionFormato,
} from "@/modules/formatos-excel/domain/entities/AsignacionFormato";
import { asignacionMasivaFormatoSchema } from "@/modules/formatos-excel/schemas/formato-excel.schema";
import { Boton } from "@/shared/components/Boton";
import { CampoTexto } from "@/shared/components/CampoTexto";
import {
  obtenerCandidatosAsignacion,
  type FormatoObjetivoAsignacion,
} from "@/shared/components/asignacion-formato";

const MENSAJE_ERROR_GUARDADO = "No se pudieron guardar los cambios. Intenta nuevamente.";
const MENSAJE_ERROR_RECARGA =
  "Los cambios se guardaron, pero no se pudo recargar la lista. Cierra y vuelve a abrir para seguir editando.";

// Clave del grupo de notificadores sin establecimiento (cuentas previas a RF-30). No colisiona con
// un id real: los ids de establecimiento son UUID.
const CLAVE_SIN_ESTABLECIMIENTO = "sin-establecimiento";
const NOMBRE_SIN_ESTABLECIMIENTO = "Sin establecimiento";

type RespuestaAsignacionMasiva = {
  cantidadAgregados: number;
  cantidadQuitados: number;
  sinCambioIds: string[];
  noElegiblesIds: string[];
  excluidosUltimoFormatoIds: string[];
};

// Notificadores activos de un mismo establecimiento: la unidad de selección del modal.
type GrupoEstablecimiento = {
  clave: string;
  nombre: string;
  candidatos: CandidatoAsignacionFormato[];
  cantidadAsignados: number;
  // Precalculado una vez por grupo para que la búsqueda no normalice en cada tecla.
  nombreNormalizado: string;
};

// Decisión del operador por establecimiento (clave del grupo): `true` asignar a todos, `false`
// quitar a todos. Un grupo sin entrada no se toca.
type DecisionesEstablecimiento = Map<string, boolean>;

function agruparPorEstablecimiento(candidatos: CandidatoAsignacionFormato[]): GrupoEstablecimiento[] {
  const grupos = new Map<string, GrupoEstablecimiento>();

  for (const candidato of candidatos) {
    const clave = candidato.establecimientoId ?? CLAVE_SIN_ESTABLECIMIENTO;
    let grupo = grupos.get(clave);
    if (!grupo) {
      const nombre = candidato.establecimientoNombre ?? NOMBRE_SIN_ESTABLECIMIENTO;
      grupo = { clave, nombre, candidatos: [], cantidadAsignados: 0, nombreNormalizado: normalizarTexto(nombre) };
      grupos.set(clave, grupo);
    }
    grupo.candidatos.push(candidato);
    if (candidato.yaAsignado) grupo.cantidadAsignados++;
  }

  // Orden alfabético; "Sin establecimiento" siempre al final.
  return [...grupos.values()].sort((a, b) => {
    if (a.clave === CLAVE_SIN_ESTABLECIMIENTO) return 1;
    if (b.clave === CLAVE_SIN_ESTABLECIMIENTO) return -1;
    return a.nombre.localeCompare(b.nombre, "es");
  });
}

// Búsqueda sin distinguir mayúsculas ni acentos ("Concepción" coincide con "concepcion").
function normalizarTexto(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function filtrarGrupos(grupos: GrupoEstablecimiento[], termino: string): GrupoEstablecimiento[] {
  if (termino.length === 0) return grupos;
  return grupos.filter((grupo) => grupo.nombreNormalizado.includes(termino));
}

function grupoMarcado(grupo: GrupoEstablecimiento, decisiones: DecisionesEstablecimiento): boolean {
  return decisiones.get(grupo.clave) ?? grupo.cantidadAsignados === grupo.candidatos.length;
}

function grupoIntermedio(grupo: GrupoEstablecimiento, decisiones: DecisionesEstablecimiento): boolean {
  return (
    !decisiones.has(grupo.clave) &&
    grupo.cantidadAsignados > 0 &&
    grupo.cantidadAsignados < grupo.candidatos.length
  );
}

// Traduce las decisiones por establecimiento a la diferencia por usuario que espera la API. Quitar
// nunca incluye a quien tiene este formato como único (el servidor igual lo excluiría).
function calcularCambios(
  grupos: GrupoEstablecimiento[],
  decisiones: DecisionesEstablecimiento,
): { agregarIds: string[]; quitarIds: string[] } {
  const agregarIds: string[] = [];
  const quitarIds: string[] = [];

  for (const grupo of grupos) {
    const decision = decisiones.get(grupo.clave);
    if (decision === undefined) continue;
    for (const candidato of grupo.candidatos) {
      if (decision && !candidato.yaAsignado) agregarIds.push(candidato.id);
      if (!decision && candidato.yaAsignado && !candidato.esUnicoFormato) quitarIds.push(candidato.id);
    }
  }

  return { agregarIds, quitarIds };
}

// Una decisión que coincide con el estado actual del grupo se descarta: así la casilla vuelve a su
// estado original (p. ej. la intermedia) en vez de quedar "tocada" sin cambios reales.
function decidir(siguiente: DecisionesEstablecimiento, grupo: GrupoEstablecimiento, marcado: boolean) {
  const sinEfecto = marcado ? grupo.cantidadAsignados === grupo.candidatos.length : grupo.cantidadAsignados === 0;
  if (sinEfecto) siguiente.delete(grupo.clave);
  else siguiente.set(grupo.clave, marcado);
}

function plural(cantidad: number, singular: string, pluralTexto: string): string {
  return `${cantidad} ${cantidad === 1 ? singular : pluralTexto}`;
}

function listarNombres(ids: string[], nombresPorId: Map<string, string>): string {
  return ids.map((id) => nombresPorId.get(id) ?? "usuario no disponible").join(", ");
}

function construirResumen(resultado: RespuestaAsignacionMasiva, nombresPorId: Map<string, string>): string[] {
  const lineas = [
    `Se asignó el formato a ${plural(resultado.cantidadAgregados, "usuario", "usuarios")} y se quitó a ${plural(resultado.cantidadQuitados, "usuario", "usuarios")}.`,
  ];

  if (resultado.excluidosUltimoFormatoIds.length > 0) {
    lineas.push(
      `No se quitó a ${listarNombres(resultado.excluidosUltimoFormatoIds, nombresPorId)}: es su único formato asignado.`,
    );
  }

  if (resultado.noElegiblesIds.length > 0) {
    lineas.push(
      `Se omitió a ${listarNombres(resultado.noElegiblesIds, nombresPorId)}: ya no es notificador activo.`,
    );
  }

  if (resultado.sinCambioIds.length > 0) {
    lineas.push(`${plural(resultado.sinCambioIds.length, "usuario ya estaba", "usuarios ya estaban")} en el estado pedido.`);
  }

  return lineas;
}

type AccionesModal = {
  procesando: boolean;
  onCambiarProcesando: (procesando: boolean) => void;
  onGuardado: () => void;
  onCerrar: () => void;
};

type EditorAsignacionProps = AccionesModal & {
  formatoId: string;
  candidatosIniciales: CandidatoAsignacionFormato[];
};

// La selección es por ESTABLECIMIENTO, no por usuario. Cada casilla parte en el estado actual del
// grupo (marcada si todos sus notificadores tienen el formato, intermedia si solo algunos). Lo que
// el operador cambia queda en `decisiones`: marcar = asignar a TODOS los notificadores del
// establecimiento; desmarcar = quitárselo a todos, salvo a quien lo tiene como único formato. Un
// grupo no tocado no genera cambios. Al servidor viaja la misma diferencia por usuario de siempre
// (`agregarIds`/`quitarIds`), que revalida todo en su transacción.
function EditorAsignacion({
  formatoId,
  candidatosIniciales,
  procesando,
  onCambiarProcesando,
  onGuardado,
  onCerrar,
}: EditorAsignacionProps) {
  const idBase = useId();
  const [candidatos, setCandidatos] = useState(candidatosIniciales);
  const [decisiones, setDecisiones] = useState<DecisionesEstablecimiento>(() => new Map());
  const [busqueda, setBusqueda] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resumen, setResumen] = useState<string[]>([]);
  // Si la recarga posterior a guardar falla, la línea base local ya no es confiable: se bloquea
  // un nuevo guardado hasta reabrir el modal.
  const [listaDesactualizada, setListaDesactualizada] = useState(false);

  const grupos = agruparPorEstablecimiento(candidatos);
  const { agregarIds, quitarIds } = calcularCambios(grupos, decisiones);
  const totalCambios = agregarIds.length + quitarIds.length;
  const excedeMaximo = totalCambios > MAXIMO_CAMBIOS_ASIGNACION_MASIVA;

  const termino = normalizarTexto(busqueda.trim());
  const visibles = filtrarGrupos(grupos, termino);
  const estaMarcado = (grupo: GrupoEstablecimiento) => grupoMarcado(grupo, decisiones);
  const estaIntermedio = (grupo: GrupoEstablecimiento) => grupoIntermedio(grupo, decisiones);

  const todosMarcados = visibles.length > 0 && visibles.every(estaMarcado);
  const algunoMarcado = !todosMarcados && visibles.some((grupo) => estaMarcado(grupo) || estaIntermedio(grupo));

  function alternar(grupo: GrupoEstablecimiento, marcado: boolean) {
    setDecisiones((actual) => {
      const siguiente = new Map(actual);
      decidir(siguiente, grupo, marcado);
      return siguiente;
    });
  }

  // "Seleccionar todos" actúa sobre los establecimientos visibles (respeta la búsqueda).
  function alternarTodos(marcado: boolean) {
    setDecisiones((actual) => {
      const siguiente = new Map(actual);
      for (const grupo of visibles) decidir(siguiente, grupo, marcado);
      return siguiente;
    });
  }

  async function guardar() {
    const lote = asignacionMasivaFormatoSchema.safeParse({ agregarIds, quitarIds });

    if (!lote.success) {
      setError(lote.error.issues[0]?.message ?? MENSAJE_ERROR_GUARDADO);
      return;
    }

    const nombresPorId = new Map(
      candidatos.map((candidato) => [candidato.id, `${candidato.nombres} ${candidato.apellidos}`]),
    );

    onCambiarProcesando(true);
    setError(null);
    setResumen([]);

    try {
      const respuesta = await fetch(`/api/formatos-excel/${formatoId}/asignaciones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lote.data),
      });

      if (!respuesta.ok) {
        const datosError = (await respuesta.json().catch(() => null)) as { error?: string } | null;
        setError(datosError?.error ?? MENSAJE_ERROR_GUARDADO);
        return;
      }

      const datos = (await respuesta.json().catch(() => null)) as Partial<RespuestaAsignacionMasiva> | null;
      const resultado: RespuestaAsignacionMasiva = {
        cantidadAgregados: datos?.cantidadAgregados ?? 0,
        cantidadQuitados: datos?.cantidadQuitados ?? 0,
        sinCambioIds: datos?.sinCambioIds ?? [],
        noElegiblesIds: datos?.noElegiblesIds ?? [],
        excluidosUltimoFormatoIds: datos?.excluidosUltimoFormatoIds ?? [],
      };

      if (resultado.cantidadAgregados + resultado.cantidadQuitados > 0) onGuardado();
      setResumen(construirResumen(resultado, nombresPorId));

      // Se recarga desde el servidor para que la línea base de la siguiente edición refleje lo
      // realmente aplicado (incluidas las omisiones).
      const recarga = await obtenerCandidatosAsignacion(formatoId);
      if (recarga.ok) {
        setCandidatos(recarga.candidatos);
        setDecisiones(new Map());
      } else {
        setListaDesactualizada(true);
        setError(MENSAJE_ERROR_RECARGA);
      }
    } catch {
      setError(MENSAJE_ERROR_GUARDADO);
    } finally {
      onCambiarProcesando(false);
    }
  }

  return (
    <>
      <div className="mt-4 flex flex-col gap-3">
        <CampoTexto
          id={`${idBase}-busqueda`}
          etiqueta="Buscar establecimiento"
          type="search"
          value={busqueda}
          onChange={(evento) => setBusqueda(evento.target.value)}
          autoComplete="off"
        />

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-gob-black">
            Establecimientos con notificadores activos ({grupos.length})
          </legend>

          {visibles.length > 0 ? (
            <label
              htmlFor={`${idBase}-todos`}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm font-medium text-gob-black hover:bg-gob-neutral"
            >
              <input
                id={`${idBase}-todos`}
                type="checkbox"
                checked={todosMarcados}
                ref={(elemento) => {
                  if (elemento) elemento.indeterminate = algunoMarcado;
                }}
                disabled={procesando}
                onChange={(evento) => alternarTodos(evento.target.checked)}
                className="h-4 w-4 rounded border-gob-accent text-gob-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary"
              />
              {termino.length > 0
                ? `Seleccionar todos los resultados (${visibles.length})`
                : `Seleccionar todos (${visibles.length})`}
            </label>
          ) : null}

          <div className="flex max-h-72 flex-col gap-1 overflow-y-auto rounded-md border border-gob-accent bg-white p-2">
            {visibles.length === 0 ? (
              <p className="px-2 py-1 text-sm text-gob-gray-a">
                {grupos.length === 0
                  ? "No hay notificadores activos."
                  : "Ningún establecimiento coincide con la búsqueda."}
              </p>
            ) : (
              visibles.map((grupo) => {
                const idOpcion = `${idBase}-establecimiento-${grupo.clave}`;
                const idDetalle = `${idOpcion}-detalle`;
                const cantidadUnico = grupo.candidatos.filter((candidato) => candidato.esUnicoFormato).length;

                return (
                  <label
                    key={grupo.clave}
                    htmlFor={idOpcion}
                    className="flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 text-sm text-gob-black hover:bg-gob-neutral"
                  >
                    <input
                      id={idOpcion}
                      type="checkbox"
                      checked={estaMarcado(grupo)}
                      ref={(elemento) => {
                        if (elemento) elemento.indeterminate = estaIntermedio(grupo);
                      }}
                      disabled={procesando}
                      aria-describedby={idDetalle}
                      onChange={(evento) => alternar(grupo, evento.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-gob-accent text-gob-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary"
                    />
                    <span className="flex flex-col">
                      <span>{grupo.nombre}</span>
                      <span id={idDetalle} className="text-xs text-gob-gray-a">
                        {grupo.cantidadAsignados} de {plural(grupo.candidatos.length, "notificador", "notificadores")} con
                        este formato
                        {cantidadUnico > 0
                          ? ` · ${plural(cantidadUnico, "lo tiene", "lo tienen")} como único formato (no se le quita)`
                          : ""}
                      </span>
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </fieldset>

        <p className="text-sm text-gob-gray-a">
          {plural(agregarIds.length, "usuario", "usuarios")} por agregar ·{" "}
          {plural(quitarIds.length, "usuario", "usuarios")} por quitar
        </p>

        {excedeMaximo ? (
          <p className="text-sm font-medium text-gob-danger">
            Puedes guardar como máximo {MAXIMO_CAMBIOS_ASIGNACION_MASIVA} cambios de usuarios a la vez. Selecciona
            menos establecimientos y guarda en partes.
          </p>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-sm font-medium text-gob-danger">
          {error}
        </p>
      ) : null}

      <div role="status" aria-live="polite" className="mt-3 flex flex-col gap-1 text-sm text-gob-black">
        {resumen.map((linea) => (
          <p key={linea}>{linea}</p>
        ))}
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <Boton variante="secundario" onClick={onCerrar} disabled={procesando}>
          Cerrar
        </Boton>
        <Boton
          variante="primario"
          onClick={guardar}
          disabled={totalCambios === 0 || excedeMaximo || listaDesactualizada}
          cargando={procesando}
          textoCargando="Guardando..."
        >
          Guardar cambios
        </Boton>
      </div>
    </>
  );
}

type CargaCandidatosProps = AccionesModal & { formato: FormatoObjetivoAsignacion };

function CargaCandidatos({ formato, ...acciones }: CargaCandidatosProps) {
  const resultado = use(formato.candidatos);

  if (!resultado.ok) {
    return (
      <>
        <p role="alert" className="mt-4 text-sm font-medium text-gob-danger">
          {resultado.mensaje}
        </p>
        <div className="mt-6 flex justify-end">
          <Boton variante="secundario" onClick={acciones.onCerrar}>
            Cerrar
          </Boton>
        </div>
      </>
    );
  }

  return <EditorAsignacion formatoId={formato.id} candidatosIniciales={resultado.candidatos} {...acciones} />;
}

type ModalAsignarFormatoUsuariosProps = {
  formato: FormatoObjetivoAsignacion | null;
  // `huboCambios` indica si se aplicó al menos una asignación, para que el llamador refresque.
  onCerrar: (huboCambios: boolean) => void;
};

// Asignación masiva de un formato POR ESTABLECIMIENTO: se eligen establecimientos y el formato se
// asigna (o quita) a todos sus notificadores activos. Envía solo la diferencia por usuario respecto
// del estado cargado; el servidor revalida todo (elegibilidad y "único formato") y procesa
// parcialmente. Abrir con `prepararAsignacionFormato(id, nombre)` (`asignacion-formato.ts`).
export function ModalAsignarFormatoUsuarios({ formato, onCerrar }: ModalAsignarFormatoUsuariosProps) {
  const referenciaDialogo = useRef<HTMLDialogElement>(null);
  const idBase = useId();
  const idTitulo = `${idBase}-titulo`;
  const [procesando, setProcesando] = useState(false);
  // Solo se lee al cerrar: un ref evita un re-render por cada guardado.
  const huboCambios = useRef(false);

  useEffect(() => {
    const dialogo = referenciaDialogo.current;
    if (!dialogo) return;

    if (formato && !dialogo.open) {
      dialogo.showModal();
    } else if (!formato && dialogo.open) {
      dialogo.close();
    }
  }, [formato]);

  function cerrar() {
    // El `close` que dispara el propio efecto al quedar sin formato no debe notificar de nuevo.
    if (!formato || procesando) return;
    const cambiosAplicados = huboCambios.current;
    huboCambios.current = false;
    onCerrar(cambiosAplicados);
  }

  return (
    <dialog
      ref={referenciaDialogo}
      aria-labelledby={idTitulo}
      onClose={cerrar}
      onCancel={(evento) => {
        if (procesando) evento.preventDefault();
      }}
      className="m-auto w-[min(40rem,calc(100vw-2rem))] rounded-lg border border-gob-accent bg-white p-6 text-gob-black shadow-lg backdrop:bg-gob-tertiary/50"
    >
      <h2 id={idTitulo} className="text-base font-semibold text-gob-black">
        {formato ? `Asignar “${formato.nombre}” por establecimiento` : "Asignar formato por establecimiento"}
      </h2>

      {formato ? (
        <>
          <p className="mt-2 text-sm text-gob-gray-a">
            Marca los establecimientos cuyos notificadores deben tener este formato y desmarca los que ya
            no. El cambio se aplica a todos los notificadores activos del establecimiento.
          </p>
          <Suspense
            fallback={
              <p role="status" className="mt-4 text-sm text-gob-gray-a">
                Cargando establecimientos...
              </p>
            }
          >
            <CargaCandidatos
              key={formato.id}
              formato={formato}
              procesando={procesando}
              onCambiarProcesando={setProcesando}
              onGuardado={() => {
                huboCambios.current = true;
              }}
              onCerrar={cerrar}
            />
          </Suspense>
        </>
      ) : null}
    </dialog>
  );
}
