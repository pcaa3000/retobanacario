/**
 * Diccionario y normalización de nombres de producto de la bodega.
 *
 * Es un módulo PURO y sin imports de runtime: lo consumen el extractor local
 * (`lib/local.ts`), el modo lote (`lib/lote.ts`) y sus pruebas unitarias.
 *
 * `normalizarProducto` solo aplica coincidencia EXACTA contra el diccionario,
 * así no rompe productos compuestos o desconocidos que vienen del modelo
 * (p. ej. "ventas sueltas" o "inca kola" se devuelven tal cual).
 */

/** Nombre "de clave" para el producto (singular/plural tal como lo espera el kit). */
export const PROD: Record<string, string> = {
  pan: "pan", panes: "pan",
  leche: "leche", leches: "leche", gloria: "gloria",
  "leche gloria": "leche gloria", "leches gloria": "leche gloria",
  gaseosa: "gaseosa", gaseosas: "gaseosa",
  "gaseosa proveedor": "gaseosas proveedor", "gaseosas proveedor": "gaseosas proveedor",
  huevo: "huevos", huevos: "huevos", guevo: "huevos", guevos: "huevos",
  atun: "atún", atunes: "atún",
  yogur: "yogur", yogures: "yogur",
  detergente: "detergente", detergentes: "detergente",
  cerveza: "cerveza", cervezas: "cerveza",
  pollo: "pollo", pollos: "pollo",
  azucar: "azúcar",
  agua: "agua",
  galleta: "galletas", galletas: "galletas",
  bolsa: "bolsas", bolsas: "bolsas",
  fideo: "fideos", fideos: "fideos",
  arroz: "arroz", queso: "queso", luz: "luz", gas: "gas",
  propina: "propina", ayudante: "ayudante", primor: "primor",
  proveedor: "proveedor", saco: "saco", kola: "kola",
  lata: "lata", aceite: "aceite", tarro: "tarro",
};

const ACENTO: Record<string, string> = {
  azucar: "azúcar", atun: "atún", balon: "balón", devolucion: "devolución",
};

export const acentuar = (w: string) => ACENTO[w] ?? w;

/** Normaliza SOLO con coincidencia exacta; lo demás se devuelve en minúsculas. */
export function normalizarProducto(txt: string): string {
  const base = txt.trim().toLowerCase();
  return PROD[base] ?? base;
}
