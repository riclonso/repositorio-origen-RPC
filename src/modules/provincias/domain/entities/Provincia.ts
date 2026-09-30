// Provincia de Chile (RF-27). `nombreNormalizado` NO forma parte de la entidad de dominio que viaja
// a la UI: es un detalle interno de unicidad que se deriva del nombre en la capa de aplicación.
export type Provincia = {
  id: string;
  nombre: string;
  // Código INE de tres dígitos ("081"); los dos primeros son el código de su región.
  codigo: string;
  // Región a la que pertenece, con lo mínimo que necesita el listado para mostrarla.
  region: RegionDeProvincia;
  createdAt: Date;
};

export type RegionDeProvincia = {
  id: string;
  nombre: string;
  codigo: string;
};

// `nombreNormalizado` se deriva del nombre en el caso de uso, nunca lo envía el cliente.
export type DatosNuevaProvincia = {
  nombre: string;
  nombreNormalizado: string;
  codigo: string;
  regionId: string;
};

export type DatosEdicionProvincia = DatosNuevaProvincia;

// Campo por el que una provincia choca con otra. Lo usa el borde HTTP para marcar el campo del
// formulario, sin exponer ningún dato de la provincia en conflicto.
export type CampoUnicoProvincia = "nombre" | "codigo";

// `codigo` es único global; `nombreNormalizado` es único dentro de `regionId`.
export type ClavesUnicasProvincia = {
  codigo: string;
  regionId: string;
  nombreNormalizado: string;
};

export type FiltroListadoProvincias = {
  regionId?: string;
};

// Lo que devuelve una eliminación exitosa (RF-28): la región de la provincia borrada, para
// auditarla (la fila ya no existe cuando el borde registra el evento).
export type ProvinciaEliminada = {
  regionId: string;
};
