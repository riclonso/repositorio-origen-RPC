import { NextResponse } from "next/server";

// Pendiente: aún no existe un flujo de administración de usuarios en el sistema.
export async function GET() {
  return NextResponse.json({ error: "No implementado" }, { status: 501 });
}
