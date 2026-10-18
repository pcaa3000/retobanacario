import type { SalidaLimpia } from "./agent";
import type { ContextoAgente, FilaExtraida, TipoTransaccion } from "./types";
import { explicacionCuota } from "./cashflow";
import { acentuar, PROD } from "./productos";

/**
 * Extractor local determinista por reglas. NO usa red.
 *
 * Lo usa:
 *  - el modo lote (`/api/lote`), que NUNCA toca la API de Gemini;
 *  - el chat cuando `AGENTE_MOCK=1` (demo sin API key).
 *
 * El agente "real" del chat sigue siendo Gemini (`lib/gemini.ts`).
 */

// ------------------------------------------------------------------ números

const NUM: Record<string, number> = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6,
  siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13,
  catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18,
  diecinueve: 19, veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50,
  sesenta: 60, setenta: 70, ochenta: 80, noventa: 90, cien: 100,
};
const NUMWORDS = Object.keys(NUM).join("|");
const DECENAS = new Set([
  "diez", "veinte", "treinta", "cuarenta", "cincuenta",
  "sesenta", "setenta", "ochenta", "noventa",
]);

/** "seis cincuenta" → 6.5 · "cuatro soles" → 4 · "2.80" → 2.8 · "medio" → 0.5 */
function numDe(txt: string): number | null {
  const toks = txt.trim().split(/\s+/).filter(Boolean);
  if (!toks.length) return null;
  const t0 = toks[0];
  if (/^\d+(?:\.\d+)?$/.test(t0)) return parseFloat(t0);
  if (t0 === "medio" || t0 === "media") return 0.5;
  const n = NUM[t0];
  if (n == null) return null;
  if (toks[1] && DECENAS.has(toks[1]) && n < 100) return n + NUM[toks[1]] / 100;
  return n;
}

// --------------------------------------------------------------- texto

/** Normaliza para matchear: minúsculas, sin acentos, decimales preservados. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/;/g, " ; ")
    .replace(/(\d)\.(\d)/g, "$1\u0001$2")
    .replace(/[.,:!?¿¡()"[\]{}]/g, " ")
    .replace(/\u0001/g, ".")
    .replace(/\s+/g, " ")
    .trim();
}

// --------------------------------------------------------------- productos

/** Convierte palabras sueltas en un nombre de producto estable. */
function productoDe(txt: string): string {
  const words = txt.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "producto";
  const full = words.join(" ");
  if (PROD[full]) return PROD[full];
  const head = words[words.length - 1];
  if (PROD[head]) words[words.length - 1] = PROD[head];
  else if (head.length > 3 && head.endsWith("s")) words[words.length - 1] = head.slice(0, -1);
  return words.map(acentuar).join(" ");
}

// --------------------------------------------------------------- clientes

const STOP_NOMBRE = new Set([
  "me", "se", "le", "te", "lo", "la", "los", "las", "de", "del", "a", "al",
  "en", "el", "por", "para", "que", "con", "un", "una", "y", "mi", "su", "lo",
  "pago", "paga", "pagar", "pague", "pagaron", "llevo", "debe", "debia",
  "vecina", "vecino", "del", "3", "dos", "tres",
]);

function clienteDe(t: string): string | null {
  const m = t.match(/\b(senora|senor|don|dona)\s+(.+)/);
  if (m) {
    const palabras = m[2]
      .split(" ")
      .filter((w) => /^[a-zñ]+$/.test(w) && !STOP_NOMBRE.has(w))
      .slice(0, 2);
    if (palabras.length > 0) return `${m[1]} ${palabras.join(" ")}`;
  }
  const v = t.match(/\bvecina\b|\bvecino\b/);
  return v ? v[0] : null;
}

