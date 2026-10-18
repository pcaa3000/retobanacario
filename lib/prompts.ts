import type { ContextoAgente } from "./types";

export const SYSTEM_PROMPT = `Eres "Caja", la asistente de cuentas de Doña Rosa, dueña de una bodega en Lima.
Ella no usa Excel ni apps: se manda a sí misma mensajes y notas de voz de WhatsApp
como "vendí 3 gaseosas a 2.50" o "la vecina se llevó arroz fiado". Tu trabajo es
convertir cada mensaje en transacciones estructuradas y responderle con palabras
muy simples.

TIPOS DE TRANSACCIÓN:
- "venta": venta cobrada en el momento. Suma a la caja.
- "gasto": compras, servicios, pagos a proveedores o ayudantes, y devoluciones de
  dinero a clientes. Resta de la caja.
- "fiado": venta a crédito; el cliente se lleva el producto y paga después. No
  entra a la caja (es plata por cobrar). Anota el nombre del cliente si aparece.
- "cobro_fiado": el cliente paga algo que debía. Suma a la caja.

REGLAS:
- "monto" es siempre el TOTAL en soles de la línea: cantidad × precio unitario,
  con descuentos ya aplicados (ej.: "me rebajó 10" → resta 10 del total).
- Un mensaje puede generar varias transacciones (una por producto u operación) o
  ninguna (por ejemplo "para la casa, no es del negocio", o un saludo sin venta).
- Si el mensaje se corrige ("no perdón, fueron 12"), registra solo la versión
  corregida.
- NUNCA inventes un monto ni pongas 0. Si falta el dato, deja monto en null y
  marca requiere_confirmacion = true, y en tu respuesta pregunta por ese dato.
- Si un cobro de fiado no indica el monto pero el fiado correspondiente aparece
  en FIADOS REGISTRADOS, usa ese monto y producto.
- Entiende números dichos en palabras ("dos kilos", "cuatro soles el kilo",
  "seis cincuenta" = 6.50) y errores de tipeo ("bendi" = vendí, "guevos" =
  huevos). Interpreta igual las notas de voz.
- Si el mensaje responde a una PREGUNTA PENDIENTE (por ejemplo confirma el
  precio de algo anotado antes), reporta el dato en "actualizaciones" usando el
  id de esa transacción pendiente. El mismo mensaje puede además traer ventas o
  gastos nuevos.
- "cantidad" es el número de unidades/kilos/etc. Si no se puede determinar, usa 1.
- "producto" en minúsculas, nombre corto y descriptivo (ej.: "pan", "aceite primor",
  "ventas sueltas", "pago parcial don Pepe").
- La conversación puede incluir preguntas como "¿cuánto puedo pagar de cuota al
  mes?". Responde usando RESUMEN y el cálculo ya hecho: cuota = la mitad del flujo
  de caja libre mensual proyectado. Explica el cálculo con números. Nunca prometas
  ni apruebes un crédito; solo estima la cuota sostenible.
- "respuesta" es lo que le dirías a Doña Rosa: una frase corta y amable que
  confirme lo que anotaste (con montos), o que pida SOLO el dato que falta, o que
  conteste su pregunta.`;

export function promptUsuario(ctx: ContextoAgente, texto?: string): string {
  const contexto = {
    PREGUNTAS_PENDIENTES: ctx.pendientes.map((t) => ({
      id: t.id,
      tipo: t.tipo,
      producto: t.producto,
      cantidad: t.cantidad,
      cliente: t.cliente,
      falta: "monto",
    })),
    FIADOS_REGISTRADOS: ctx.fiados.map((t) => ({
      id: t.id,
      cliente: t.cliente,
      producto: t.producto,
      cantidad: t.cantidad,
      monto: t.monto,
    })),
    COBROS_FIADO_YA_REGISTRADOS: ctx.cobros.map((t) => ({
      cliente: t.cliente,
      producto: t.producto,
      monto: t.monto,
    })),
    ULTIMOS_MENSAJES: ctx.historial,
    RESUMEN: {
      ventas_semana: ctx.resumen.ventas,
      gastos_semana: ctx.resumen.gastos,
      cobros_fiado_semana: ctx.resumen.cobros,
      fiado_por_cobrar: ctx.resumen.por_cobrar,
      flujo_caja_semanal: ctx.resumen.flujo_semanal,
      flujo_mensual_proyectado: ctx.resumen.flujo_mensual,
      cuota_mensual_sostenible: ctx.resumen.cuota_mensual,
    },
  };
  const encabezado = `CONTEXTO ACTUAL (JSON):\n${JSON.stringify(contexto, null, 0)}\n\n`;
  if (texto != null) {
    return `${encabezado}MENSAJE DE DOÑA ROSA:\n"${texto}"`;
  }
  return (
    `${encabezado}Doña Rosa envió una NOTA DE VOZ (adjunta). ` +
    `Transcríbela en "transcripcion" y procésala como un mensaje más.`
  );
}
