import type { EnlacePanel } from "@/shared/components/NavegacionPanel";

// RF-37: navegación del área del perfil Bioestadística.
export const ENLACES_BIOESTADISTICA: readonly EnlacePanel[] = [
  { href: "/bioestadistica", etiqueta: "Inicio" },
  { href: "/bioestadistica/historial", etiqueta: "Mis archivos" },
  { href: "/bioestadistica/solicitudes", etiqueta: "Mis solicitudes" },
];
