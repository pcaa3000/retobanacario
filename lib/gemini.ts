import { GoogleGenAI, Type, type Part, type Schema } from "@google/genai";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

let cliente: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!cliente) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("Falta GEMINI_API_KEY en .env.local");
    cliente = new GoogleGenAI({ apiKey });
  }
  return cliente;
}

const transaccionSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    tipo: {
      type: Type.STRING,
      enum: ["venta", "gasto", "fiado", "cobro_fiado"],
      description: "Tipo de transacción",
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
  required: ["tipo", "producto", "cantidad", "requiere_confirmacion"],
  propertyOrdering: [
    "tipo",
    "producto",
    "cantidad",
    "monto",
    "cliente",
    "requiere_confirmacion",
  ],
};

export const RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    transcripcion: {
      type: Type.STRING,
      nullable: true,
      description: "Transcripción literal de la nota de voz, si hubo audio",
    },
    transacciones: { type: Type.ARRAY, items: transaccionSchema },
    actualizaciones: {
      type: Type.ARRAY,
      description:
        "Datos que resuelven PREGUNTAS_PENDIENTES, referenciados por id",
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          monto: { type: Type.NUMBER, nullable: true },
          cantidad: { type: Type.NUMBER, nullable: true },
        },
        required: ["id"],
        propertyOrdering: ["id", "monto", "cantidad"],
      },
    },
    respuesta: {
      type: Type.STRING,
      description: "Mensaje corto y simple para Doña Rosa",
    },
  },
  required: ["transacciones", "actualizaciones", "respuesta"],
  propertyOrdering: [
    "transcripcion",
    "transacciones",
    "actualizaciones",
    "respuesta",
  ],
};

export interface SalidaAgente {
  transcripcion: string | null;
  transacciones: {
    tipo: string;
    producto: string;
    cantidad: number;
    monto?: number | null;
    cliente?: string | null;
    requiere_confirmacion: boolean;
  }[];
  actualizaciones: { id: string; monto?: number | null; cantidad?: number | null }[];
  respuesta: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MAX_INTENTOS = 3;

/**
 * Llama a Gemini con salida JSON estructurada y reintentos. Devuelve el JSON
 * ya parseado (sin tipar): lo comparten el chat y el modo lote.
 */
async function generarJsonCrudo(
  parts: Part[],
  systemPrompt: string,
  schema: Schema,
): Promise<unknown> {
  const ai = getClient();
  let ultimoError: unknown;
  for (let intento = 0; intento < MAX_INTENTOS; intento++) {
    try {
      const res = await ai.models.generateContent({
        model: MODEL,
        contents: [{ role: "user", parts }],
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json",
          responseSchema: schema,
          temperature: 0,
        },
      });
      return JSON.parse(res.text ?? "{}");
    } catch (e) {
      ultimoError = e;
      await sleep(1000 * (intento + 1));
    }
  }
  throw ultimoError;
}

export async function llamarAgente(opts: {
  systemPrompt: string;
  texto?: string;
  audio?: { data: string; mimeType: string };
  promptTexto: string;
}): Promise<SalidaAgente> {
  const parts: Part[] = [{ text: opts.promptTexto }];
  if (opts.audio) {
    parts.push({
      inlineData: { data: opts.audio.data, mimeType: opts.audio.mimeType },
    });
  }
  const parsed = (await generarJsonCrudo(
    parts,
    opts.systemPrompt,
    RESPONSE_SCHEMA,
  )) as SalidaAgente;
  return {
    transcripcion: parsed.transcripcion ?? null,
    transacciones: parsed.transacciones ?? [],
    actualizaciones: parsed.actualizaciones ?? [],
    respuesta: parsed.respuesta ?? "Anotado.",
  };
}

/** Llamada genérica a Gemini con schema propio (usada por el modo lote). */
export async function llamarGeminiJson<T = unknown>(opts: {
  systemPrompt: string;
  promptTexto: string;
  schema: Schema;
}): Promise<T> {
  const parts: Part[] = [{ text: opts.promptTexto }];
  return (await generarJsonCrudo(parts, opts.systemPrompt, opts.schema)) as T;
}
