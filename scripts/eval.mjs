#!/usr/bin/env node
/**
 * Evalúa el agente contra el kit de ejemplo:
 *   - envía inputs/ejemplos_mensajes.csv a /api/lote del dev server
 *   - compara la salida con inputs/ejemplos_respuestas.csv
 *
 * Uso: npm run dev   (en otra terminal)
 *      node scripts/eval.mjs [url_base]
 */
import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";

const BASE = process.argv[2] || "http://localhost:3000";
const root = path.resolve(import.meta.dirname, "..");

function leerCsv(archivo) {
  const { data } = Papa.parse(fs.readFileSync(archivo, "utf8"), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().replace(/^﻿/, ""),
  });
  return data;
}

function clave(f) {
  const monto = f.monto === "" || f.monto == null ? null : Number(f.monto);
  return `${f.tipo}|${(f.producto ?? "").toLowerCase().trim()}|${f.cantidad}|${monto == null ? "" : monto.toFixed(2)}|${f.requiere_confirmacion === true || f.requiere_confirmacion === "SI" ? "SI" : "NO"}`;
}

function flujo(filas) {
  let v = 0, g = 0, c = 0;
  for (const f of filas) {
    const m = f.monto === "" || f.monto == null ? null : Number(f.monto);
    if (m == null) continue;
    if (f.tipo === "venta") v += m;
    else if (f.tipo === "gasto") g += m;
    else if (f.tipo === "cobro_fiado") c += m;
  }
  return v + c - g;
}

const mensajesCsv = fs.readFileSync(path.join(root, "inputs/ejemplos_mensajes.csv"), "utf8");
const esperado = leerCsv(path.join(root, "inputs/ejemplos_respuestas.csv"));

const res = await fetch(`${BASE}/api/lote`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ csv: mensajesCsv }),
});
const data = await res.json();
if (!res.ok) {
  console.error("Error del servidor:", data.error);
  process.exit(1);
}
const obtenido = data.filas;

// Comparación por mensaje: multiset de claves (tipo|producto|cant|monto|flag)
const porId = (filas) => {
  const m = new Map();
  for (const f of filas) {
    const id = f.id_mensaje;
    if (!m.has(id)) m.set(id, []);
    m.get(id).push(f);
  }
  return m;
};
const mapEsp = porId(esperado);
const mapObt = porId(obtenido);
const ids = new Set([...mapEsp.keys(), ...mapObt.keys()]);

let exactas = 0, faltan = 0, sobran = 0, flagMal = 0;
for (const id of [...ids].sort()) {
  const esp = (mapEsp.get(id) ?? []).map(clave).sort();
  const obt = (mapObt.get(id) ?? []).map(clave).sort();
  const bolsa = new Map();
  for (const c of esp) bolsa.set(c, (bolsa.get(c) ?? 0) + 1);
  for (const c of obt) {
    if ((bolsa.get(c) ?? 0) > 0) {
      bolsa.set(c, bolsa.get(c) - 1);
      exactas++;
    } else {
      sobran++;
      console.log(`  [${id}] fila de más:     ${c}`);
    }
  }
  for (const [c, n] of bolsa) {
    for (let i = 0; i < n; i++) {
      faltan++;
      console.log(`  [${id}] fila que falta: ${c}`);
    }
  }
}

const fEsp = flujo(esperado);
const fObt = flujo(obtenido);
console.log(`\nFilas esperadas: ${esperado.length}, obtenidas: ${obtenido.length}`);
console.log(`Coinciden exacto: ${exactas} · faltan: ${faltan} · sobran: ${sobran}`);
console.log(`Flujo esperado: S/ ${fEsp.toFixed(2)} · flujo obtenido: S/ ${fObt.toFixed(2)}`);
console.log(flagMal);
