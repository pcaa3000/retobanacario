import type { Resumen, Transaccion } from "./types";

/** Semanas promedio por mes. */
export const SEMANAS_POR_MES = 52 / 12;

/**
 * Margen de seguridad: la cuota sostenible se estima como una fracción del
 * flujo de caja mensual proyectado, dejando colchón para semanas flojas.
 */
export const MARGEN_SEGURIDAD = 0.5;

export function cuotaDesdeFlujo(flujoSemanal: number): number {
  const cuota = flujoSemanal * SEMANAS_POR_MES * MARGEN_SEGURIDAD;
  return Math.round(Math.max(0, cuota) * 100) / 100;
}

const suma = (xs: (number | null)[]) =>
  xs.reduce<number>((acc, x) => acc + (x ?? 0), 0);

export function resumenDe(transacciones: Transaccion[]): Resumen {
  const por = (tipo: Transaccion["tipo"]) =>
    suma(transacciones.filter((t) => t.tipo === tipo).map((t) => t.monto));
  const ventas = por("venta");
  const gastos = por("gasto");
  const cobros = por("cobro_fiado");
  const fiados = por("fiado");
  const flujo = ventas + cobros - gastos;
  return {
    ventas: redondea(ventas),
    gastos: redondea(gastos),
    cobros: redondea(cobros),
    fiados_total: redondea(fiados),
    por_cobrar: redondea(fiados - cobros),
    flujo_semanal: redondea(flujo),
    flujo_mensual: redondea(flujo * SEMANAS_POR_MES),
    cuota_mensual: cuotaDesdeFlujo(flujo),
    n_transacciones: transacciones.length,
  };
}

export const redondea = (x: number) => Math.round(x * 100) / 100;

export function explicacionCuota(r: Resumen): string {
  return (
    `Esta semana entraron S/ ${r.ventas.toFixed(2)} en ventas y S/ ${r.cobros.toFixed(2)} ` +
    `en cobros de fiados, y salieron S/ ${r.gastos.toFixed(2)} en gastos. ` +
    `Eso deja un flujo de caja de S/ ${r.flujo_semanal.toFixed(2)} por semana, ` +
    `unas S/ ${r.flujo_mensual.toFixed(2)} al mes. ` +
    `Para ir segura, podría pagar una cuota de hasta S/ ${r.cuota_mensual.toFixed(2)} ` +
    `al mes (la mitad de su flujo libre mensual), sin que le falte plata para el negocio.`
  );
}
