// Estado COMPUTADO de un gasto (no se guarda en la base, se deriva siempre exacto —
// igual que "Vencido"). Unifica el criterio para la lista de gastos y Pendientes.
//
// Prioridad:
//  1. Pagado           — saldo ≈ 0 (todo debitado) o estado='PAGADO'.
//  2. Devengado        — estado='DEVENGADO' (provisión, no exigible).
//  3. Cuenta corriente — esCuentaCorriente (deuda sin fecha fija).
//  4. Pago programado  — saldo>0 cubierto por pago(s) agendados a futuro, ninguno atrasado.
//  5. Vencido          — impago y exigible: sin plan y venció, o una cuota programada pasó sin debitarse.
//  6. Pendiente        — impago, sin plan, todavía no vence.
// Tag secundario "Parcial": ya hay algo debitado pero queda saldo.

import { vencimientoGasto, type GastoVencInput, type RecurrenteVenc } from '@/lib/gastos-vencimiento'
import { esCuentaCorriente } from '@/lib/cuentas-corrientes'

export type EstadoGasto =
  | 'PAGADO'
  | 'DEVENGADO'
  | 'CUENTA_CORRIENTE'
  | 'PAGO_PROGRAMADO'
  | 'VENCIDO'
  | 'PENDIENTE'

export interface PagoAgg {
  monto: number | string
  debitado: boolean | null
  fecha_vencimiento: string | null
}

export interface GastoEstadoInput extends GastoVencInput {
  concepto: string
  monto: number | string
  recurrenteConcepto?: string | null
}

// `hoy` en formato YYYY-MM-DD. `rec` = recurrente (día/tipo_mes) para su vencimiento propio.
export function estadoGasto(
  g: GastoEstadoInput,
  pagos: PagoAgg[],
  rec: RecurrenteVenc | null | undefined,
  hoy: string,
): { estado: EstadoGasto; parcial: boolean } {
  const monto = Number(g.monto) || 0
  const sumDebitado = pagos.reduce((s, p) => s + (p.debitado ? Number(p.monto) || 0 : 0), 0)
  const saldo = monto - sumDebitado
  const parcial = sumDebitado > 0.01 && saldo > 0.01

  // 1. Pagado
  if (g.estado === 'PAGADO' || saldo <= 0.01) return { estado: 'PAGADO', parcial: false }
  // 2. Devengado
  if (g.estado === 'DEVENGADO') return { estado: 'DEVENGADO', parcial }
  // 3. Cuenta corriente
  if (esCuentaCorriente({ concepto: g.concepto, recurrente_id: g.recurrente_id, recurrenteConcepto: g.recurrenteConcepto })) {
    return { estado: 'CUENTA_CORRIENTE', parcial }
  }

  // Pagos agendados a futuro (no debitados, con fecha de vencimiento)
  const programados = pagos.filter((p) => !p.debitado && p.fecha_vencimiento)
  if (programados.length > 0) {
    // 5. Vencido si alguna cuota programada ya pasó su fecha sin debitarse
    const hayAtrasada = programados.some((p) => (p.fecha_vencimiento as string) < hoy)
    return { estado: hayAtrasada ? 'VENCIDO' : 'PAGO_PROGRAMADO', parcial }
  }

  // Sin plan: usar el vencimiento propio del gasto
  const venc = vencimientoGasto(g, rec)
  if (venc && venc < hoy) return { estado: 'VENCIDO', parcial }
  return { estado: 'PENDIENTE', parcial }
}