const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Quita la referencia al cliente para no contaminar el nombre del producto. */
function quitarCliente(s: string, cliente: string | null): string {
  let out = s;
  if (cliente) {
    const vida = cliente.split(" ").slice(1).join(" ");
    out = out.replace(new RegExp(`\\b(?:a|de|del|para|al)\\s+${esc(cliente)}\\b`, "g"), " ");
    out = out.replace(new RegExp(`\\b${esc(cliente)}\\b`, "g"), " ");
    if (vida) out = out.replace(new RegExp(`\\b${esc(vida)}\\b`, "g"), " ");
  }
  out = out
    .replace(/\b(?:la|el)\s+vecina(?:\s+del?\s+\d+)?/g, " ")
    .replace(/\b(?:la|el)\s+vecino(?:\s+del?\s+\d+)?/g, " ")
    .replace(/\bvecina(?:\s+del?\s+\d+)?/g, " ")
    .replace(/\bvecino(?:\s+del?\s+\d+)?/g, " ")
    .replace(/\bse\s+llevo\b/g, " ")
    .replace(/\ble\s+fi[eé]\b/g, " ")
    .replace(/\bfi[eé]\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return out;
}

// --------------------------------------------------------------- helper fila

function fila(p: Partial<FilaExtraida> & Pick<FilaExtraida, "tipo" | "producto">): FilaExtraida {
  const monto = p.monto ?? null;
  return {
    cantidad: p.cantidad ?? 1,
    cliente: p.cliente ?? null,
    tipo: p.tipo,
    producto: p.producto,
    monto,
    requiere_confirmacion: monto == null ? true : (p.requiere_confirmacion ?? false),
  };
}

// --------------------------------------------------------------- operaciones

const VERBO =
  "(?:vendi|bendi|bend|vende|vendio|pague|pagu|compre|compro|fie|fio|devolvi|devolvio|levanto|me pago|me cancelo|me abono|me debia|salieron|salio|se vendio)";

/** Parte un mensaje en operaciones (por ";", y por " y "/", " cuando arranca otro verbo). */
function dividirOps(t: string): string[] {
  const re = new RegExp(`\\s*;\\s*|\\s+(?:y|e)\\s+(?=${VERBO}\\b)|,\\s+(?=${VERBO}\\b)`, "g");
  return t.split(re).map((s) => s.trim()).filter(Boolean);
}

type Clase = TipoTransaccion | "personal" | "ninguna";

function clasificar(seg: string): Clase {
  if (/no es del negocio|para la casa|es personal/.test(seg)) return "personal";
  if (/\bme pago\b|\bme pag\w+\b|\bme cancelo\b|\bme abono\b|de lo que debe|de lo que me debia/.test(seg))
    return "cobro_fiado";
  if (/\bfiado\b|\bfiados\b|\bfiadas?\b|\bfie\b|\bfio\b|\bfiar\b/.test(seg)) return "fiado";
  if (/\bdevolv\w+\b/.test(seg)) return "gasto";
  if (/ventas sueltas|abarrotes sueltos|\ben total\b/.test(seg)) return "venta";
  if (/\bpague\b|\bpagu\w*\b|\bcompre\b|\bcompro\b|\bpago\b|\bgaste\b/.test(seg) && !/\bvendi\b|\bbendi\b/.test(seg))
    return "gasto";
  if (/\bvendi\b|\bbendi\b|\bbend\w*\b|\bvende\b|\bvendio\b|\bsalio\b|\bsalieron\b|\bse vendio\b/.test(seg))
    return "venta";
  return "ninguna";
}

// --------------------------------------------------------------- ventas

function parseItemVenta(
  it: string,
  corrCant: number | null,
  tipo: TipoTransaccion,
): FilaExtraida | null {
  let s = it.trim();
  if (!/[a-zñ]/.test(s)) return null;

  let cantidad = 1;
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(?:medio|media)\b/))) {
    cantidad = 0.5;
    s = s.slice(m[0].length).trim();
  } else if ((m = s.match(/^(\d+(?:\.\d+)?)\b/))) {
    cantidad = parseFloat(m[1]);
    s = s.slice(m[0].length).trim();
  } else if ((m = s.match(new RegExp(`^(${NUMWORDS})\\b`)))) {
    cantidad = NUM[m[1]];
    s = s.slice(m[0].length).trim();
  }
  if (corrCant != null) cantidad = corrCant;

  s = s.replace(/^(?:kilos?|litros?|docenas?|paquetes?|sacos?|latas?|unidades?)\s+(?:de\s+)?/, "").trim();

  let precioU: number | null = null;
  let producto = "";
  const mp = s.match(/\s+(?:a|est[ao]|estaba|estan|salio|salieron|fue|fueron|quedo|costo)\s+(.+)$/);
  if (mp && mp.index != null) {
    precioU = numDe(mp[1].replace(/\b(?:soles?|el kilo|la unidad|c\/u|cada un[oa]|cada|y)\b/g, " ").trim());
    producto = s.slice(0, mp.index).trim();
  } else {
    const mt = s.match(/(\d+(?:\.\d+)?)\s*(?:c\/u|cada un[oa]|cada|el kilo|soles)\s*$/);
    if (mt && mt.index != null) {
      precioU = parseFloat(mt[1]);
      producto = s.slice(0, mt.index).trim();
    } else {
      producto = s.trim();
    }
  }

  producto = producto.replace(/\s+/g, " ").trim();
  if (!producto) return null;
  const monto = precioU == null ? null : Math.round(precioU * cantidad * 100) / 100;
  return fila({ tipo, cantidad, producto: productoDe(producto), monto });
}

