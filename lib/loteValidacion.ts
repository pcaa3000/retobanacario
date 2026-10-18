/**
 * Validación y saneo local de la salida del modelo en el modo lote.
 *
 * Módulo PURO (solo `import type`): no toca red ni estado, así que es trivial
 * de testear. Aplica las reglas duras del reto:
 *  - id_mensaje debe existir en el CSV de entrada;
 *  - tipo ∈ {venta, gasto, fiado, cobro_fiado};
 *  - monto finito o null → si es null, SIEMPRE requiere_confirmacion = true;
 *  - cantidad entera/positiva, si no 1;
 *  - producto en minúsculas y no vacío.
 */
import type { FilaExtraida, TipoTransaccion } from "./types";

export const TIPOS_VALIDOS: readonly TipoTransaccion[] = [
  "venta",
  "gasto",
  "fiado",
  "cobro_fiado",
];

export interface FilaBatchCruda {
  id_mensaje?: unknown;
  tipo?: unknown;
  producto?: unknown;
  cantidad?: unknown;
  monto?: unknown;
  cliente?: unknown;
  requiere_confirmacion?: unknown;
}

export interface FilaBatchNormalizada extends FilaExtraida {
  id_mensaje: string;
}

/** Sanea una fila cruda del modelo. Devuelve null si es unusable. */
export function normalizarFilaBatch(
  f: FilaBatchCruda,
  idsValidos: ReadonlySet<string>,
): FilaBatchNormalizada | null {
  const id = typeof f.id_mensaje === "string" ? f.id_mensaje.trim() : "";
  if (!id || !idsValidos.has(id)) return null;

  const tipo = TIPOS_VALIDOS.includes(f.tipo as TipoTransaccion)
    ? (f.tipo as TipoTransaccion)
    : null;
  if (!tipo) return null;

  const producto = typeof f.producto === "string" ? f.producto.trim().toLowerCase() : "";
  if (!producto) return null;

  let monto = typeof f.monto === "number" && Number.isFinite(f.monto) ? f.monto : null;
  if (monto != null && monto < 0) monto = Math.abs(monto);

  const cantidad =
    typeof f.cantidad === "number" && Number.isFinite(f.cantidad) && f.cantidad > 0
      ? f.cantidad
      : 1;

  const cliente =
    typeof f.cliente === "string" && f.cliente.trim() ? f.cliente.trim() : null;

  // Regla dura: si falta el monto, siempre requiere confirmación.
  const requiere_confirmacion = monto == null ? true : f.requiere_confirmacion === true;

  return { id_mensaje: id, tipo, producto, cantidad, monto, cliente, requiere_confirmacion };
}

export interface ValidacionBatch {
  filas: FilaBatchNormalizada[];
  /** Ids del CSV que NO produjeron ninguna fila (posible omisión del modelo). */
  idsSinFilas: string[];
  /** Filas crudas descartadas por inválidas/desconocidas. */
  descartadas: number;
}

/** Sanea la lista completa del modelo contra los ids del CSV de entrada. */
export function normalizarFilasBatch(
  crudas: unknown,
  idsValidos: readonly string[],
): ValidacionBatch {
  const set = new Set(idsValidos);
  const lista = Array.isArray(crudas) ? crudas : [];
  const filas: FilaBatchNormalizada[] = [];
  let descartadas = 0;
  for (const c of lista) {
    const f = normalizarFilaBatch((c ?? {}) as FilaBatchCruda, set);
    if (f) filas.push(f);
    else descartadas++;
  }
  const conFilas = new Set(filas.map((f) => f.id_mensaje));
  const idsSinFilas = idsValidos.filter((id) => !conFilas.has(id));
  return { filas, idsSinFilas, descartadas };
}
