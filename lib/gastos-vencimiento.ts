// Cálculo del vencimiento y estado "vencido" de un gasto — COMPUTADO (no se guarda en la base),
// así siempre está exacto sin tener que marcar nada a mano.

export interface GastoVencInput {
  estado?: string | null
  mes?: string | null
  fecha?: string | null
  fecha_pago?: string | null
  recurrente_id?: string | null
}

export interface RecurrenteVenc {
  dia_vencimiento?: number | null
  tipo_mes?: string | null // 'CORRIENTE' (vence en el mes) | 'VENCIDO' (vence el mes siguiente)
}

// Fecha de vencimiento de un recurrente para un mes dado (misma lógica que
// calcularFechaPagoRecurrente en app/actions/finanzas.ts).
export function fechaVencimientoRecurrente(mes: string, diaVenc?: number | null, tipoMes?: string | null): string {
  const dia = Math.max(1, Math.min(31, Number(diaVenc) || 15))
  const [y, m] = mes.split('-').map(Number)
  const offset = tipoMes === 'VENCIDO' ? 1 : 0
  const refY = m + offset > 12 ? y + 1 : y
  const refM = ((m - 1 + offset) % 12) + 1
  const ultimoDia = new Date(refY, refM, 0).getDate()
  const diaFinal = Math.min(dia, ultimoDia)
  return `${refY}-${String(refM).padStart(2, '0')}-${String(diaFinal).padStart(2, '0')}`
}

// Vencimiento real del gasto: del recurrente (día + tipo_mes) si existe; si no, fecha_pago; si no, fecha.
export function vencimientoGasto(g: GastoVencInput, rec?: RecurrenteVenc | null): string | null {
  if (rec && g.mes) return fechaVencimientoRecurrente(g.mes, rec.dia_vencimiento, rec.tipo_mes)
  if (g.fecha_pago) return g.fecha_pago
  if (g.fecha) return g.fecha
  return null
}

// ¿Está vencido? = impago (ni PAGADO ni DEVENGADO) y su vencimiento ya pasó (< hoy, formato YYYY-MM-DD).
export function estaVencido(g: GastoVencInput, rec: RecurrenteVenc | null | undefined, hoy: string): boolean {
  if (g.estado === 'PAGADO' || g.estado === 'DEVENGADO') return false
  const v = vencimientoGasto(g, rec)
  return !!v && v < hoy
}
