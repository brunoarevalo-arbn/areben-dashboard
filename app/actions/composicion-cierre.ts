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

export interface MovimientoComposicion {
  fecha: string
  concepto: string
  monto: number
}
export interface SeccionComposicion {
  titulo: string
  moneda: 'ARS' | 'USD'
  saldoInicio: number
  saldoCierre: number
  movimientos: MovimientoComposicion[]
}

/**
 * Composición de la posición de mercadería del mes, por grupo (BDI y ZATTIA+STUNNED):
 * saldo inicio (cierre del mes anterior) + compras del mes (suben el inventario) − CMV de GN (lo baja)
 * = saldo cierre. Reusa calcularReposicion para los totales y lista las compras individuales.
 */
export async function composicionPosicionMercaderia(mes: string): Promise<SeccionComposicion[]> {
  await requireUser()
  const supabase = await createClient()
  const GRUPOS = [
    { key: 'BDI' as const, titulo: 'BDI', marcas: ['BDI'] },
    { key: 'ZATTIA_STUNNED' as const, titulo: 'ZATTIA + STUNNED', marcas: ['ZATTIA', 'STUNNED'] },
  ]
  const [y, m] = mes.split('-').map(Number)
  const desde = `${mes}-01`
  const hasta = new Date(y, m, 0).toISOString().split('T')[0]

  const secciones: SeccionComposicion[] = []
  for (const g of GRUPOS) {
    const rep = await calcularReposicion(g.key, mes)
    const mm = rep.detalle.find((d) => d.mes === mes)
    const comprasNetas = mm?.comprasNetas ?? 0
    const cmvMes = mm?.cmv ?? 0
    const saldoCierre = rep.saldo
    const saldoInicio = r2(saldoCierre - (comprasNetas - cmvMes))

    const { data: compras } = await supabase
      .from('compras')
      .select('fecha, descripcion, monto_total, iva, proveedor:proveedores(nombre)')
      .in('negocio', g.marcas)
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .order('fecha')
    const movimientos: MovimientoComposicion[] = (compras ?? []).map((c) => {
      const prov = Array.isArray(c.proveedor) ? c.proveedor[0]?.nombre : (c.proveedor as { nombre?: string } | null)?.nombre
      return {
        fecha: c.fecha,
        concepto: [c.descripcion, prov].filter(Boolean).join(' · ') || 'Compra',
        monto: r2(Number(c.monto_total) - Number(c.iva)), // +neto: sube el inventario
      }
    })
    // Si comprasNetas > Σ compras de la marca, la diferencia es producción pasada a stock este mes.
    const prodPasada = r2(comprasNetas - movimientos.reduce((a, x) => a + x.monto, 0))
    if (Math.abs(prodPasada) > 0.01) movimientos.push({ fecha: hasta, concepto: 'Producción pasada a stock', monto: prodPasada })
    if (Math.abs(cmvMes) > 0.01) movimientos.push({ fecha: hasta, concepto: 'CMV — costo de ventas (Gestión Nube)', monto: r2(-cmvMes) })

    secciones.push({ titulo: g.titulo, moneda: 'ARS', saldoInicio, saldoCierre, movimientos })
  }
  return secciones
}
