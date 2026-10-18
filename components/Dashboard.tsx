"use client";

import { COLOR_TIPO, ETIQUETA_TIPO, soles } from "@/lib/format";
import type { Resumen, Transaccion } from "@/lib/types";

function Tarjeta({ titulo, valor, detalle }: { titulo: string; valor: string; detalle?: string }) {
  return (
    <div className="rounded-xl bg-white p-3 shadow">
      <p className="text-xs uppercase tracking-wide text-gray-500">{titulo}</p>
      <p className="text-xl font-bold">{valor}</p>
      {detalle && <p className="text-xs text-gray-500">{detalle}</p>}
    </div>
  );
}

export default function Dashboard({
  resumen,
  transacciones,
  fiados,
  onCuota,
}: {
  resumen: Resumen | null;
  transacciones: Transaccion[];
  fiados: Transaccion[];
  onCuota: () => void;
}) {
  const porCobrarPorCliente = new Map<string, number>();
  for (const f of fiados) {
    const c = f.cliente ?? "sin nombre";
    porCobrarPorCliente.set(c, (porCobrarPorCliente.get(c) ?? 0) + (f.monto ?? 0));
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto">
      <div className="grid grid-cols-2 gap-3">
        <Tarjeta titulo="Ventas" valor={soles(resumen?.ventas)} />
        <Tarjeta titulo="Gastos" valor={soles(resumen?.gastos)} />
        <Tarjeta titulo="Cobros de fiado" valor={soles(resumen?.cobros)} />
        <Tarjeta titulo="Fiado por cobrar" valor={soles(resumen?.por_cobrar)} />
        <Tarjeta
          titulo="Flujo de caja semanal"
          valor={soles(resumen?.flujo_semanal)}
          detalle="ventas + cobros − gastos"
        />
        <Tarjeta
          titulo="Cuota mensual sostenible"
          valor={soles(resumen?.cuota_mensual)}
          detalle={`≈ mitad de S/ ${resumen?.flujo_mensual?.toFixed(2) ?? "?"} libres al mes`}
        />
      </div>

      <button
        onClick={onCuota}
        className="rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow hover:bg-indigo-700"
      >
        ¿Cuánto puedo pagar de cuota al mes?
      </button>

      {porCobrarPorCliente.size > 0 && (
        <div className="rounded-xl bg-white p-3 shadow">
          <h2 className="mb-2 text-sm font-bold">Fiados anotados</h2>
          <ul className="space-y-1 text-sm">
            {[...porCobrarPorCliente.entries()].map(([cliente, total]) => (
              <li key={cliente} className="flex justify-between">
                <span>{cliente}</span>
                <span className="font-semibold">{soles(total)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex-1 rounded-xl bg-white p-3 shadow">
        <h2 className="mb-2 text-sm font-bold">
          Transacciones ({transacciones.length})
        </h2>
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-gray-500">
              <th className="py-1">Tipo</th>
              <th>Producto</th>
              <th className="text-right">Cant.</th>
              <th className="text-right">Monto</th>
            </tr>
          </thead>
          <tbody>
            {transacciones.map((t) => (
              <tr key={t.id} className="border-t">
                <td className="py-1">
                  <span className={`rounded px-1.5 py-0.5 ${COLOR_TIPO[t.tipo]}`}>
                    {ETIQUETA_TIPO[t.tipo]}
                  </span>
                </td>
                <td>{t.producto}{t.cliente ? ` · ${t.cliente}` : ""}</td>
                <td className="text-right">{t.cantidad}</td>
                <td className="text-right font-medium">
                  {t.monto == null ? (
                    <span className="text-amber-600">falta</span>
                  ) : (
                    soles(t.monto)
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
