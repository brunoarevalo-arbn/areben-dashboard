'use server'

import { createClient, requireUser } from '@/lib/supabase/server'
import { calcularReposicion } from '@/app/actions/finanzas'
import { valorRetiroUsd } from '@/lib/retiros'
import type { CuentaPatrimonial, SaldoCuentaPatrim } from '@/types/database'

const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * Sintetiza en vivo el saldo de las cuentas patrimoniales que NO se cargan a mano:
 *  - INVENTARIO (posición de mercadería) ← calcularReposicion (arranque + compras − CMV)
 *  - Cuentas particulares de socios (socio_id) ← arranque + Σ retiros dolarizados
 *  - "Inversiones y activo fijo" (tipo INVERSION) ← arranque + Σ gastos categoría "Inversiones"
 * Devuelve los saldos ya sobreescritos (para el cierre Y la página de Patrimonio) + el detalle de INVENTARIO.
 * Las cuentas manuales quedan con su saldo crudo.
 */
export async function sintetizarSaldosPatrim(
  cuentasPatrim: CuentaPatrimonial[],
  saldosPatrim: SaldoCuentaPatrim[],
  mes: string,
): Promise<{
  saldosPatrimFinal: SaldoCuentaPatrim[]
  movimientoInv: Record<string, { saldoInicial: number; compras: number; cmv: number }>
}> {
  await requireUser()
  const supabase = await createClient()
  const byId = new Map(saldosPatrim.map((s) => [s.cuenta_id, { ...s }]))
  const upsert = (cuentaId: string, saldoInicio: number, movimiento: number, saldoCierre: number) => {
    const row = byId.get(cuentaId)
    if (row) { row.saldo_cierre = saldoCierre; row.saldo_inicio = saldoInicio; row.movimiento = movimiento }
    else byId.set(cuentaId, { cuenta_id: cuentaId, mes, saldo_inicio: saldoInicio, movimiento, saldo_cierre: saldoCierre } as SaldoCuentaPatrim)
  }

  const movimientoInv: Record<string, { saldoInicial: number; compras: number; cmv: number }> = {}

  // 1) INVENTARIO — posición de mercadería (BDI → repoBDI; ZATTIA → repoZS; STUNNED consolidado → 0)
  const invCuentas = cuentasPatrim.filter((c) => c.tipo === 'INVENTARIO')
  if (invCuentas.length) {
    const [repoBDI, repoZS] = await Promise.all([
      calcularReposicion('BDI', mes),
      calcularReposicion('ZATTIA_STUNNED', mes),
    ])
    const cero = { arranque: 0, comprasNetas: 0, cmv: 0, saldo: 0, detalle: [] as { mes: string; cmv: number; comprasNetas: number }[] }
    const repoPorMarca = (marca: string | null) => (marca === 'BDI' ? repoBDI : marca === 'ZATTIA' ? repoZS : cero)
    for (const c of invCuentas) {
      const rep = repoPorMarca(c.marca ?? null)
      const mm = rep.detalle.find((d) => d.mes === mes)
      const comprasMes = mm?.comprasNetas ?? 0
      const cmvMes = mm?.cmv ?? 0
      const saldoInicial = r2(rep.saldo - (comprasMes - cmvMes))
      movimientoInv[c.id] = { saldoInicial, compras: comprasMes, cmv: cmvMes }
      upsert(c.id, saldoInicial, comprasMes - cmvMes, rep.saldo)
    }
  }

  // 2) Cuentas particulares de socios — arranque + Σ retiros dolarizados
  const socioCuentas = cuentasPatrim.filter((c) => c.socio_id)
  if (socioCuentas.length) {
    const socioIds = socioCuentas.map((c) => c.socio_id as string)
    const { data: retirosSocios } = await supabase
      .from('retiros_socios')
      .select('socio_id, mes, monto_usd, monto_usd_calculado, convertido_at')
      .in('socio_id', socioIds)
      .lte('mes', mes)
    for (const c of socioCuentas) {
      const arranque = Number(c.saldo_inicial ?? 0)
      const mesIni = c.mes_inicial ?? ''
      let acum = 0, mov = 0
      for (const rr of retirosSocios ?? []) {
        if (rr.socio_id !== c.socio_id) continue
        if (mesIni && rr.mes <= mesIni) continue
        const usd = valorRetiroUsd(rr)
        acum += usd
        if (rr.mes === mes) mov += usd
      }
      const saldoCierre = r2(arranque + acum)
      upsert(c.id, r2(saldoCierre - mov), mov, saldoCierre)
    }
  }

  // 3) Inversiones / activo fijo — arranque + Σ gastos categoría "Inversiones"
  const invFijoCuentas = cuentasPatrim.filter((c) => c.tipo === 'INVERSION')
  if (invFijoCuentas.length) {
    const { data: gastosInv } = await supabase
      .from('gastos')
      .select('mes, monto')
      .eq('categoria', 'Inversiones')
      .lte('mes', mes)
    for (const c of invFijoCuentas) {
      const arranque = Number(c.saldo_inicial ?? 0)
      const mesIni = c.mes_inicial ?? ''
      let acum = 0, mov = 0
      for (const g of gastosInv ?? []) {
        if (mesIni && g.mes <= mesIni) continue
        const m = Number(g.monto)
        acum += m
        if (g.mes === mes) mov += m
      }
      const saldoCierre = r2(arranque + acum)
      upsert(c.id, r2(saldoCierre - mov), mov, saldoCierre)
    }
  }

  return { saldosPatrimFinal: [...byId.values()], movimientoInv }
}
