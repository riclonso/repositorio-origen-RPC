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

type RespuestaAsignacionMasiva = {
  cantidadAgregados: number;
  cantidadQuitados: number;
  sinCambioIds: string[];
  noElegiblesIds: string[];
  excluidosUltimoFormatoIds: string[];
};

function idsAsignados(candidatos: CandidatoAsignacionFormato[]): Set<string> {
  return new Set(candidatos.filter((candidato) => candidato.yaAsignado).map((candidato) => candidato.id));
}

// Búsqueda sin distinguir mayúsculas ni acentos ("Muñoz" coincide con "munoz").
function normalizarTexto(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// Para buscar por RUT con o sin puntos y guion.
function quitarSeparadoresRut(texto: string): string {
  return texto.replace(/[.\-\s]/g, "");
}

function coincideBusqueda(candidato: CandidatoAsignacionFormato, termino: string): boolean {
  if (termino.length === 0) return true;

  const nombreCompleto = normalizarTexto(`${candidato.nombres} ${candidato.apellidos}`);
  if (nombreCompleto.includes(termino)) return true;

  const terminoRut = quitarSeparadoresRut(termino);
  return terminoRut.length > 0 && quitarSeparadoresRut(candidato.rut.toLowerCase()).includes(terminoRut);
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
  const [seleccionados, setSeleccionados] = useState(() => idsAsignados(candidatosIniciales));
  const [busqueda, setBusqueda] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resumen, setResumen] = useState<string[]>([]);
  // Si la recarga posterior a guardar falla, la línea base local ya no es confiable: se bloquea
  // un nuevo guardado hasta reabrir el modal.
  const [listaDesactualizada, setListaDesactualizada] = useState(false);

  const agregarIds = candidatos
    .filter((candidato) => !candidato.yaAsignado && seleccionados.has(candidato.id))
    .map((candidato) => candidato.id);
  const quitarIds = candidatos
    .filter((candidato) => candidato.yaAsignado && !seleccionados.has(candidato.id))
    .map((candidato) => candidato.id);
  const totalCambios = agregarIds.length + quitarIds.length;
  const excedeMaximo = totalCambios > MAXIMO_CAMBIOS_ASIGNACION_MASIVA;

  const termino = normalizarTexto(busqueda.trim());
  const visibles = candidatos.filter((candidato) => coincideBusqueda(candidato, termino));

  // "Seleccionar todos" actúa sobre los visibles (respeta la búsqueda). Al desmarcar nunca quita a
  // quien tiene este formato como único: su casilla está bloqueada y el servidor lo excluiría igual.
  const visiblesEditables = visibles.filter((candidato) => !candidato.esUnicoFormato);
  const cantidadVisiblesMarcados = visibles.filter((candidato) => seleccionados.has(candidato.id)).length;
  const todosMarcados = visibles.length > 0 && cantidadVisiblesMarcados === visibles.length;
  const algunoMarcado = cantidadVisiblesMarcados > 0 && !todosMarcados;

  function alternarTodos(marcado: boolean) {
    setSeleccionados((actual) => {
      const siguiente = new Set(actual);
      for (const candidato of visiblesEditables) {
        if (marcado) siguiente.add(candidato.id);
        else siguiente.delete(candidato.id);
      }
      return siguiente;
    });
  }

  function alternar(id: string, marcado: boolean) {
    setSeleccionados((actual) => {
      const siguiente = new Set(actual);
      if (marcado) siguiente.add(id);
      else siguiente.delete(id);
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
        setSeleccionados(idsAsignados(recarga.candidatos));
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
          etiqueta="Buscar por nombre, apellido o RUT"
          type="search"
          value={busqueda}
          onChange={(evento) => setBusqueda(evento.target.value)}
          autoComplete="off"
        />

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-gob-black">
            Notificadores activos ({candidatos.length})
          </legend>

          {visiblesEditables.length > 0 ? (
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
                {candidatos.length === 0
                  ? "No hay notificadores activos."
                  : "Ningún notificador coincide con la búsqueda."}
              </p>
            ) : (
              visibles.map((candidato) => {
                const idOpcion = `${idBase}-usuario-${candidato.id}`;
                const idLeyenda = `${idOpcion}-leyenda`;

                return (
                  <label
                    key={candidato.id}
                    htmlFor={idOpcion}
                    className={`flex items-center gap-2 rounded px-2 py-1.5 text-sm text-gob-black ${
                      candidato.esUnicoFormato ? "cursor-not-allowed" : "cursor-pointer hover:bg-gob-neutral"
                    }`}
                  >
                    <input
                      id={idOpcion}
                      type="checkbox"
                      checked={seleccionados.has(candidato.id)}
                      disabled={procesando || candidato.esUnicoFormato}
                      aria-describedby={candidato.esUnicoFormato ? idLeyenda : undefined}
                      onChange={(evento) => alternar(candidato.id, evento.target.checked)}
                      className="h-4 w-4 rounded border-gob-accent text-gob-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary"
                    />
                    <span className="flex flex-col">
                      <span>
                        {candidato.nombres} {candidato.apellidos}
                      </span>
                      <span className="text-xs text-gob-gray-a">{candidato.rut}</span>
                      {candidato.esUnicoFormato ? (
                        <span id={idLeyenda} className="text-xs text-gob-gray-a">
                          Único formato asignado
                        </span>
                      ) : null}
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </fieldset>

        <p className="text-sm text-gob-gray-a">
          {agregarIds.length} por agregar · {quitarIds.length} por quitar
        </p>

        {excedeMaximo ? (
          <p className="text-sm font-medium text-gob-danger">
            Puedes guardar como máximo {MAXIMO_CAMBIOS_ASIGNACION_MASIVA} cambios a la vez. Guarda en partes.
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

// Asignación masiva de un formato a notificadores activos. Envía solo la diferencia respecto del
// estado cargado; el servidor revalida todo (elegibilidad y "único formato") y procesa parcialmente.
// Abrir con `prepararAsignacionFormato(id, nombre)` (`asignacion-formato.ts`).
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
        {formato ? `Asignar “${formato.nombre}” a usuarios` : "Asignar formato a usuarios"}
      </h2>

      {formato ? (
        <>
          <p className="mt-2 text-sm text-gob-gray-a">
            Marca a los notificadores que deben tener este formato y desmarca a quienes ya no. Solo se
            muestran notificadores activos.
          </p>
          <Suspense
            fallback={
              <p role="status" className="mt-4 text-sm text-gob-gray-a">
                Cargando notificadores...
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
