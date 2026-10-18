/**
 * Pruebas unitarias determinísticas de la validación local del modo lote.
 * NO usan red ni Gemini: solo la lógica pura que sanea la salida del modelo.
 *
 * Runner nativo de Node (sin dependencias):
 *   node --test scripts/lote-validacion.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizarFilaBatch, normalizarFilasBatch } from "../lib/loteValidacion.ts";
import { normalizarProducto } from "../lib/productos.ts";

const IDS = ["H01", "H02", "H03"];

test("normaliza una fila con id válido y pasa el producto a minúsculas", () => {
  const fila = normalizarFilaBatch(
    { id_mensaje: "H01", tipo: "venta", producto: "  PAN ", cantidad: 2, monto: 6, requiere_confirmacion: false },
    new Set(IDS),
  );
  assert.ok(fila);
  assert.equal(fila.id_mensaje, "H01");
  assert.equal(fila.tipo, "venta");
  assert.equal(fila.producto, "pan");
  assert.equal(fila.cantidad, 2);
  assert.equal(fila.monto, 6);
  assert.equal(fila.requiere_confirmacion, false);
});

test("si falta el monto fuerza requiere_confirmacion aunque el modelo diga que no", () => {
  const fila = normalizarFilaBatch(
    { id_mensaje: "H02", tipo: "venta", producto: "atún", cantidad: 3, monto: null, requiere_confirmacion: false },
    new Set(IDS),
  );
  assert.ok(fila);
  assert.equal(fila.monto, null);
  assert.equal(fila.requiere_confirmacion, true);
});

test("un monto negativo se toma en valor absoluto", () => {
  const fila = normalizarFilaBatch(
    { id_mensaje: "H01", tipo: "gasto", producto: "luz", cantidad: 1, monto: -92, requiere_confirmacion: false },
    new Set(IDS),
  );
  assert.ok(fila);
  assert.equal(fila.monto, 92);
});

test("cantidad inválida cae a 1", () => {
  const fila = normalizarFilaBatch(
    { id_mensaje: "H01", tipo: "venta", producto: "pan", cantidad: 0, monto: 3, requiere_confirmacion: false },
    new Set(IDS),
  );
  assert.ok(fila);
  assert.equal(fila.cantidad, 1);
});

test("descarta filas con id desconocido, tipo inválido o producto vacío", () => {
  assert.equal(normalizarFilaBatch({ id_mensaje: "ZZ9", tipo: "venta", producto: "pan", cantidad: 1, monto: 1 }, new Set(IDS)), null);
  assert.equal(normalizarFilaBatch({ id_mensaje: "H01", tipo: "propina", producto: "pan", cantidad: 1, monto: 1 }, new Set(IDS)), null);
  assert.equal(normalizarFilaBatch({ id_mensaje: "H01", tipo: "venta", producto: "   ", cantidad: 1, monto: 1 }, new Set(IDS)), null);
});

test("normalizarFilasBatch reporta ids sin filas y cuántas se descartaron", () => {
  const res = normalizarFilasBatch(
    [
      { id_mensaje: "H01", tipo: "venta", producto: "pan", cantidad: 1, monto: 3, requiere_confirmacion: false },
      { id_mensaje: "ZZ9", tipo: "venta", producto: "x", cantidad: 1, monto: 1, requiere_confirmacion: false },
      { id_mensaje: "H01", tipo: "malo", producto: "y", cantidad: 1, monto: 1, requiere_confirmacion: false },
    ],
    IDS,
  );
  assert.equal(res.filas.length, 1);
  assert.equal(res.descartadas, 2);
  assert.deepEqual(res.idsSinFilas, ["H02", "H03"]);
});

test("normalizarFilasBatch tolera basura (null / no-array) sin tirar", () => {
  const res = normalizarFilasBatch(null, IDS);
  assert.equal(res.filas.length, 0);
  assert.equal(res.descartadas, 0);
  assert.deepEqual(res.idsSinFilas, IDS);
});

test("normalizarProducto mapea singular/plural y acentos SOLO con coincidencia exacta", () => {
  assert.equal(normalizarProducto("panes"), "pan");
  assert.equal(normalizarProducto("gaseosas"), "gaseosa");
  assert.equal(normalizarProducto("atun"), "atún");
  assert.equal(normalizarProducto("  HUEVOS "), "huevos");
  // No debe tocar productos compuestos ni desconocidos (evita romper "ventas sueltas").
  assert.equal(normalizarProducto("ventas sueltas"), "ventas sueltas");
  assert.equal(normalizarProducto("inca kola"), "inca kola");
});
