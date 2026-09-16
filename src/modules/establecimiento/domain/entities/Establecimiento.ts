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
