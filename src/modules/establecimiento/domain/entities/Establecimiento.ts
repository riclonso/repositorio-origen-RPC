// El tipo viaja en dos campos PLANOS y no como objeto anidado: `tipoId` es el identificador
// estable con el que operan las reglas (asignabilidad, edición), `tipoNombre` es la etiqueta que
// se muestra y que el mantenedor de tipos podrá cambiar sin romper nada.
export type Establecimiento = {
  id: string;
  rut: string;
  nombre: string;
  direccion: string;
  tipoId: string;
  tipoNombre: string;
  activo: boolean;
  createdAt: Date;
};

// Al crear, el establecimiento nace activo.
export type DatosNuevoEstablecimiento = {
  rut: string;
  nombre: string;
  direccion: string;
  tipoId: string;
};

// El RUT SÍ es editable (revalidando unicidad), a diferencia del RUT de usuario.
export type DatosEdicionEstablecimiento = {
  rut: string;
  nombre: string;
  direccion: string;
  tipoId: string;
};

// Único campo con restricción UNIQUE en la tabla `establecimiento`: el RUT. El nombre puede
// repetirse.
export type CampoUnico = "rut";

export type FiltroListadoEstablecimientos = {
  termino?: string;
  tipo?: string;
  activo?: boolean;
  pagina: number;
  tamano: number;
};

export type PaginaEstablecimientos = {
  filas: Establecimiento[];
  total: number;
};

// RF-30: opción de un select de establecimiento (alta/edición de usuarios y filtro del listado).
// Proyección angosta: el select no necesita dirección ni tipo. `activo` viaja para que la etiqueta
// marque "(inactivo)" a los que solo aparecen por `incluirIds` o en el filtro.
export type EstablecimientoOpcion = {
  id: string;
  nombre: string;
  rut: string;
  activo: boolean;
};

export type FiltroOpcionesEstablecimiento = {
  // `true`: solo activos (más `incluirIds`); `false`: todos, incluidos los inactivos (lo usa el
  // filtro del listado de usuarios, para poder encontrar cuentas de un establecimiento dado de baja).
  soloActivos: boolean;
  // Ids que se incluyen aunque estén inactivos. Lo necesita la edición de usuario: si el
  // establecimiento vigente fue dado de baja y no aparece en el select, el navegador elegiría otra
  // opción y guardar lo cambiaría en silencio (mismo criterio que `OpcionesListadoTipos.incluirIds`).
  incluirIds?: string[];
};
