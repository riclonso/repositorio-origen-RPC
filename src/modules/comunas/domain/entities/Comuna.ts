// Comuna de Chile (RF-28). `nombreNormalizado` NO forma parte de la entidad de dominio que viaja a
// la UI: es un detalle interno de unicidad que se deriva del nombre en la capa de aplicación.
export type Comuna = {
  id: string;
  nombre: string;
  // Código INE de cinco dígitos ("08101"); los tres primeros son el código de su provincia.
  codigo: string;
  // Provincia a la que pertenece (y, a través de ella, la región), con lo mínimo que necesita el
  // listado para mostrarlas.
  provincia: ProvinciaDeComuna;
  createdAt: Date;
};

export type ProvinciaDeComuna = {
  id: string;
  nombre: string;
  codigo: string;
  region: RegionDeComuna;
};

export type RegionDeComuna = {
  id: string;
  nombre: string;
  codigo: string;
};

// `nombreNormalizado` se deriva del nombre en el caso de uso, nunca lo envía el cliente.
export type DatosNuevaComuna = {
  nombre: string;
  nombreNormalizado: string;
  codigo: string;
  provinciaId: string;
};

export type DatosEdicionComuna = DatosNuevaComuna;

// Campo por el que una comuna choca con otra. Lo usa el borde HTTP para marcar el campo del
// formulario, sin exponer ningún dato de la comuna en conflicto.
export type CampoUnicoComuna = "nombre" | "codigo";

// `codigo` es único global; `nombreNormalizado` es único dentro de `provinciaId`.
export type ClavesUnicasComuna = {
  codigo: string;
  provinciaId: string;
  nombreNormalizado: string;
};

// Filtros del listado, combinados con AND. Ausentes = sin filtro.
export type FiltroListadoComunas = {
  regionId?: string;
  provinciaId?: string;
};

// Lo que devuelve una eliminación exitosa: la provincia de la comuna borrada, para auditarla
// (la fila ya no existe cuando el borde registra el evento).
export type ComunaEliminada = {
  provinciaId: string;
};
