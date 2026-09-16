// Tipo de establecimiento. `nombreNormalizado` NO forma parte de la entidad de dominio que viaja
// a la UI: es un detalle interno de unicidad que se deriva del nombre en la capa de aplicación.
export type TipoEstablecimiento = {
  id: string;
  nombre: string;
  activo: boolean;
  createdAt: Date;
};

// Al crear, la entidad nace activa. `nombreNormalizado` se deriva del nombre en el caso de uso.
export type DatosNuevoTipo = {
  nombre: string;
  nombreNormalizado: string;
};

// La edición solo cambia el nombre visible (y con él el normalizado); `activo` se gestiona por la
// vía de cambiar estado, no editando el formulario.
export type DatosEdicionTipo = {
  nombre: string;
  nombreNormalizado: string;
};

export type OpcionesListadoTipos = {
  soloActivos?: boolean;
  // Ids que se incluyen aunque estén inactivos. Lo necesita el formulario de edición de
  // establecimiento: si el tipo vigente fue dado de baja y no aparece en el select, el navegador
  // seleccionaría otra opción y guardar cambiaría el tipo en silencio.
  incluirIds?: string[];
};
