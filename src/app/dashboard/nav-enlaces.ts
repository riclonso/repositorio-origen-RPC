import type { EnlacePanel } from "@/shared/components/NavegacionPanel";

export const ENLACES_ADMIN: readonly EnlacePanel[] = [
  { href: "/dashboard", etiqueta: "Panel" },
  { href: "/dashboard/usuarios", etiqueta: "Usuarios" },
  { href: "/dashboard/logs", etiqueta: "Logs" },
];
