import { atenderSubida } from "@/modules/subidas-archivo/infrastructure/http";
export const runtime = "nodejs";
export async function GET(request: Request, contexto: { params: Promise<{id: string}> }) { return atenderSubida(request,"bioestadistica","estado",(await contexto.params).id); }
export async function DELETE(request: Request, contexto: { params: Promise<{id: string}> }) { return atenderSubida(request,"bioestadistica","cancelar",(await contexto.params).id); }
