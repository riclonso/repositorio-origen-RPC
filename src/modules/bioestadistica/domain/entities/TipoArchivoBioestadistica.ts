// RF-37: los dos archivos que reporta el perfil Bioestadística por año. Lista fija (mismo enum en
// `prisma/schema.prisma`): agregar un tercer tipo es una decisión de producto con UI propia.
export const TIPOS_ARCHIVO_BIOESTADISTICA = ["DEFUNCIONES", "EGRESOS"] as const;
export type TipoArchivoBioestadistica = (typeof TIPOS_ARCHIVO_BIOESTADISTICA)[number];

export const ETIQUETAS_TIPO_ARCHIVO_BIOESTADISTICA: Record<TipoArchivoBioestadistica, string> = {
  DEFUNCIONES: "Defunciones",
  EGRESOS: "Egresos",
};
