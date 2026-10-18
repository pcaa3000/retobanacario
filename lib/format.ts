export function soles(x: number | null | undefined): string {
  if (x == null) return "?";
  return `S/ ${x.toFixed(2)}`;
}

export const ETIQUETA_TIPO: Record<string, string> = {
  venta: "Venta",
  gasto: "Gasto",
  fiado: "Fiado",
  cobro_fiado: "Cobro fiado",
};

export const COLOR_TIPO: Record<string, string> = {
  venta: "bg-green-100 text-green-800",
  gasto: "bg-red-100 text-red-800",
  fiado: "bg-amber-100 text-amber-800",
  cobro_fiado: "bg-blue-100 text-blue-800",
};
