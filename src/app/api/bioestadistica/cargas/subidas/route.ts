import { atenderSubida } from "@/modules/subidas-archivo/infrastructure/http";
export const runtime = "nodejs";
export async function POST(request: Request) { return atenderSubida(request, "bioestadistica", "iniciar"); }
