import { llamarAgente, type SalidaAgente } from "./gemini";
import { extraerLocal } from "./local";
import { SYSTEM_PROMPT, promptUsuario } from "./prompts";
import { resumenDe } from "./cashflow";
import type {
  Actualizacion,
  ContextoAgente,
  FilaExtraida,
  TipoTransaccion,
} from "./types";
import { TIPOS } from "./types";

/** Limpia y valida una fila cruda del LLM. */
export function sanitizarFila(f: SalidaAgente["transacciones"][number]): FilaExtraida | null {
  if (!f || typeof f.producto !== "string" || !f.producto.trim()) return null;
  const tipo = TIPOS.includes(f.tipo as TipoTransaccion)
    ? (f.tipo as TipoTransaccion)
    : null;
  if (!tipo) return null;
  let monto =
    typeof f.monto === "number" && Number.isFinite(f.monto) ? f.monto : null;
  if (monto != null && monto < 0) monto = Math.abs(monto);
  const cantidad =
    typeof f.cantidad === "number" && Number.isFinite(f.cantidad) && f.cantidad > 0
      ? f.cantidad
      : 1;
  // Regla dura: si falta el monto, siempre requiere confirmación.
  const requiere = monto == null ? true : Boolean(f.requiere_confirmacion);
  return {
    tipo,
    producto: f.producto.trim().toLowerCase(),
    cantidad,
    monto,
    cliente: typeof f.cliente === "string" && f.cliente.trim() ? f.cliente.trim() : null,
    requiere_confirmacion: requiere,
  };
}

export function sanitizarActualizaciones(
  acts: SalidaAgente["actualizaciones"],
  idsValidos: Set<string>,
): Actualizacion[] {
  return (acts ?? [])
    .filter((a) => a && typeof a.id === "string" && idsValidos.has(a.id))
    .map((a) => ({
      id: a.id,
      monto:
        typeof a.monto === "number" && Number.isFinite(a.monto) ? a.monto : null,
      cantidad:
        typeof a.cantidad === "number" && Number.isFinite(a.cantidad)
          ? a.cantidad
          : null,
    }))
    .filter((a) => a.monto != null || a.cantidad != null);
}

export interface SalidaLimpia extends Omit<SalidaAgente, "transacciones"> {
  transacciones: FilaExtraida[];
}

/** Llama al LLM con un contexto ya armado (compartido por chat y lote). */
export async function extraer(
  ctx: ContextoAgente,
  entrada: { texto?: string; audio?: { data: string; mimeType: string } },
): Promise<SalidaLimpia> {
  if (process.env.AGENTE_MOCK === "1") {
    return extraerLocal(ctx, entrada);
  }
  const prompt = promptUsuario(ctx, entrada.texto);
  const salida = await llamarAgente({
    systemPrompt: SYSTEM_PROMPT,
    audio: entrada.audio,
    promptTexto: prompt,
  });
  return {
    ...salida,
    transacciones: salida.transacciones
      .map(sanitizarFila)
      .filter((f): f is FilaExtraida => f !== null),
  };
}

export function resumenVacio() {
  return resumenDe([]);
}
