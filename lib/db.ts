import { supabase, usandoMemoria } from "./supabase";
import type { FilaExtraida, MensajeRow, Transaccion } from "./types";

/**
 * Capa de datos: usa Supabase si hay credenciales y, si no, un almacén en
 * memoria (suficiente para la demo; se pierde al reiniciar el servidor).
 */

interface Memoria {
  mensajes: MensajeRow[];
  transacciones: Transaccion[];
}

const g = globalThis as unknown as { __retobanco_mem?: Memoria };
const mem: Memoria = (g.__retobanco_mem ??= { mensajes: [], transacciones: [] });

function ahora() {
  return new Date().toISOString();
}

export async function insertMensaje(m: {
  ext_id?: string | null;
  dia?: string | null;
  texto: string;
  origen: MensajeRow["origen"];
}): Promise<MensajeRow> {
  if (usandoMemoria) {
    const row: MensajeRow = {
      id: crypto.randomUUID(),
      ext_id: m.ext_id ?? null,
      dia: m.dia ?? null,
      texto: m.texto,
      origen: m.origen,
      created_at: ahora(),
    };
    mem.mensajes.push(row);
    return row;
  }
  const { data, error } = await supabase!
    .from("mensajes")
    .insert(m)
    .select()
    .single();
  if (error) throw new Error(`Supabase mensajes: ${error.message}`);
  return data as MensajeRow;
}

export async function insertTransacciones(
  mensajeId: string | null,
  filas: FilaExtraida[],
): Promise<Transaccion[]> {
  const rows = filas.map((f) => ({
    mensaje_id: mensajeId,
    tipo: f.tipo,
    producto: f.producto,
    cantidad: f.cantidad,
    monto: f.monto,
    cliente: f.cliente,
    requiere_confirmacion: f.requiere_confirmacion,
    resuelta: !f.requiere_confirmacion,
  }));
  if (usandoMemoria) {
    const out = rows.map((r) => ({
      ...r,
      id: crypto.randomUUID(),
      created_at: ahora(),
    })) as Transaccion[];
    mem.transacciones.push(...out);
    return out;
  }
  const { data, error } = await supabase!
    .from("transacciones")
    .insert(rows)
    .select();
  if (error) throw new Error(`Supabase transacciones: ${error.message}`);
  return data as Transaccion[];
}

export async function actualizarTransaccion(
  id: string,
  campos: { monto?: number | null; cantidad?: number | null },
): Promise<void> {
  const patch: Record<string, unknown> = { resuelta: true };
  if (campos.monto != null) patch.monto = campos.monto;
  if (campos.cantidad != null) patch.cantidad = campos.cantidad;
  if (usandoMemoria) {
    const t = mem.transacciones.find((x) => x.id === id);
    if (t) Object.assign(t, patch);
    return;
  }
  const { error } = await supabase!.from("transacciones").update(patch).eq("id", id);
  if (error) throw new Error(`Supabase update: ${error.message}`);
}

/** Transacciones que aún esperan un dato de la usuaria. */
export async function pendientes(): Promise<Transaccion[]> {
  const todas = await todasTransacciones();
  return todas.filter((t) => t.requiere_confirmacion && !t.resuelta);
}

export async function todasTransacciones(): Promise<Transaccion[]> {
  if (usandoMemoria) return [...mem.transacciones];
  const { data, error } = await supabase!
    .from("transacciones")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Supabase select: ${error.message}`);
  return (data ?? []) as Transaccion[];
}

export async function ultimosMensajes(n: number): Promise<MensajeRow[]> {
  if (usandoMemoria) return mem.mensajes.slice(-n);
  const { data, error } = await supabase!
    .from("mensajes")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(n);
  if (error) throw new Error(`Supabase mensajes: ${error.message}`);
  return ((data ?? []) as MensajeRow[]).reverse();
}

/** Fiados dados y cobros recibidos (para el contexto del agente). */
export async function fiadosYCobros(): Promise<{
  fiados: Transaccion[];
  cobros: Transaccion[];
}> {
  const todas = await todasTransacciones();
  return {
    fiados: todas.filter((t) => t.tipo === "fiado"),
    cobros: todas.filter((t) => t.tipo === "cobro_fiado"),
  };
}

export async function resetTodo(): Promise<void> {
  if (usandoMemoria) {
    mem.mensajes = [];
    mem.transacciones = [];
    return;
  }
  const { error: e1 } = await supabase!
    .from("transacciones")
    .delete()
    .not("id", "is", null);
  const { error: e2 } = await supabase!
    .from("mensajes")
    .delete()
    .not("id", "is", null);
  if (e1 || e2) throw new Error(`Supabase reset: ${e1?.message ?? e2?.message}`);
}
