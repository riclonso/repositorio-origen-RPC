import Link from "next/link";
import {
  estaBloqueada,
  type FiltroListadoUsuarios,
  type Usuario,
} from "@/modules/usuarios/domain/entities/Usuario";
import { listarUsuarios } from "@/modules/usuarios/application/use-cases/ListarUsuarios";
import { prismaUsuarioRepository } from "@/modules/usuarios/infrastructure/repositories/PrismaUsuarioRepository";
import { PaginacionUsuarios } from "@/shared/components/PaginacionUsuarios";
import { TablaUsuarios, type FilaUsuarioVista } from "@/shared/components/TablaUsuarios";

// La fecha se formatea en el servidor y con zona horaria fija: si la formateara el navegador,
// la hidratación mostraría un valor distinto según la zona del equipo del funcionario.
const formateadorFecha = new Intl.DateTimeFormat("es-CL", {
  timeZone: "America/Santiago",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

// Fecha y hora del vencimiento del bloqueo, para el tooltip del chip "Bloqueada" en
// `TablaUsuarios`. Igual que `formateadorFecha`, con zona horaria fija en el servidor para que la
// hidratación no dependa de la zona del equipo del funcionario.
const formateadorFechaHora = new Intl.DateTimeFormat("es-CL", {
  timeZone: "America/Santiago",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const CLASES_ENLACE_VACIO =
  "inline-flex items-center justify-center rounded-md bg-gob-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gob-tertiary active:translate-y-[1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary";

// `ahora` se calcula una sola vez en `ListadoUsuarios` y se reutiliza para las 20-100 filas de la
// página (nunca `new Date()` por fila): mismo criterio de "un solo reloj de pared por petición"
// que el resto del proyecto (RF-10, RF-15).
function aFilaVista(usuario: Usuario, ahora: Date): FilaUsuarioVista {
  return {
    id: usuario.id,
    nombres: usuario.nombres,
    apellidos: usuario.apellidos,
    rut: usuario.rut,
    email: usuario.email,
    username: usuario.username,
    perfilCodigo: usuario.perfilCodigo,
    perfilNombre: usuario.perfilNombre,
    activo: usuario.activo,
    tieneContrasena: usuario.tieneContrasena,
    creadoEl: formateadorFecha.format(usuario.createdAt),
    bloqueada: estaBloqueada(usuario, ahora),
    vecesBloqueada: usuario.vecesBloqueada,
    bloqueadaHastaTexto: usuario.bloqueadaHasta ? formateadorFechaHora.format(usuario.bloqueadaHasta) : null,
  };
}

function EstadoVacio({ titulo, detalle, accion }: { titulo: string; detalle: string; accion: React.ReactNode }) {
  return (
    <div className="card-sistema mt-6 p-8 text-center">
      <p className="text-base font-semibold text-gob-black">{titulo}</p>
      <p className="mt-2 text-sm text-gob-gray-a">{detalle}</p>
      <div className="mt-4 flex justify-center">{accion}</div>
    </div>
  );
}

// Compartido entre `/dashboard/usuarios` (ADMIN) y `/revisor/usuarios` (REVISOR_REPOSITORIO):
// mismo listado, cada área aporta su propia base de ruta, su constructor de URL de paginación y
// si su actor es o no ADMIN (para ocultar acciones sobre cuentas ADMIN cuando no lo es).
type ListadoUsuariosProps = {
  filtro: FiltroListadoUsuarios;
  actorId: string;
  rutaBase: string;
  construirHref: (pagina: number) => string;
  actorEsAdmin: boolean;
  perfilesPermitidos?: readonly string[];
};

export async function ListadoUsuarios({
  filtro,
  actorId,
  rutaBase,
  construirHref,
  actorEsAdmin,
  perfilesPermitidos,
}: ListadoUsuariosProps) {
  // La restricción se une al filtro solo en el servidor: no se serializa en la URL ni puede ser
  // quitada por el navegador del revisor.
  const filtroEfectivo: FiltroListadoUsuarios = { ...filtro, perfilesPermitidos };
  const resultado = await listarUsuarios(filtroEfectivo, { repositorio: prismaUsuarioRepository });
  const { filas, paginacion } = resultado;
  const ahora = new Date();

  const hayFiltros =
    filtro.termino !== undefined || filtro.perfil !== undefined || filtro.activo !== undefined;

  const conteo =
    paginacion.total === 1 ? "1 usuario encontrado" : `${paginacion.total} usuarios encontrados`;

  const descripcionTabla = hayFiltros
    ? `Usuarios que coinciden con los filtros aplicados. Página ${paginacion.pagina} de ${paginacion.totalPaginas}.`
    : `Usuarios registrados. Página ${paginacion.pagina} de ${paginacion.totalPaginas}.`;

  return (
    <section>
      <p aria-live="polite" className="mt-6 text-sm font-medium text-gob-gray-a">
        {conteo}
      </p>

      {filas.length > 0 ? (
        <>
          <TablaUsuarios
            filas={filas.map((fila) => aFilaVista(fila, ahora))}
            actorId={actorId}
            descripcion={descripcionTabla}
            rutaBase={rutaBase}
            actorEsAdmin={actorEsAdmin}
          />
          <PaginacionUsuarios
            paginacion={paginacion}
            construirHref={construirHref}
            cantidadEnPagina={filas.length}
          />
        </>
      ) : null}

      {filas.length === 0 && paginacion.total === 0 && !hayFiltros ? (
        <EstadoVacio
          titulo="Aún no hay usuarios registrados"
          detalle="Crea la primera cuenta para que el equipo pueda ingresar al sistema."
          accion={
            <Link href={`${rutaBase}/nuevo`} className={CLASES_ENLACE_VACIO}>
              Crear usuario
            </Link>
          }
        />
      ) : null}

      {filas.length === 0 && paginacion.total === 0 && hayFiltros ? (
        <EstadoVacio
          titulo={
            filtro.termino
              ? `No se encontraron usuarios para "${filtro.termino}"`
              : "No se encontraron usuarios con esos filtros"
          }
          detalle="Revisa el texto buscado o quita los filtros para ver el padrón completo."
          accion={
            <Link href={rutaBase} className={CLASES_ENLACE_VACIO}>
              Limpiar filtros
            </Link>
          }
        />
      ) : null}

      {filas.length === 0 && paginacion.total > 0 ? (
        <EstadoVacio
          titulo="Esta página no tiene resultados"
          detalle={`La búsqueda tiene ${paginacion.total} resultados repartidos en ${paginacion.totalPaginas} páginas.`}
          accion={
            <Link href={construirHref(1)} className={CLASES_ENLACE_VACIO}>
              Ir a la página 1
            </Link>
          }
        />
      ) : null}
    </section>
  );
}
