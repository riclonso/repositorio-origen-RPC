import type { EnlacePanel } from "@/shared/components/NavegacionPanel";

export const ENLACES_ADMIN: readonly EnlacePanel[] = [
  { href: "/dashboard", etiqueta: "Panel" },
  { href: "/dashboard/usuarios", etiqueta: "Usuarios" },
  { href: "/dashboard/formatos-excel", etiqueta: "Formatos de archivo" },
  { href: "/dashboard/ventanas-carga", etiqueta: "Ventanas de carga" },
  { href: "/dashboard/cargas", etiqueta: "Cargas aprobadas" },
  { href: "/dashboard/logs", etiqueta: "Logs" },
];
