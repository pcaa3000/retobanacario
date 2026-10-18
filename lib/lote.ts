/**
 * Motor del modo lote (`/api/lote`).
 *
 * Estrategia: UNA sola request batch a Gemini para toda la semana (así el
 * modelo ve el contexto completo — p. ej. un fiado y su cobro posterior — y no
 * choca con el límite de requests/minuto del plan gratuito), seguida de
 * validación determinística local. Si no hay key, falla la red o el modelo
 * devuelve vacío, cae al extractor local por reglas (`lib/local.ts`).
 */
import { Type, type Schema } from "@google/genai";
import { llamarGeminiJson } from "./gemini";
import { extraerLocal } from "./local";
import { sanitizarActualizaciones } from "./agent";
import { normalizarProducto } from "./productos";
import { normalizarFilasBatch } from "./loteValidacion";
import { resumenDe } from "./cashflow";
import type { FilaMensaje, FilaResultado } from "./csv";
import type { ContextoAgente, Transaccion } from "./types";

// ------------------------------------------------------------- motor local

interface FilaLote {
  id: string;
  ext_id: string;
  tipo: Transaccion["tipo"];
  producto: string;
  cantidad: number;
  monto: number | null;
  cliente: string | null;
  requiere_confirmacion: boolean;
  resuelta: boolean;
}

function comoRef(f: FilaLote) {
  return {
    id: f.id,
    tipo: f.tipo,
    producto: f.producto,
    cantidad: f.cantidad,
    monto: f.monto,
    cliente: f.cliente,
  };
}

function aResultado(f: FilaLote): FilaResultado {
  return {
    id_mensaje: f.ext_id,
    tipo: f.tipo,
    producto: f.producto,
    cantidad: f.cantidad,
    monto: f.monto,
    requiere_confirmacion: f.requiere_confirmacion,
  };
}

/**
 * Procesa los mensajes en orden como una sola semana usando el extractor local
 * por reglas. Determinístico, sin red. Es el fallback y el modo `AGENTE_MOCK`.
 */
export function procesarLoteLocal(mensajes: FilaMensaje[]): FilaResultado[] {
  const filas: FilaLote[] = [];
  const historial: string[] = [];
  let contador = 0;

  for (const m of mensajes) {
    const emitidas = filas.filter((f) => !f.resuelta && f.requiere_confirmacion);
    const ctx: ContextoAgente = {
      pendientes: emitidas.map(comoRef),
      fiados: filas.filter((f) => f.tipo === "fiado").map(comoRef),
      cobros: filas
        .filter((f) => f.tipo === "cobro_fiado")
        .map((f) => ({
          tipo: f.tipo,
          producto: f.producto,
          cantidad: f.cantidad,
          monto: f.monto,
          cliente: f.cliente,
        })),
      historial: historial.slice(-12),
      resumen: resumenDe(filas as unknown as Transaccion[]),
    };

    const salida = extraerLocal(ctx, { texto: m.mensaje });
    historial.push(m.mensaje);

    const ids = new Set(emitidas.map((f) => f.id));
    for (const act of sanitizarActualizaciones(salida.actualizaciones, ids)) {
      const fila = filas.find((f) => f.id === act.id);
      if (!fila) continue;
      if (act.monto != null) fila.monto = act.monto;
      if (act.cantidad != null) fila.cantidad = act.cantidad;
      fila.resuelta = true;
    }

    for (const t of salida.transacciones) {
      filas.push({
        id: `f${++contador}`,
        ext_id: m.id_mensaje,
        tipo: t.tipo,
        producto: t.producto,
        cantidad: t.cantidad,
        monto: t.monto,
        cliente: t.cliente,
        requiere_confirmacion: t.requiere_confirmacion,
        resuelta: !t.requiere_confirmacion,
      });
    }
  }

  return filas.map(aResultado);
}

// ------------------------------------------------------------- motor Gemini

const LOTE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    transacciones: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id_mensaje: {
            type: Type.STRING,
            description: "id_mensaje exacto del mensaje que originó la fila",
          },
          tipo: {
            type: Type.STRING,
            enum: ["venta", "gasto", "fiado", "cobro_fiado"],
          },
          producto: { type: Type.STRING },
          cantidad: { type: Type.NUMBER },
          monto: {
            type: Type.NUMBER,
            nullable: true,
            description: "Total en soles de la línea; null si falta el dato",
          },
          cliente: {
            type: Type.STRING,
            nullable: true,
            description: "Para fiados/cobros: nombre del cliente si se menciona",
          },
          requiere_confirmacion: { type: Type.BOOLEAN },
        },
        required: ["id_mensaje", "tipo", "producto", "cantidad", "requiere_confirmacion"],
        propertyOrdering: [
          "id_mensaje",
          "tipo",
          "producto",
          "cantidad",
          "monto",
          "cliente",
          "requiere_confirmacion",
        ],
      },
    },
  },
  required: ["transacciones"],
  propertyOrdering: ["transacciones"],
};

