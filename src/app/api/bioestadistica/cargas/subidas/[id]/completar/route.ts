import { atenderSubida } from "@/modules/subidas-archivo/infrastructure/http";
export const runtime = "nodejs";
export async function POST(request: Request, contexto: { params: Promise<{id: string}> }) { return atenderSubida(request,"bioestadistica","completar",(await contexto.params).id); }