function parseVenta(seg: string, tipo: TipoTransaccion): FilaExtraida[] {
  const filas: FilaExtraida[] = [];
  let s = seg;

  const corr = s.match(new RegExp(`no perdon.*?fueron\\s+(\\d+|${NUMWORDS})`));
  const corrCant = corr ? numDe(corr[1]) : null;

  const mSuel =
    s.match(/(\d+(?:\.\d+)?)\s+en\s+(ventas sueltas|abarrotes sueltos|total)\b/) ??
    s.match(/(?:salio|salieron|se vendio|vendio)[^0-9]*?(\d+(?:\.\d+)?)\s+en\s+(ventas sueltas|abarrotes sueltos|total)\b/);
  if (mSuel) {
    const prod = mSuel[2] === "total" ? "ventas sueltas" : mSuel[2];
    filas.push(fila({ tipo, cantidad: 1, producto: prod, monto: parseFloat(mSuel[1]) }));
    s = s.replace(mSuel[0], " ");
  }

  s = s
    .replace(/\b(?:aparte de lo anotado|cerre caja|en el dia|hoy|buenos dias|buenas|hola|domingo flojo|domingo tranquilo|sabado bueno|sabado|domingo|lunes|martes|miercoles|jueves|viernes|se vendio|vendio|vendi|bendi|bend|vende|salieron|salio)\b/g, " ")
    .replace(/\bno perdon\b|\bfueron\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  for (const it of s.split(/\s+y\s+|,\s*/).map((x) => x.trim()).filter(Boolean)) {
    const f = parseItemVenta(it, corrCant, tipo);
    if (f) filas.push(f);
  }
  return filas;
}

// --------------------------------------------------------------- gastos

function normalizaGasto(s: string): string {
  let p = ` ${s} `;
  p = p
    .replace(/\bal chico que me (?:ayuda|ayudo)\b/g, " ayudante ")
    .replace(/\bal ayudante\b/g, " ayudante ")
    .replace(/\bchico que me (?:ayuda|ayudo)\b/g, " ayudante ")
    .replace(/\bproveedor de ([a-zñ]+)\b/g, " $1 proveedor ")
    .replace(/\bmercaderia de ([a-zñ]+)\b/g, " $1 ")
    .replace(/\b(?:su plata|la plata)\b/g, " ")
    .replace(/\bde propina al repartidor\b/g, " propina ")
    .replace(/\bpropina al repartidor\b/g, " propina ")
    .replace(/\b(?:soles?|el kilo|la unidad)\b/g, " ");
  p = p.replace(/^\s*(?:el|la|los|las|al|del|de|un|una|su)\s+/, " ");
  return p.replace(/\s+/g, " ").trim();
}

function parseDevolucion(seg: string): FilaExtraida {
  const mp = seg.match(/\bdevolv\w*\s+(?:un |una |el |la |los |las )?([a-zñ]+(?:\s+[a-zñ]+)?)/);
  let prod = mp?.[1] ?? "producto";
  prod = prod.replace(/\b(?:malogrado|malograda|vencido|vencida|bueno|buena)\b/g, "").trim() || "producto";
  const mm = seg.match(/(\d+(?:\.\d+)?)\s*$/);
  return fila({
    tipo: "gasto",
    producto: productoDe(`devolucion ${prod}`),
    cantidad: 1,
    monto: mm ? parseFloat(mm[1]) : null,
  });
}

function parseCompra(seg: string): FilaExtraida | null {
  const reb = seg.match(/rebajo\s+(\d+(?:\.\d+)?)/);
  const s = seg.replace(/\b(?:pero\s+)?me rebajo.*$/, "").trim();

  const m = s.match(
    new RegExp(`(?:compre|compro)\\s+(?:al mayorista\\s+)?(\\d+(?:\\.\\d+)?|${NUMWORDS})\\s+(.+?)\\s+a\\s+(.+)$`),
  );
  if (m) {
    const cantidad = numDe(m[1]) ?? 1;
    const prod = productoDe(m[2]);
    const pu = numDe(m[3].replace(/\b(?:soles?|el kilo)\b/g, " ").trim());
    let monto = pu == null ? null : pu * cantidad;
    if (monto != null && reb) monto -= parseFloat(reb[1]);
    return fila({ tipo: "gasto", producto: prod, cantidad, monto: monto == null ? null : Math.round(monto * 100) / 100 });
  }

  const mp = s.match(/(?:compre|compro)\s+(?:al mayorista\s+)?(.+?)(?:\s+para\b|$)/);
  const prod = mp?.[1]?.trim() || "compra";
  return fila({ tipo: "gasto", producto: productoDe(prod), monto: null });
}

function parsePagoItem(s: string): FilaExtraida | null {
  const t = s.replace(/^(?:pague|pagu\w*|pago)\s+/, "").trim();
  const mn = t.match(/(\d+(?:\.\d+)?)/);
  const monto = mn ? parseFloat(mn[1]) : null;
  const prod = normalizaGasto(t.replace(/\d+(?:\.\d+)?/g, " "));
  if (!prod && monto == null) return null;
  return fila({ tipo: "gasto", producto: productoDe(prod || "gasto"), monto });
}

function parseGasto(seg: string): FilaExtraida[] {
  if (/\bdevolv\w+\b/.test(seg)) return [parseDevolucion(seg)];
  if (/\bcompre\b|\bcompro\b/.test(seg)) {
    const f = parseCompra(seg);
    return f ? [f] : [];
  }
  return seg
    .split(/\s+y\s+|,\s*/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map(parsePagoItem)
    .filter((f): f is FilaExtraida => f !== null);
}

// --------------------------------------------------------------- fiados / cobros

function extraerProductoY(
  s: string,
): { cantidad: number; producto: string; precioU: number | null } {
  let cantidad = 1;
  let resto = s;
  let m: RegExpMatchArray | null;
  if ((m = resto.match(/^(?:medio|media)\b/))) {
    cantidad = 0.5;
    resto = resto.slice(m[0].length).trim();
  } else if ((m = resto.match(/^(\d+(?:\.\d+)?)\b/))) {
    cantidad = parseFloat(m[1]);
    resto = resto.slice(m[0].length).trim();
  } else if ((m = resto.match(new RegExp(`^(${NUMWORDS})\\b`)))) {
    cantidad = NUM[m[1]];
    resto = resto.slice(m[0].length).trim();
  }
  resto = resto.replace(/^(?:kilos?|litros?|docenas?|paquetes?|sacos?)\s+(?:de\s+)?/, "").trim();

  const mp = resto.match(/\s+(?:a|est[ao]|estaba|estan)\s+(.+)$/);
  let precioU: number | null = null;
  let producto: string;
  if (mp && mp.index != null) {
    precioU = numDe(mp[1].replace(/\b(?:soles?|el kilo|la unidad|c\/u)\b/g, " ").trim());
    producto = resto.slice(0, mp.index).trim();
  } else {
    producto = resto.trim();
  }
  producto = producto.replace(/\b(?:a|de|del)\s+(?:don|dona|senor|senora)\b.*$/, "").replace(/[\s,]+$/, "").trim();
  return { cantidad, producto, precioU };
}

function parseFiado(seg: string, ctx: ContextoAgente): FilaExtraida {
  const cliente = clienteDe(seg);
  let s = quitarCliente(seg, cliente).replace(/\bfiados?\b|\bfiadas?\b|\bfiar\b/g, " ");
  s = s.replace(/^(?:la|el|los|las|le|me|se)\s+/g, " ").replace(/\s+/g, " ").trim();
  const { cantidad, producto, precioU } = extraerProductoY(s);
  const monto = precioU == null ? null : Math.round(precioU * cantidad * 100) / 100;
  return fila({ tipo: "fiado", producto: productoDe(producto || "producto"), cantidad, monto, cliente });
}

function parseCobro(seg: string, ctx: ContextoAgente): FilaExtraida {
  const cliente = clienteDe(seg);
  const mNum = seg.match(/\bme pago\s+(\d+(?:\.\d+)?)/) ?? seg.match(/(\d+(?:\.\d+)?)\s*de lo que/);
  let monto = mNum ? parseFloat(mNum[1]) : null;
  let producto: string | null = null;

  if (monto == null) {
    const que = seg.match(/lo del?\s+([a-zñ]+)/)?.[1];
    const fiado =
      (que && ctx.fiados.find((f) => f.producto.includes(que) || que.includes(f.producto.split(" ")[0]))) ||
      (cliente && ctx.fiados.find((f) => f.cliente && norm(f.cliente).includes(norm(cliente))));
    if (fiado) {
      monto = fiado.monto;
      producto = fiado.producto;
    }
  }
  if (!producto) producto = cliente ? `pago parcial ${cliente}` : "pago de fiado";
  return fila({ tipo: "cobro_fiado", producto, cantidad: 1, monto, cliente });
}

// --------------------------------------------------------------- respuesta al pendiente

function parecePrecio(t: string): number | null {
  const m =
    t.match(/(?:^|\s)a\s+(.+)$/) ??
    t.match(/(?:estaban?|salieron?|salio|fueron|quedo|costo|esta)\s+a?\s*(.+\d.*)$/) ??
    t.match(/^\s*(\d+(?:\.\d+)?)\s*$/) ??
    t.match(/(\d+(?:\.\d+)?)\s*(?:c\/u|cada un[oa]|el kilo|la unidad)/);
  if (!m) return null;
  return numDe(m[1].replace(/\b(?:soles?|el kilo|la unidad|\bc\/u\b|cada)\b/g, " ").trim());
}

const ES_OPERACION =
  /vend|bendi|pagu|compre|\bfie\b|fiado|devolv|me pago|me cancelo|me abono|en ventas|en abarrotes|salio|salieron/;

// --------------------------------------------------------------- entrada

export function extraerLocal(
  ctx: ContextoAgente,
  entrada: { texto?: string; audio?: { data: string; mimeType: string } },
): SalidaLimpia {
  const texto = entrada.texto ?? "(nota de voz — el extractor local no transcribe audio)";
  const t = norm(texto);
  const transacciones: FilaExtraida[] = [];
  const actualizaciones: { id: string; monto?: number | null; cantidad?: number | null }[] = [];
  let respuesta = "";

  // ¿Pregunta por la cuota?
  if (/\bcuota\b|\bprestamo\b|\bcredito\b|pagar.*\bmes\b/.test(t)) {
    return {
      transcripcion: entrada.audio ? texto : null,
      transacciones,
      actualizaciones,
      respuesta:
        explicacionCuota(ctx.resumen) +
        " Ojo: esto es solo una estimación de lo que su bodega podría pagar; no es una aprobación de crédito.",
    };
  }

  // ¿Responde a una pregunta pendiente?
  const pendiente = ctx.pendientes[ctx.pendientes.length - 1];
  if (pendiente && !ES_OPERACION.test(t)) {
    const precioU = parecePrecio(t);
    if (precioU != null) {
      const monto = Math.round(precioU * pendiente.cantidad * 100) / 100;
      actualizaciones.push({ id: pendiente.id, monto });
      return {
        transcripcion: entrada.audio ? texto : null,
        transacciones,
        actualizaciones,
        respuesta: `Perfecto, anoto ${pendiente.cantidad} de ${pendiente.producto} por S/ ${monto.toFixed(2)}.`,
      };
    }
  }

  for (const seg of dividirOps(t)) {
    const clase = clasificar(seg);
    if (clase === "personal" || clase === "ninguna") continue;
    if (clase === "fiado") transacciones.push(parseFiado(seg, ctx));
    else if (clase === "cobro_fiado") transacciones.push(parseCobro(seg, ctx));
    else if (clase === "gasto") transacciones.push(...parseGasto(seg));
    else transacciones.push(...parseVenta(seg, clase));
  }

  if (!respuesta) {
    if (transacciones.length) {
      const faltan = transacciones.filter((x) => x.requiere_confirmacion);
      const total = transacciones.reduce((a, x) => a + (x.monto ?? 0), 0);
      respuesta =
        `Anoté ${transacciones.length} movimiento(s)` +
        (total > 0 ? ` por S/ ${total.toFixed(2)}.` : ".") +
        (faltan.length ? ` ¿A cómo fue ${faltan.map((x) => x.producto).join(" y ")}?` : "");
    } else {
      respuesta = "No entendí bien. ¿Me lo repite, por favor?";
    }
  }

  return { transcripcion: entrada.audio ? texto : null, transacciones, actualizaciones, respuesta };
}
