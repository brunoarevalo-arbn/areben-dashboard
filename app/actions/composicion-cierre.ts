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

  // 4) Provisión de aguinaldo — arranque + Σ (aguinaldo_provisionado − aguinaldo_pagado_de_caja)
  //    de nomina_mensual (desde mes_inicial = 2026-06 → cuenta desde 2026-07).
  const provAguinaldoCuentas = cuentasPatrim.filter((c) => c.tipo === 'PROVISION' && /aguinaldo/i.test(c.nombre))
  if (provAguinaldoCuentas.length) {
    const { data: noms } = await supabase
      .from('nomina_mensual')
      .select('mes, aguinaldo_provisionado, aguinaldo_pagado_de_caja')
      .lte('mes', mes)
    for (const c of provAguinaldoCuentas) {
      const arranque = Number(c.saldo_inicial ?? 0)
      const mesIni = c.mes_inicial ?? ''
      let acum = 0, mov = 0
      for (const n of noms ?? []) {
        if (mesIni && n.mes <= mesIni) continue
        const prov = Number(n.aguinaldo_provisionado ?? 0) - Number(n.aguinaldo_pagado_de_caja ?? 0)
        acum += prov
        if (n.mes === mes) mov += prov
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

/** Activo fijo / inversiones: por cada cuenta INVERSION → arranque + gastos categoría "Inversiones" del mes. */
export async function composicionActivoFijo(mes: string): Promise<SeccionComposicion[]> {
  await requireUser()
  const supabase = await createClient()
  const { data: cuentas } = await supabase
    .from('cuentas_patrimoniales').select('*').eq('tipo', 'INVERSION').eq('activo', true).order('nombre')
  if (!cuentas?.length) return []
  const { data: gastos } = await supabase
    .from('gastos').select('mes, fecha, concepto, monto').eq('categoria', 'Inversiones').lte('mes', mes).order('fecha')
  return cuentas.map((c) => {
    const arranque = Number(c.saldo_inicial ?? 0)
    const mesIni = c.mes_inicial ?? ''
    let acum = 0
    const movimientos: MovimientoComposicion[] = []
    for (const g of gastos ?? []) {
      if (mesIni && g.mes <= mesIni) continue
      const m = Number(g.monto)
      acum += m
      if (g.mes === mes) movimientos.push({ fecha: g.fecha, concepto: g.concepto || 'Inversión', monto: m })
    }
    const saldoCierre = r2(arranque + acum)
    const mov = movimientos.reduce((a, x) => a + x.monto, 0)
    return { titulo: c.nombre, moneda: c.moneda === 'USD' ? 'USD' : 'ARS', saldoInicio: r2(saldoCierre - mov), saldoCierre, movimientos }
  })
}

/** Cuentas particulares: por cada cuenta con socio_id → arranque + retiros dolarizados del socio del mes. */
export async function composicionCuentasParticulares(mes: string): Promise<SeccionComposicion[]> {
  await requireUser()
  const supabase = await createClient()
  const { data: cuentas } = await supabase
    .from('cuentas_patrimoniales').select('*').not('socio_id', 'is', null).eq('activo', true).order('nombre')
  if (!cuentas?.length) return []
  const { data: retiros } = await supabase
    .from('retiros_socios')
    .select('socio_id, mes, fecha, monto_usd, monto_usd_calculado, convertido_at, categoria:categorias_retiro(nombre)')
    .in('socio_id', cuentas.map((c) => c.socio_id as string))
    .lte('mes', mes)
    .order('fecha')
  return cuentas.map((c) => {
    const arranque = Number(c.saldo_inicial ?? 0)
    const mesIni = c.mes_inicial ?? ''
    let acum = 0
    const movimientos: MovimientoComposicion[] = []
    for (const r of retiros ?? []) {
      if (r.socio_id !== c.socio_id) continue
      if (mesIni && r.mes <= mesIni) continue
      const usd = valorRetiroUsd(r)
      acum += usd
      if (r.mes === mes) {
        const cat = Array.isArray(r.categoria) ? r.categoria[0]?.nombre : (r.categoria as { nombre?: string } | null)?.nombre
        movimientos.push({ fecha: r.fecha, concepto: cat || 'Retiro', monto: usd })
      }
    }
    const saldoCierre = r2(arranque + acum)
    const mov = movimientos.reduce((a, x) => a + x.monto, 0)
    return { titulo: c.nombre, moneda: 'USD' as const, saldoInicio: r2(saldoCierre - mov), saldoCierre, movimientos }
  })
}

/** Otros activos manuales (OTRO_ACTIVO sin socio): saldo inicio + ajuste manual del mes → saldo cierre. */
export async function composicionOtrosActivos(mes: string): Promise<SeccionComposicion[]> {
  await requireUser()
  const supabase = await createClient()
  const { data: cuentas } = await supabase
    .from('cuentas_patrimoniales').select('*').eq('tipo', 'OTRO_ACTIVO').is('socio_id', null).eq('activo', true).order('nombre')
  if (!cuentas?.length) return []
  const { data: saldos } = await supabase
    .from('saldos_cuentas_patrim').select('cuenta_id, saldo_inicio, movimiento, saldo_cierre').eq('mes', mes)
  const smap = new Map((saldos ?? []).map((s) => [s.cuenta_id, s]))
  return cuentas.map((c) => {
    const s = smap.get(c.id)
    const saldoInicio = Number(s?.saldo_inicio ?? 0)
    const movimiento = Number(s?.movimiento ?? 0)
    const saldoCierre = s ? Number(s.saldo_cierre) : r2(saldoInicio + movimiento)
    const movimientos: MovimientoComposicion[] = Math.abs(movimiento) > 0.01
      ? [{ fecha: `${mes}-01`, concepto: 'Ajuste manual del mes', monto: movimiento }] : []
    return { titulo: c.nombre, moneda: c.moneda === 'USD' ? 'USD' : 'ARS', saldoInicio, saldoCierre, movimientos }
  })
}
