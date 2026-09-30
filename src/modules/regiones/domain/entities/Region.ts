// Región de Chile (RF-26). `nombreNormalizado` NO forma parte de la entidad de dominio que viaja a
// la UI: es un detalle interno de unicidad que se deriva del nombre en la capa de aplicación.
export type Region = {
  id: string;
  nombre: string;
  // Dos dígitos con cero a la izquierda ("01".."16").
  codigo: string;
  numero: number;
  createdAt: Date;
};

// `nombreNormalizado` se deriva del nombre en el caso de uso, nunca lo envía el cliente.
export type DatosNuevaRegion = {
  nombre: string;
  nombreNormalizado: string;
  codigo: string;
  numero: number;
};

export type DatosEdicionRegion = DatosNuevaRegion;

// Campo por el que una región choca con otra. Lo usa el borde HTTP para marcar el campo del
// formulario, sin exponer ningún dato de la región en conflicto.
export type CampoUnicoRegion = "nombre" | "codigo" | "numero";

export type ClavesUnicasRegion = {
  nombreNormalizado: string;
  codigo: string;
  numero: number;
};