const LOTE_SYSTEM_PROMPT = `Eres "Caja", la asistente de cuentas de Doña Rosa, dueña de una bodega en Lima.
Recibes TODOS los mensajes de UNA semana, EN ORDEN, y devuelves TODAS sus
transacciones en una sola lista JSON plana. Cada fila lleva el id_mensaje exacto
del mensaje que la originó.

TIPOS DE TRANSACCIÓN:
- "venta": venta cobrada en el momento (suma a la caja).
- "gasto": compras, servicios, pagos a proveedores o ayudantes, y devoluciones
  de dinero a clientes (resta de la caja).
- "fiado": venta a crédito; el cliente se lleva el producto y paga después. No
  entra a la caja. Anota el cliente si aparece.
- "cobro_fiado": el cliente paga algo que debía (suma a la caja).

REGLAS:
- Recorre los mensajes EN ORDEN y usa los anteriores como contexto: si un cobro
  de fiado no dice monto pero el fiado correspondiente ya apareció en la semana,
  usa EXACTAMENTE el mismo producto y monto de ese fiado (no inventes
  "pago parcial <cliente>").
- "monto" es el TOTAL en soles de la línea (cantidad × precio, con descuentos ya
  aplicados; "me rebajó 5" resta 5 del total).
- Si el mensaje se corrige ("no perdón, fueron 12"), registra SOLO la versión
  corregida.
- NUNCA inventes un monto ni pongas 0. Si falta, monto = null y
  requiere_confirmacion = true.
- "cantidad" en unidades/kilos; si no se puede determinar, usa 1.
- Un mensaje puede generar varias filas o NINGUNA (saludo, gasto personal,
  "para la casa, no es del negocio"). No repitas ni omitas mensajes.
- Interpreta números en palabras ("tres" = 3, "seis cincuenta" = 6.50) y errores
  de tipeo ("bendi" = vendí, "guevos" = huevos).

NOMBRES DE PRODUCTO (minúsculas, cortos; copia estos cuando correspondan):
- "pan", "gaseosa", "leche" (sola), "pollo", "azúcar", "atún", "cerveza",
  "detergente", "agua"; plural "huevos", "galletas", "bolsas".
- Si menciona la marca: "leche gloria". El producto a granel es "arroz"; el saco
  es "saco de arroz". El gas es "balón de gas".
- "ventas sueltas" para "salió 210 en ventas sueltas"; "abarrotes sueltos" para
  "salió X en abarrotes sueltos".
- El proveedor de gaseosas es "gaseosas proveedor".
- El ayudante es "ayudante" (NUNCA "pago ayudante").
- Fiado con nombre corto de producto: "aceite primor". Cobro sin producto: el del
  fiado; si de verdad no hay fiado ni producto, "pago parcial <cliente>".`;

const EJEMPLOS = `EJEMPLOS (mensaje → filas):
"vendí 10 panes a 0.30 y 3 leches gloria a 4.20" → pan 10 3.00; leche gloria 3 12.60
"vendí 4 leches a 4.20" → leche 4 16.80
"compré al mayorista 1 saco de arroz a 190, me rebajó 10" → gasto saco de arroz 1 180.00
"vendí 3 atunes" → atún 3 (monto null, requiere_confirmacion true)
"la señora Rosa María se llevó 1 aceite primor fiado, está 11 soles" → fiado aceite primor 1 11.00
"la señora Rosa María me pagó lo del aceite" → cobro_fiado aceite primor 1 11.00
"don Pepe me pagó 10 de lo que debe" → cobro_fiado pago parcial don pepe 1 10.00
"pagué 35 al chico que me ayuda" → gasto ayudante 1 35.00
"un cliente devolvió un yogur malogrado, le devolví 5.50" → gasto devolución yogur 1 5.50
"compré 2 paquetes de fideos a 2.80 para la casa, no es del negocio" → (ninguna fila)`;

export function construirPromptLote(mensajes: FilaMensaje[]): string {
  const lineas = mensajes
    .map((m) => `${m.id_mensaje} | ${m.dia || "-"} | ${m.mensaje}`)
    .join("\n");
  return `${EJEMPLOS}\n\nMENSAJES DE LA SEMANA (id | dia | mensaje), EN ORDEN:\n${lineas}`;
}

export interface ResultadoGemini {
  filas: FilaResultado[];
  idsSinFilas: string[];
  descartadas: number;
}

/** Una sola request a Gemini para toda la semana + saneo local. */
export async function procesarLoteGemini(mensajes: FilaMensaje[]): Promise<ResultadoGemini> {
  const ids = mensajes.map((m) => m.id_mensaje);
  const crudo = await llamarGeminiJson<{ transacciones?: unknown }>({
    systemPrompt: LOTE_SYSTEM_PROMPT,
    promptTexto: construirPromptLote(mensajes),
    schema: LOTE_SCHEMA,
  });
  const val = normalizarFilasBatch(crudo?.transacciones, ids);
  const filas: FilaResultado[] = val.filas.map((f) => ({
    id_mensaje: f.id_mensaje,
    tipo: f.tipo,
    producto: normalizarProducto(f.producto),
    cantidad: f.cantidad,
    monto: f.monto,
    requiere_confirmacion: f.requiere_confirmacion,
  }));
  return { filas, idsSinFilas: val.idsSinFilas, descartadas: val.descartadas };
}

// ------------------------------------------------------------- orquestador

export interface ResultadoLote {
  filas: FilaResultado[];
  fuente: "gemini" | "local";
  /** Motivo del fallback cuando se usó el motor local por un error. */
  aviso?: string;
}

/**
 * Decide el motor: Gemini batch por defecto; local si `AGENTE_MOCK=1`,
 * `LOTE_MOTOR=local`, no hay API key, o Gemini falla / devuelve vacío.
 */
export async function procesarLote(mensajes: FilaMensaje[]): Promise<ResultadoLote> {
  const forzarLocal = process.env.AGENTE_MOCK === "1" || process.env.LOTE_MOTOR === "local";
  if (forzarLocal || !process.env.GEMINI_API_KEY) {
    return { filas: procesarLoteLocal(mensajes), fuente: "local" };
  }
  try {
    const { filas } = await procesarLoteGemini(mensajes);
    if (filas.length === 0) throw new Error("Gemini no devolvió transacciones");
    return { filas, fuente: "gemini" };
  } catch (e) {
    const aviso = e instanceof Error ? e.message : "error desconocido";
    return { filas: procesarLoteLocal(mensajes), fuente: "local", aviso };
  }
}
