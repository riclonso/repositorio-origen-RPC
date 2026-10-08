import { atenderSubida } from "@/modules/subidas-archivo/infrastructure/http";
export const runtime = "nodejs";
export async function PUT(request: Request, contexto: {params: Promise<{id:string;indice:string}>}) { const {id,indice} = await contexto.params; return atenderSubida(request,"bioestadistica","parte",id,indice); }
