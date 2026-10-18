export type TipoTransaccion = "venta" | "gasto" | "fiado" | "cobro_fiado";

export const TIPOS: TipoTransaccion[] = ["venta", "gasto", "fiado", "cobro_fiado"];

export interface MensajeRow {
  id: string;
  ext_id: string | null;
  dia: string | null;
  texto: string;
  origen: "texto" | "audio" | "csv";
  created_at: string;
}

export interface Transaccion {
  id: string;
  mensaje_id: string | null;
  tipo: TipoTransaccion;
  producto: string;
  cantidad: number;
  monto: number | null;
  cliente: string | null;
  requiere_confirmacion: boolean;
  /** false mientras esperamos que la usuaria confirme el dato que falta */
  resuelta: boolean;
  created_at: string;
}

/** Fila extraída por el LLM, todavía sin persistir. */
export interface FilaExtraida {
  tipo: TipoTransaccion;
  producto: string;
  cantidad: number;
  monto: number | null;
  cliente: string | null;
  requiere_confirmacion: boolean;
}

/** Corrección de una transacción pendiente, devuelta por el LLM. */
export interface Actualizacion {
  id: string;
  monto: number | null;
  cantidad: number | null;
}

/** Contexto que se le pasa al LLM antes de procesar un mensaje. */
export interface ContextoAgente {
  /** Transacciones a la espera de un dato (tienen id para poder actualizarlas). */
  pendientes: Pick<
    Transaccion,
    "id" | "tipo" | "producto" | "cantidad" | "monto" | "cliente"
  >[];
  /** Fiados registrados (para reconocer cobros de fiado). */
  fiados: Pick<
    Transaccion,
    "id" | "tipo" | "producto" | "cantidad" | "monto" | "cliente"
  >[];
  /** Cobros de fiado ya registrados. */
  cobros: Pick<Transaccion, "tipo" | "producto" | "cantidad" | "monto" | "cliente">[];
  /** Últimos mensajes (texto), para dar contexto conversacional. */
  historial: string[];
  resumen: Resumen;
}

export interface Resumen {
  ventas: number;
  gastos: number;
  cobros: number;
  fiados_total: number;
  por_cobrar: number;
  flujo_semanal: number;
  /** Proyección del flujo semanal a un mes (× 52/12). */
  flujo_mensual: number;
  /** Cuota mensual sostenible estimada. */
  cuota_mensual: number;
  n_transacciones: number;
}
