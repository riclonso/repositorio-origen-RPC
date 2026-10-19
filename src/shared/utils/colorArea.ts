// Color de cada área top-level (el del encabezado del panel): distingue de un vistazo en qué panel
// se está. Única fuente: lo usan `EncabezadoPanel` y los controles que deben ir a juego con él.
export const COLOR_AREA = {
  "/dashboard": "#173b69",
  "/notificador": "#678d6c",
  "/revisor": "#3f84d8",
  // RF-37: área del perfil Bioestadística.
  "/bioestadistica": "#5b4f8f",
} as const;

export type RutaArea = keyof typeof COLOR_AREA;

// Color del área a la que pertenece una ruta (`/revisor/formatos-excel` → color de `/revisor`).
// Fuera de un área conocida, el del administrador.
export function colorDeRuta(ruta: string): string {
  const area = `/${ruta.split("/")[1] ?? ""}`;
  return area in COLOR_AREA ? COLOR_AREA[area as RutaArea] : COLOR_AREA["/dashboard"];
}
