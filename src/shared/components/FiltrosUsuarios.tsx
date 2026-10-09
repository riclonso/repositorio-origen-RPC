"use client";

import { useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { FILTRO_LISTADO_POR_DEFECTO } from "@/modules/usuarios/schemas/listado-usuarios.schema";
import { Boton } from "@/shared/components/Boton";
import { CampoSelect, type OpcionSelect } from "@/shared/components/CampoSelect";
import { CampoTexto } from "@/shared/components/CampoTexto";

// Los perfiles son datos del catálogo, no una lista fija en el código: llegan por props desde
// la página, que los lee de la base.
const OPCION_TODOS_LOS_PERFILES: OpcionSelect = { valor: "", etiqueta: "Todos los perfiles" };

// RF-30: igual que los perfiles, los establecimientos llegan por props (todos, incluidos los
// inactivos marcados, para poder encontrar cuentas de un establecimiento dado de baja).
const OPCION_TODOS_LOS_ESTABLECIMIENTOS: OpcionSelect = {
  valor: "",
  etiqueta: "Todos los establecimientos",
};

// Formatos de archivo asignados a usuarios: también llegan por props, incluidos los inactivos.
const OPCION_TODOS_LOS_FORMATOS: OpcionSelect = { valor: "", etiqueta: "Todos los formatos" };

const OPCIONES_ESTADO = [
  { valor: "", etiqueta: "Todos los estados" },
  { valor: "true", etiqueta: "Activos" },
  { valor: "false", etiqueta: "Inactivos" },
];

// Compartido entre `/dashboard/usuarios` (ADMIN) y `/revisor/usuarios` (REVISOR_REPOSITORIO):
// mismo formulario de filtros, cada área aporta su propia base de ruta. La URL se arma aquí
// mismo, en el cliente, a partir de `rutaBase` (un string, serializable): pasar la función
// `construirRutaUsuarios*` de cada área como prop no es válido, un Server Component no puede
// pasar funciones a un Client Component.
type FiltrosUsuariosProps = {
  terminoInicial: string;
  perfilInicial: string;
  establecimientoInicial: string;
  formatoInicial: string;
  activoInicial: string;
  tamano: number;
  opcionesPerfil: OpcionSelect[];
  opcionesEstablecimiento: OpcionSelect[];
  opcionesFormato: OpcionSelect[];
  rutaBase: string;
};

// El filtro vive en la URL, no en un store ni en estado derivado: los campos son no
// controlados y el componente se remonta con la `key` del filtro vigente que pasa la página.
export function FiltrosUsuarios({
  terminoInicial,
  perfilInicial,
  establecimientoInicial,
  formatoInicial,
  activoInicial,
  tamano,
  opcionesPerfil,
  opcionesEstablecimiento,
  opcionesFormato,
  rutaBase,
}: FiltrosUsuariosProps) {
  const router = useRouter();
  const [buscando, iniciarBusqueda] = useTransition();

  // Toda navegación de filtro vuelve a la página 1: buscar desde la página 5 mostraría vacío.
  // La página nunca se agrega a la URL (siempre es 1, el valor por defecto), igual que hacen
  // `construirRutaUsuariosDashboard`/`construirRutaUsuariosRevisor`.
  function manejarEnvio(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();

    const datos = new FormData(evento.currentTarget);
    const termino = String(datos.get("q") ?? "").trim();
    const perfil = String(datos.get("perfil") ?? "");
    const establecimiento = String(datos.get("establecimiento") ?? "");
    const formato = String(datos.get("formato") ?? "");
    const activo = String(datos.get("activo") ?? "");

    const parametros = new URLSearchParams();
    if (termino) parametros.set("q", termino);
    if (perfil) parametros.set("perfil", perfil);
    if (establecimiento) parametros.set("establecimiento", establecimiento);
    if (formato) parametros.set("formato", formato);
    if (activo) parametros.set("activo", activo);
    if (tamano !== FILTRO_LISTADO_POR_DEFECTO.tamano) {
      parametros.set("tamano", String(tamano));
    }

    const consulta = parametros.toString();
    const ruta = consulta ? `${rutaBase}?${consulta}` : rutaBase;

    iniciarBusqueda(() => router.push(ruta));
  }

  function limpiarFiltros() {
    iniciarBusqueda(() => router.push(rutaBase));
  }

  return (
    <form
      onSubmit={manejarEnvio}
      aria-busy={buscando || undefined}
      className="card-sistema mt-6 p-4"
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr_1fr_1fr]">
        <CampoTexto
          id="filtro-q"
          name="q"
          etiqueta="Buscar"
          ayuda="Nombre, apellido, RUT o email. Se ignoran tildes y mayúsculas."
          type="search"
          defaultValue={terminoInicial}
          maxLength={100}
        />

        <CampoSelect
          id="filtro-perfil"
          name="perfil"
          etiqueta="Perfil"
          opciones={[OPCION_TODOS_LOS_PERFILES, ...opcionesPerfil]}
          defaultValue={perfilInicial}
        />

        <CampoSelect
          id="filtro-establecimiento"
          name="establecimiento"
          etiqueta="Establecimiento"
          opciones={[OPCION_TODOS_LOS_ESTABLECIMIENTOS, ...opcionesEstablecimiento]}
          defaultValue={establecimientoInicial}
        />

        <CampoSelect
          id="filtro-formato"
          name="formato"
          etiqueta="Formato de archivo"
          opciones={[OPCION_TODOS_LOS_FORMATOS, ...opcionesFormato]}
          defaultValue={formatoInicial}
        />

        <CampoSelect
          id="filtro-activo"
          name="activo"
          etiqueta="Estado"
          opciones={OPCIONES_ESTADO}
          defaultValue={activoInicial}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <Boton type="submit" variante="primario" cargando={buscando} textoCargando="Buscando...">
          Buscar
        </Boton>
        <Boton variante="secundario" onClick={limpiarFiltros} disabled={buscando}>
          Limpiar filtros
        </Boton>
      </div>
    </form>
  );
}
