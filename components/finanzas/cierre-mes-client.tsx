'use client'

import { useState, useMemo, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  upsertCierreMes, confirmarCierreMes, reabrirCierreMes,
} from '@/app/actions/finanzas'
import type {
  CuentaBancaria, CuentaTitular, RetiroSocio, CategoriaRetiro,
  CierreMensual, PasivoManual, ActivoManual,
  CuentaPatrimonial, SaldoCuentaPatrim, TipoCuentaPatrim,
} from '@/types/database'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { MoneyInput } from '@/components/ui/money-input'
import { formatCurrency, formatMonth, formatDate, getMonthOptions } from '@/lib/utils'
import { valorRetiroArs, valorRetiroUsd } from '@/lib/retiros'
import { vencimientoGasto, estaVencido } from '@/lib/gastos-vencimiento'
import {
  Lock, Unlock, Loader2, Save, Plus, Trash2, Wallet, Banknote, Receipt,
  CreditCard, AlertCircle, TrendingUp, TrendingDown, Building2,
  ArrowDownCircle, FileText, DollarSign, ChevronDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ComprasPendiente {
  id: string
  descripcion: string
  fecha: string
  monto_total: number
  saldo_pendiente: number
  moneda: string
  proveedor?: { nombre: string } | null
}

interface ProduccionItem {
  id: string
  descripcion: string
  monto_total: number
  iva: number
  moneda: string
  categoria_produccion?: string | null
  proveedor?: { nombre: string } | null
}

// Costo neto de IVA = bruto − IVA (la parte no facturada queda entera, sin restarle IVA)
const costoNetoProd = (p: { monto_total: number; iva: number }) => Number(p.monto_total) - Number(p.iva)

interface GastoPendiente {
  id: string
  concepto: string
  categoria: string
  monto: number
  monto_neto: number
  moneda: string
  fecha_pago?: string | null
  fecha?: string | null
  mes: string
  medio_pago?: string | null
  tarjeta_id?: string | null
  recurrente_id?: string | null
  estado?: string | null
}

interface CuotaPend {
  id: string
  concepto: string
  monto_cuota: number
  mes_vencimiento: string
  origen_tipo?: string
  origen_id?: string | null
  tarjeta?: { nombre: string; banco: string } | null
}

interface ChequePend {
  id: string
  monto: number
  moneda: string
  fecha_emision: string
  fecha_vencimiento?: string | null
  instrumento: string
  numero_cheque?: string | null
  banco_emisor?: string | null
  compra?: { descripcion: string; proveedor?: { nombre: string } | null } | null
}

interface PagoCtaCtePend {
  id: string
  monto: number
  moneda: string
  fecha_emision: string
  fecha_vencimiento?: string | null
  instrumento: string
  compra?: { descripcion: string; proveedor?: { nombre: string } | null } | null
}

interface InstrumentoActivo {
  id: string
  codigo?: string | null
  moneda: 'USD' | 'ARS'
  capital_inicial: number
  inversor?: { nombre: string } | null
}

interface Props {
  mes: string
  validaciones?: { nivel: 'error' | 'warning' | 'info'; mensaje: string }[]
  mesAnterior: string
  cierreActual: CierreMensual | null
  cierreAnterior: CierreMensual | null
  titulares: CuentaTitular[]
  cuentas: (CuentaBancaria & { titular?: { nombre: string } | null })[]
  saldosMes: { cuenta_id: string; saldo_ars: number; saldo_usd: number }[]
  tcMesGlobal: number | null
  comprasPendientes: ComprasPendiente[]
  produccionEnProceso: ProduccionItem[]
  gastosPendientes: GastoPendiente[]
  gastosRecurrentes?: { id: string; dia_vencimiento?: number | null; tipo_mes?: string | null }[]
  hoy?: string
  cuotasPendientes: CuotaPend[]
  retirosMes: (RetiroSocio & { categoria?: CategoriaRetiro | null })[]
  categorias: CategoriaRetiro[]
  activosManuales: ActivoManual[]
  cuentasPatrim: CuentaPatrimonial[]
  saldosPatrim: SaldoCuentaPatrim[]
  movimientoInv?: Record<string, { saldoInicial: number; compras: number; cmv: number }>
  chequesPendientes: ChequePend[]
  pagosCtaCtePendientes: PagoCtaCtePend[]
  instrumentosActivos: InstrumentoActivo[]
  saldosInversiones: { instrumento_id: string; saldo_cierre: number }[]
  ccActivosArs?: number
  ccActivosUsd?: number
  ccPasivosArs?: number
  ccPasivosUsd?: number
  ccDetalle?: { nombre: string; naturaleza: string; moneda: string; monto: number; esActivo: boolean }[]
  prestamosBancarios?: { nombre: string; acreedor: string; moneda: string; capital: number }[]
  planesAfip?: { nombre: string; capital: number }[]
  resultadosAcumuladosPrevios?: number
  cierresCerrados?: { mes: string; resultado_ars: number }[]
}

export function CierreMesClient(props: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const cerrado = props.cierreActual?.cerrado ?? false
  const [isPending, startTransition] = useTransition()

  // Estado editable (si no está cerrado)
  const [tipoCambio, setTipoCambio] = useState<number>(
    props.cierreActual?.tipo_cambio ?? props.tcMesGlobal ?? 1000,
  )
  const [cajaArs, setCajaArs] = useState<number>(props.cierreActual?.caja_ars ?? 0)
  const [cajaUsd, setCajaUsd] = useState<number>(props.cierreActual?.caja_usd ?? 0)
  const [pasivosManuales, setPasivosManuales] = useState<PasivoManual[]>(
    (props.cierreActual?.pasivos_manuales as PasivoManual[]) ?? [],
  )
  const [notas, setNotas] = useState<string>(props.cierreActual?.notas ?? '')

  // Saldos de cuentas (mapa por cuenta_id)
  const saldosMap = useMemo(() => {
    const m = new Map<string, { ars: number; usd: number }>()
    for (const s of props.saldosMes) m.set(s.cuenta_id, { ars: Number(s.saldo_ars), usd: Number(s.saldo_usd) })
    return m
  }, [props.saldosMes])

  // ─── ACTIVOS ────────────────────────────────────────────────────────
  const cuentasPorTitular = useMemo(() => {
    const map = new Map<string, typeof props.cuentas>()
    for (const c of props.cuentas) {
      const k = c.titular_id
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(c)
    }
    return map
  }, [props.cuentas])

  const totalCuentasArs = useMemo(() => {
    return props.cuentas.reduce((s, c) => s + (saldosMap.get(c.id)?.ars ?? 0), 0)
  }, [props.cuentas, saldosMap])
  const totalCuentasUsd = useMemo(() => {
    return props.cuentas.reduce((s, c) => s + (saldosMap.get(c.id)?.usd ?? 0), 0)
  }, [props.cuentas, saldosMap])

  const totalActivosManualesArs = props.activosManuales
    .filter((a) => a.moneda === 'ARS')
    .reduce((s, a) => s + Number(a.monto), 0)
  const totalActivosManualesUsd = props.activosManuales
    .filter((a) => a.moneda === 'USD')
    .reduce((s, a) => s + Number(a.monto), 0)

  // Cuentas patrimoniales: separar aporte positivo (activo) y negativo (pasivo) según signo_pn
  const saldosPatrimMap = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of props.saldosPatrim) m.set(s.cuenta_id, Number(s.saldo_cierre))
    return m
  }, [props.saldosPatrim])

  const patrimAportes = useMemo(() => {
    let activosArs = 0, activosUsd = 0, pasivosArs = 0, pasivosUsd = 0
    const porTipo = new Map<TipoCuentaPatrim, { ars: number; usd: number }>()
    for (const c of props.cuentasPatrim) {
      const saldo = saldosPatrimMap.get(c.id) ?? 0
      if (saldo === 0) continue
      // INVENTARIO usa signo dinámico (el propio saldo); otros usan signo_pn fijo
      const aporte = c.tipo === 'INVENTARIO' ? saldo : c.signo_pn * saldo
      if (c.moneda === 'USD') {
        if (aporte >= 0) activosUsd += aporte
        else pasivosUsd += Math.abs(aporte)
      } else {
        if (aporte >= 0) activosArs += aporte
        else pasivosArs += Math.abs(aporte)
      }
      if (!porTipo.has(c.tipo)) porTipo.set(c.tipo, { ars: 0, usd: 0 })
      const t = porTipo.get(c.tipo)!
      if (c.moneda === 'USD') t.usd += aporte
      else t.ars += aporte
    }
    return { activosArs, activosUsd, pasivosArs, pasivosUsd, porTipo }
  }, [props.cuentasPatrim, saldosPatrimMap])

  // Producción en proceso (activo): se valúa al NETO (sin IVA — el IVA es crédito fiscal,
  // vive en impositivos). La deuda/pago va por el bruto (compra o cheque).
  const produccionArs = props.produccionEnProceso
    .filter((p) => p.moneda !== 'USD')
    .reduce((s, p) => s + costoNetoProd(p), 0)
  const produccionUsd = props.produccionEnProceso
    .filter((p) => p.moneda === 'USD')
    .reduce((s, p) => s + costoNetoProd(p), 0)

  const totalActivosArs = totalCuentasArs + cajaArs + totalActivosManualesArs + patrimAportes.activosArs + produccionArs + (props.ccActivosArs ?? 0)
  const totalActivosUsd = totalCuentasUsd + cajaUsd + totalActivosManualesUsd + patrimAportes.activosUsd + produccionUsd + (props.ccActivosUsd ?? 0)

  // ─── PASIVOS ────────────────────────────────────────────────────────
  // Anti-duplicación: gastos pagados con tarjeta + cuotas → mostrar solo cuotas
  const gastosConCuotasIds = new Set(
    props.cuotasPendientes
      .filter((c) => c.origen_tipo === 'GASTO' && c.origen_id)
      .map((c) => c.origen_id as string)
  )
  const gastosNetos = props.gastosPendientes.filter((g) => !gastosConCuotasIds.has(g.id))

  // Mapa de recurrentes (para vencimiento) y fecha de hoy (para saber qué está vencido)
  const recurrentesMap = useMemo(
    () => new Map((props.gastosRecurrentes ?? []).map((r) => [r.id, r])),
    [props.gastosRecurrentes],
  )
  const hoyStr = props.hoy ?? new Date().toISOString().slice(0, 10)

  const pasivosCompras = props.comprasPendientes.reduce((s, c) =>
    s + (c.moneda !== 'USD' ? Number(c.saldo_pendiente) : 0), 0)
  const pasivosComprasUsd = props.comprasPendientes.reduce((s, c) =>
    s + (c.moneda === 'USD' ? Number(c.saldo_pendiente) : 0), 0)

  const pasivosGastos = gastosNetos.reduce((s, g) =>
    s + (g.moneda !== 'USD' ? Number(g.monto) : 0), 0)
  const pasivosGastosUsd = gastosNetos.reduce((s, g) =>
    s + (g.moneda === 'USD' ? Number(g.monto) : 0), 0)

  const pasivosCuotas = props.cuotasPendientes.reduce((s, c) => s + Number(c.monto_cuota), 0)

  const pasivosCheques = props.chequesPendientes
    .filter((c) => c.moneda !== 'USD')
    .reduce((s, c) => s + Number(c.monto), 0)
  const pasivosChequesUsd = props.chequesPendientes
    .filter((c) => c.moneda === 'USD')
    .reduce((s, c) => s + Number(c.monto), 0)

  const pasivosCtaCte = props.pagosCtaCtePendientes
    .filter((p) => p.moneda !== 'USD')
    .reduce((s, p) => s + Number(p.monto), 0)
  const pasivosCtaCteUsd = props.pagosCtaCtePendientes
    .filter((p) => p.moneda === 'USD')
    .reduce((s, p) => s + Number(p.monto), 0)

  // Inversiones: saldo del cierre del mes por instrumento (deuda con inversores)
  const saldosInvMap = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of props.saldosInversiones) m.set(s.instrumento_id, Number(s.saldo_cierre))
    return m
  }, [props.saldosInversiones])

  // El saldo_cierre de cada periodo YA incluye el interés devengado acumulado (el motor
  // de inversiones lo acumula mes a mes, capitalice o no) → es la deuda real al corte.
  const inversionesConSaldo = props.instrumentosActivos.map((i) => ({
    ...i,
    saldoCierre: saldosInvMap.get(i.id) ?? Number(i.capital_inicial),
  }))

  const pasivosInversionesArs = inversionesConSaldo
    .filter((i) => i.moneda !== 'USD')
    .reduce((s, i) => s + i.saldoCierre, 0)
  const pasivosInversionesUsd = inversionesConSaldo
    .filter((i) => i.moneda === 'USD')
    .reduce((s, i) => s + i.saldoCierre, 0)

  const pasivosManArs = pasivosManuales.filter((p) => p.moneda !== 'USD').reduce((s, p) => s + Number(p.monto), 0)
  const pasivosManUsd = pasivosManuales.filter((p) => p.moneda === 'USD').reduce((s, p) => s + Number(p.monto), 0)

  // Préstamos bancarios y planes AFIP: capital pendiente al corte (pasivo)
  const pasivosPrestamosArs = (props.prestamosBancarios ?? []).filter((p) => p.moneda !== 'USD').reduce((s, p) => s + Number(p.capital), 0)
  const pasivosPrestamosUsd = (props.prestamosBancarios ?? []).filter((p) => p.moneda === 'USD').reduce((s, p) => s + Number(p.capital), 0)
  const pasivosAfip = (props.planesAfip ?? []).reduce((s, p) => s + Number(p.capital), 0)

  const totalPasivosArs = pasivosCompras + pasivosGastos + pasivosCuotas
    + pasivosCheques + pasivosCtaCte + pasivosInversionesArs
    + pasivosManArs + patrimAportes.pasivosArs + (props.ccPasivosArs ?? 0)
    + pasivosPrestamosArs + pasivosAfip
  const totalPasivosUsd = pasivosComprasUsd + pasivosGastosUsd
    + pasivosChequesUsd + pasivosCtaCteUsd + pasivosInversionesUsd
    + pasivosManUsd + patrimAportes.pasivosUsd + (props.ccPasivosUsd ?? 0)
    + pasivosPrestamosUsd

  // ─── PATRIMONIO NETO ────────────────────────────────────────────────
  // PN convertido a ARS usando TC: ARS + (USD * TC)
  const pnArs = (totalActivosArs + totalActivosUsd * tipoCambio) - (totalPasivosArs + totalPasivosUsd * tipoCambio)
  const pnUsd = totalActivosUsd - totalPasivosUsd

  const pnAnteriorArs = props.cierreAnterior?.pn_ars ?? 0

  // ─── RETIROS ────────────────────────────────────────────────────────
  const retirosPorSocio = useMemo(() => {
    const map = new Map<string, { ars: number; usd: number; porCategoria: Map<string, { cat: CategoriaRetiro | null; ars: number; usd: number }> }>()
    for (const r of props.retirosMes) {
      const socio = r.socio
      if (!map.has(socio)) map.set(socio, { ars: 0, usd: 0, porCategoria: new Map() })
      const entry = map.get(socio)!
      // Regla única: un retiro dolarizado vale por su USD (su ARS queda como origen histórico,
      // no se suma aparte); uno sin dolarizar vale por su ARS. Nunca los dos → evita doble conteo.
      entry.ars += valorRetiroArs(r)
      entry.usd += valorRetiroUsd(r)
      const catId = r.categoria?.id ?? 'sin'
      if (!entry.porCategoria.has(catId)) {
        entry.porCategoria.set(catId, { cat: r.categoria ?? null, ars: 0, usd: 0 })
      }
      const c = entry.porCategoria.get(catId)!
      c.ars += valorRetiroArs(r)
      c.usd += valorRetiroUsd(r)
    }
    return Array.from(map.entries())
  }, [props.retirosMes])

  const totalRetirosArs = props.retirosMes.reduce((s, r) => s + valorRetiroArs(r), 0)
  const totalRetirosUsd = props.retirosMes.reduce((s, r) => s + valorRetiroUsd(r), 0)

  // ─── RESULTADO ─────────────────────────────────────────────────────
  // Resultado = (PN actual − PN anterior) + Retiros del mes (en ARS)
  const variacionPN = pnArs - pnAnteriorArs
  const totalRetirosArsConvertido = totalRetirosArs + totalRetirosUsd * tipoCambio
  const resultado = variacionPN + totalRetirosArsConvertido

  function setMes(nuevo: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('mes', nuevo)
    router.push(`?${params.toString()}`)
  }

  function agregarPasivo() {
    setPasivosManuales((prev) => [
      ...prev,
      { id: crypto.randomUUID(), descripcion: '', monto: 0, moneda: 'ARS', acreedor: '', notas: '' },
    ])
  }

  function actualizarPasivo(id: string, patch: Partial<PasivoManual>) {
    setPasivosManuales((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  }

  function eliminarPasivo(id: string) {
    setPasivosManuales((prev) => prev.filter((p) => p.id !== id))
  }

  function guardarBorrador() {
    startTransition(async () => {
      try {
        await upsertCierreMes({
          mes: props.mes,
          tipo_cambio: tipoCambio,
          caja_ars: cajaArs,
          caja_usd: cajaUsd,
          pasivos_manuales: pasivosManuales,
          notas,
        })
        alert('Borrador guardado')
      } catch (e) {
        alert((e as Error).message)
      }
    })
  }

  function confirmar() {
    if (!confirm(`¿Confirmar cierre de ${formatMonth(props.mes)}? Una vez cerrado no se podrá editar.`)) return
    startTransition(async () => {
      try {
        const snapshotCuentas = props.cuentas.map((c) => ({
          cuenta_id: c.id,
          titular_nombre: c.titular?.nombre ?? '',
          banco: c.banco,
          nombre: c.nombre,
          tipo: c.tipo,
          saldo_ars: saldosMap.get(c.id)?.ars ?? 0,
          saldo_usd: saldosMap.get(c.id)?.usd ?? 0,
        }))
        await confirmarCierreMes({
          mes: props.mes,
          tipo_cambio: tipoCambio,
          caja_ars: cajaArs,
          caja_usd: cajaUsd,
          pasivos_manuales: pasivosManuales,
          snapshotCuentas,
          snapshotPasivos: {
            compras: props.comprasPendientes,
            gastos: gastosNetos,
            cuotas: props.cuotasPendientes,
            cheques: props.chequesPendientes,
            pagos_cta_cte: props.pagosCtaCtePendientes,
            inversiones: inversionesConSaldo,
          },
          snapshotRetiros: {
            por_socio: retirosPorSocio.map(([socio, data]) => ({
              socio,
              ars: data.ars,
              usd: data.usd,
              por_categoria: Array.from(data.porCategoria.entries()).map((entry) => {
                const catId = entry[0]
                const c = entry[1]
                return {
                  categoria_id: catId,
                  categoria_nombre: c.cat?.nombre ?? 'Sin categoría',
                  emoji: c.cat?.emoji ?? null,
                  ars: c.ars,
                  usd: c.usd,
                }
              }),
            })),
          },
          totales: {
            total_activos_ars: totalActivosArs,
            total_activos_usd: totalActivosUsd,
            total_pasivos_ars: totalPasivosArs,
            total_pasivos_usd: totalPasivosUsd,
            pn_ars: pnArs,
            pn_usd: pnUsd,
            total_retiros_ars: totalRetirosArs,
            total_retiros_usd: totalRetirosUsd,
            resultado_ars: resultado,
          },
          notas,
        })
        alert('Cierre confirmado')
      } catch (e) {
        alert((e as Error).message)
      }
    })
  }

  function reabrir() {
    if (!confirm('¿Reabrir el cierre? Podrás editarlo de nuevo.')) return
    startTransition(async () => {
      try {
        await reabrirCierreMes(props.mes)
      } catch (e) {
        alert((e as Error).message)
      }
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-fg flex items-center gap-2">
            <FileText className="w-6 h-6 text-primary" />
            Cierre de mes
          </h1>
          <p className="text-sm text-fg-muted mt-0.5">
            Arqueo patrimonial de {formatMonth(props.mes)}
            {cerrado && <Badge variant="success" className="ml-2">Cerrado</Badge>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select options={getMonthOptions(24)} value={props.mes} onChange={(e) => setMes(e.target.value)} className="w-44" />
          {!cerrado && (
            <>
              <Button variant="secondary" onClick={guardarBorrador} disabled={isPending} title="Guardar borrador (sin confirmar)">
                {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <Save className="w-3.5 h-3.5" />
                Guardar borrador
              </Button>
              <Button variant="success" onClick={confirmar} disabled={isPending} title="Confirmar cierre — los datos quedarán bloqueados">
                <Lock className="w-3.5 h-3.5" />
                Confirmar cierre
              </Button>
            </>
          )}
          {cerrado && (
            <Button variant="warning" onClick={reabrir} disabled={isPending} title="Reabrir cierre para edición">
              <Unlock className="w-3.5 h-3.5" />
              Reabrir
            </Button>
          )}
        </div>
      </div>

      {/* Panel de validación (semáforo) — avisa huecos/duplicados antes de confiar en el número */}
      {(props.validaciones ?? []).length > 0 && (
        <div className="bg-surface border border-amber-500/40 rounded-xl p-4 space-y-2">
          <h2 className="text-sm font-semibold text-amber-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            Revisar antes de confiar en el número ({(props.validaciones ?? []).length})
          </h2>
          <ul className="space-y-1.5">
            {(props.validaciones ?? []).map((v, i) => (
              <li key={i} className="flex items-start gap-2 text-xs">
                <span className={cn('mt-1 w-1.5 h-1.5 rounded-full shrink-0', v.nivel === 'error' ? 'bg-rose-500' : v.nivel === 'warning' ? 'bg-amber-500' : 'bg-sky-500')} />
                <span className={cn(v.nivel === 'error' ? 'text-rose-700 font-medium' : 'text-fg-muted')}>{v.mensaje}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Resumen del cierre — los números clave arriba de todo */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-900/40 border border-orange-500/30 rounded-xl p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <p className="text-[10px] uppercase text-fg-soft">Activos</p>
          <p className="font-mono font-bold text-primary text-lg">{formatCurrency(totalActivosArs + totalActivosUsd * tipoCambio)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-fg-soft">Pasivos</p>
          <p className="font-mono font-bold text-amber-700 text-lg">{formatCurrency(totalPasivosArs + totalPasivosUsd * tipoCambio)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-fg-soft">Patrimonio neto</p>
          <p className="font-mono font-bold text-fg text-lg">{formatCurrency(pnArs)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-fg-soft">Resultado del mes</p>
          <p className={cn('font-mono font-bold text-lg', resultado >= 0 ? 'text-emerald-400' : 'text-rose-400')}>{formatCurrency(resultado)}</p>
          <p className="text-[10px] text-fg-soft">PN ant. {formatCurrency(pnAnteriorArs)} · Δ {formatCurrency(variacionPN)}</p>
        </div>
      </div>

      {/* Datos del mes: TC + cajas (editables, siempre a mano) */}
      <div className="bg-surface border border-amber-500/30 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="text-xs font-medium text-fg-muted flex items-center gap-1.5 mb-1"><DollarSign className="w-3.5 h-3.5 text-amber-700" />Tipo de cambio (USD→ARS)</label>
          <MoneyInput value={tipoCambio} onChange={setTipoCambio} prefix="" disabled={cerrado} placeholder="0,00" />
        </div>
        <MoneyInput label="Caja ARS" value={cajaArs} onChange={setCajaArs} disabled={cerrado} prefix="$" />
        <MoneyInput label="Caja USD" value={cajaUsd} onChange={setCajaUsd} disabled={cerrado} prefix="U$S" />
      </div>

      {/* SECCIÓN ACTIVOS */}
      <Section title="Activos" subtitle="Lo que tengo (efectivo + saldos en cuentas)" icon={Wallet} color="indigo" total={<span className="text-primary">{formatCurrency(totalActivosArs + totalActivosUsd * tipoCambio)}</span>}>
        {/* Efectivo (cajas) — se edita arriba en "Datos del mes" */}
        {(cajaArs > 0 || cajaUsd > 0) && (
          <div className="bg-surface-2/40 rounded-lg px-4 py-2 flex items-center justify-between text-xs">
            <span className="text-fg-muted flex items-center gap-1.5"><Banknote className="w-3.5 h-3.5" />Efectivo (cajas)</span>
            <span className="font-mono text-fg-muted">{formatCurrency(cajaArs)}{cajaUsd > 0 && ` · ${formatCurrency(cajaUsd, 'USD')}`}</span>
          </div>
        )}

        {/* Cuentas por titular */}
        {props.titulares.map((titular) => {
          const cs = cuentasPorTitular.get(titular.id) ?? []
          if (cs.length === 0) return null
          const totalArsTitular = cs.reduce((s, c) => s + (saldosMap.get(c.id)?.ars ?? 0), 0)
          const totalUsdTitular = cs.reduce((s, c) => s + (saldosMap.get(c.id)?.usd ?? 0), 0)
          return (
            <SubBlock
              key={titular.id}
              title={titular.nombre}
              icon={Building2}
              headerRight={<>
                <span className="text-primary font-mono">{formatCurrency(totalArsTitular)}</span>
                {totalUsdTitular > 0 && <span className="text-green-700 font-mono">{formatCurrency(totalUsdTitular, 'USD')}</span>}
              </>}
            >
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-strong/40">
                    <th className="text-left px-4 py-1.5 text-[10px] font-medium text-fg-soft uppercase">Banco · Cuenta</th>
                    <th className="text-left px-4 py-1.5 text-[10px] font-medium text-fg-soft uppercase">Tipo</th>
                    <th className="text-right px-4 py-1.5 text-[10px] font-medium text-fg-soft uppercase">ARS</th>
                    <th className="text-right px-4 py-1.5 text-[10px] font-medium text-fg-soft uppercase">USD</th>
                  </tr>
                </thead>
                <tbody>
                  {cs.map((c) => {
                    const s = saldosMap.get(c.id)
                    return (
                      <tr key={c.id} className="border-b border-border-strong/30 last:border-0">
                        <td className="px-4 py-1.5 text-fg-muted text-xs">{c.banco} · <span className="text-fg-soft">{c.nombre}</span></td>
                        <td className="px-4 py-1.5 text-xs"><Badge variant="default">{c.tipo}</Badge></td>
                        <td className="px-4 py-1.5 text-right font-mono text-fg-muted text-xs">{formatCurrency(s?.ars ?? 0)}</td>
                        <td className="px-4 py-1.5 text-right font-mono text-fg-muted text-xs">{c.permite_dual ? formatCurrency(s?.usd ?? 0, 'USD') : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </SubBlock>
          )
        })}

        {/* Cuentas patrimoniales agrupadas por tipo */}
        {props.cuentasPatrim.length > 0 && (() => {
          const tipoLabels: Record<string, string> = {
            INVENTARIO: 'Posición de mercadería',
            INVERSION: 'Inversiones y activo fijo',
            PROVISION: 'Provisión',
            CTA_CTE_MARCA: 'Cta. Cte. Marcas',
            PASIVO_ROTATIVO: 'Pasivo rotativo',
            IMPOSITIVO: 'Impositivo',
            OTRO_ACTIVO: 'Otros activos',
            OTRO_PASIVO: 'Otros pasivos',
          }
          return Array.from(patrimAportes.porTipo.entries()).map(([tipo, totales]) => {
            const cs = props.cuentasPatrim.filter((c) => c.tipo === tipo)
            return (
              <SubBlock key={tipo} title={tipoLabels[tipo] ?? tipo} headerRight={<>
                {totales.ars !== 0 && (
                  <span className={cn('font-mono', totales.ars >= 0 ? 'text-primary' : 'text-amber-700')}>
                    {totales.ars >= 0 ? '+' : ''}{formatCurrency(totales.ars)}
                  </span>
                )}
                {totales.usd !== 0 && (
                  <span className={cn('font-mono', totales.usd >= 0 ? 'text-green-700' : 'text-amber-700')}>
                    {totales.usd >= 0 ? '+' : ''}{formatCurrency(totales.usd, 'USD')}
                  </span>
                )}
              </>}>
                <div className="divide-y divide-slate-700/30">
                  {cs.map((c) => {
                    const saldo = saldosPatrimMap.get(c.id) ?? 0
                    const aporte = c.tipo === 'INVENTARIO' ? saldo : c.signo_pn * saldo
                    const mov = c.tipo === 'INVENTARIO' ? props.movimientoInv?.[c.id] : undefined
                    const tieneMov = mov && (mov.saldoInicial || mov.compras || mov.cmv)
                    return (
                      <div key={c.id} className="px-4 py-1.5 flex items-center justify-between text-xs">
                        <div>
                          <p className="text-fg-muted">{c.nombre}</p>
                          {tieneMov ? (
                            <p className="text-fg-soft text-[10px] font-mono">
                              Inicial {formatCurrency(mov!.saldoInicial)} · <span className="text-primary">+ compras {formatCurrency(mov!.compras)}</span> · <span className="text-amber-700">− CMV {formatCurrency(mov!.cmv)}</span>
                            </p>
                          ) : (
                            <p className="text-fg-soft text-[10px]">
                              {c.signo_pn > 0 ? '↑ suma al PN' : '↓ resta del PN'}
                              {c.marca && <> · {c.marca}</>}
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="font-mono text-fg-muted">{formatCurrency(saldo, c.moneda)}</p>
                          <p className={cn('text-[10px] font-mono', aporte >= 0 ? 'text-primary' : 'text-amber-700')}>
                            {aporte >= 0 ? '+' : ''}{formatCurrency(aporte, c.moneda)}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </SubBlock>
            )
          })
        })()}

        {/* Otros activos manuales */}
        {props.activosManuales.length > 0 && (
          <SubBlock title="Otros activos" icon={TrendingUp} iconColor="text-purple-700" headerRight={<>
            {totalActivosManualesArs > 0 && <span className="font-mono text-purple-700">{formatCurrency(totalActivosManualesArs)}</span>}
            {totalActivosManualesUsd > 0 && <span className="font-mono text-green-700">{formatCurrency(totalActivosManualesUsd, 'USD')}</span>}
          </>}>
            <div className="divide-y divide-slate-700/30">
              {props.activosManuales.map((a) => (
                <div key={a.id} className="px-4 py-1.5 flex items-center justify-between text-xs">
                  <div>
                    <p className="text-fg-muted">{a.descripcion}</p>
                    <p className="text-fg-soft text-[10px]">
                      {a.categoria ?? '—'}
                      {a.titular?.nombre && <> · {a.titular.nombre}</>}
                    </p>
                  </div>
                  <span className="font-mono text-fg-muted">{formatCurrency(Number(a.monto), a.moneda)}</span>
                </div>
              ))}
            </div>
          </SubBlock>
        )}

        {/* Producción en proceso (activo) */}
        {props.produccionEnProceso.length > 0 && (() => {
          const catLabels: Record<string, string> = {
            MANO_DE_OBRA: 'Mano de obra', INSUMO: 'Insumos', AVIO: 'Avíos', OTRO: 'Otros',
          }
          const porCat = new Map<string, number>()
          for (const p of props.produccionEnProceso) {
            const k = p.categoria_produccion ?? 'OTRO'
            porCat.set(k, (porCat.get(k) ?? 0) + costoNetoProd(p))
          }
          return (
            <SubBlock title="Producción en proceso" icon={Building2} iconColor="text-orange-600" headerRight={<>
              {produccionArs > 0 && <span className="font-mono text-primary">{formatCurrency(produccionArs)}</span>}
              {produccionUsd > 0 && <span className="font-mono text-green-700">{formatCurrency(produccionUsd, 'USD')}</span>}
            </>}>
              <div className="divide-y divide-slate-700/30">
                {Array.from(porCat.entries()).map(([cat, total]) => (
                  <div key={cat} className="px-4 py-1.5 flex items-center justify-between text-xs">
                    <p className="text-fg-muted">{catLabels[cat] ?? cat}</p>
                    <span className="font-mono text-fg-muted">{formatCurrency(total)}</span>
                  </div>
                ))}
              </div>
              <p className="px-4 py-1.5 text-[10px] text-fg-soft border-t border-border-strong/30">
                Insumos y mano de obra pagados por mercadería sin terminar. Compensa la deuda que generaron.
              </p>
            </SubBlock>
          )
        })()}

        {/* Cuentas corrientes — a cobrar (activo) */}
        {(props.ccDetalle ?? []).some((c) => c.esActivo) && (
          <SubBlock title="Cuentas corrientes (a cobrar)" icon={Wallet} iconColor="text-primary" headerRight={<>
            {(props.ccActivosArs ?? 0) > 0 && <span className="font-mono text-primary">{formatCurrency(props.ccActivosArs ?? 0)}</span>}
            {(props.ccActivosUsd ?? 0) > 0 && <span className="font-mono text-green-700">{formatCurrency(props.ccActivosUsd ?? 0, 'USD')}</span>}
          </>}>
            <div className="divide-y divide-slate-700/30">
              {(props.ccDetalle ?? []).filter((c) => c.esActivo).map((c, i) => (
                <div key={i} className="px-4 py-1.5 flex items-center justify-between text-xs">
                  <p className="text-fg-muted">{c.nombre}</p>
                  <span className="font-mono text-fg-muted">{formatCurrency(c.monto, c.moneda as 'ARS' | 'USD')}</span>
                </div>
              ))}
            </div>
          </SubBlock>
        )}

        <div className="bg-surface border border-orange-500/30 rounded-lg p-3 flex items-center justify-between">
          <span className="text-sm font-medium text-fg-muted">TOTAL ACTIVOS</span>
          <div className="flex items-center gap-4">
            <span className="font-mono text-primary font-bold text-lg">{formatCurrency(totalActivosArs)}</span>
            {totalActivosUsd > 0 && <span className="font-mono text-green-700 font-bold text-lg">{formatCurrency(totalActivosUsd, 'USD')}</span>}
          </div>
        </div>
      </Section>

      {/* SECCIÓN PASIVOS */}
      <Section title="Pasivos" subtitle="Detalle de todo lo que la empresa debe al cierre del mes" icon={ArrowDownCircle} color="amber" total={<span className="text-amber-700">{formatCurrency(totalPasivosArs + totalPasivosUsd * tipoCambio)}</span>}>
        {/* 1. Compras pendientes (sin pago aún) */}
        {props.comprasPendientes.length > 0 && (
          <PasivoBlock
            title="Compras pendientes (sin pago programado)"
            icon={Receipt}
            items={props.comprasPendientes.map((c) => {
              const total = Number(c.monto_total)
              const saldoCorte = Number(c.saldo_pendiente)
              const pagadoAlCorte = total - saldoCorte
              const mon = c.moneda as 'ARS' | 'USD'
              return {
                label: c.proveedor?.nombre ?? c.descripcion,
                detalle: `Compra del ${formatDate(c.fecha)} · Total ${formatCurrency(total, mon)}${pagadoAlCorte > 0.01 ? ` · pagado ${formatCurrency(pagadoAlCorte, mon)} al corte` : ''}`,
                monto: saldoCorte,
                moneda: c.moneda,
              }
            })}
          />
        )}
        {/* 2. Cheques emitidos pendientes de acreditación */}
        {props.chequesPendientes.length > 0 && (
          <PasivoBlock
            title="Cheques emitidos sin debitar"
            icon={FileText}
            items={props.chequesPendientes.map((c) => ({
              label: `${c.compra?.proveedor?.nombre ?? c.compra?.descripcion ?? 'Cheque'}${c.numero_cheque ? ` · Nº ${c.numero_cheque}` : ''}`,
              detalle: `${c.instrumento === 'ECHEQ' ? 'E-Cheq' : 'Físico'}${c.banco_emisor ? ` · ${c.banco_emisor}` : ''}${c.fecha_vencimiento ? ` · Vence ${formatDate(c.fecha_vencimiento)}` : ''}`,
              monto: Number(c.monto),
              moneda: c.moneda,
            }))}
          />
        )}
        {/* 3. Pagos a plazo (cta cte / transferencia) */}
        {props.pagosCtaCtePendientes.length > 0 && (
          <PasivoBlock
            title="Pagos a plazo programados"
            icon={CreditCard}
            items={props.pagosCtaCtePendientes.map((p) => ({
              label: p.compra?.proveedor?.nombre ?? p.compra?.descripcion ?? 'Pago programado',
              detalle: `${p.instrumento === 'CUENTA_CORRIENTE' ? 'Cta. corriente' : 'Transferencia'}${p.fecha_vencimiento ? ` · Vence ${formatDate(p.fecha_vencimiento)}` : ''}`,
              monto: Number(p.monto),
              moneda: p.moneda,
            }))}
          />
        )}
        {/* 4. Cuotas de tarjeta */}
        {props.cuotasPendientes.length > 0 && (
          <PasivoBlock
            title="Cuotas de tarjeta pendientes"
            icon={CreditCard}
            items={props.cuotasPendientes.map((c) => ({
              label: c.concepto,
              detalle: `${c.tarjeta?.banco ?? '—'} · Vence ${formatMonth(c.mes_vencimiento)}`,
              monto: Number(c.monto_cuota),
              moneda: 'ARS',
            }))}
          />
        )}
        {/* 5. Gastos pendientes (unifica el mismo servicio de varios meses en un renglón desplegable) */}
        {gastosNetos.length > 0 && (
          <GastosPendientesBlock gastos={gastosNetos} recurrentesMap={recurrentesMap} hoy={hoyStr} />
        )}
        {/* 6. Inversiones de terceros */}
        {inversionesConSaldo.length > 0 && (
          <PasivoBlock
            title="Inversiones de terceros (capital + intereses al cierre)"
            icon={TrendingUp}
            items={inversionesConSaldo.map((i) => ({
              label: i.inversor?.nombre ?? i.codigo ?? 'Inversor',
              detalle: `${i.codigo ?? ''} · Capital + interés acumulado al corte`,
              monto: i.saldoCierre,
              moneda: i.moneda,
            }))}
          />
        )}
        {/* 7. Préstamos bancarios (capital pendiente al corte) */}
        {(props.prestamosBancarios ?? []).length > 0 && (
          <PasivoBlock
            title="Préstamos bancarios"
            icon={TrendingDown}
            items={(props.prestamosBancarios ?? []).map((p) => ({
              label: p.acreedor || p.nombre,
              detalle: `${p.nombre} · capital pendiente al corte`,
              monto: p.capital,
              moneda: p.moneda,
            }))}
          />
        )}
        {/* 8. Planes de pago AFIP (capital financiado pendiente) */}
        {(props.planesAfip ?? []).length > 0 && (
          <PasivoBlock
            title="Planes de pago AFIP"
            icon={Receipt}
            items={(props.planesAfip ?? []).map((p) => ({
              label: p.nombre,
              detalle: 'Capital financiado pendiente al corte',
              monto: p.capital,
              moneda: 'ARS',
            }))}
          />
        )}

        {/* Pasivos manuales */}
        <SubBlock
          title="Pasivos manuales (préstamos, deudas no registradas)"
          icon={Plus}
          iconColor="text-amber-700"
          defaultOpen={!cerrado || pasivosManuales.length > 0}
          headerRight={!cerrado ? (
            <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); agregarPasivo() }} title="Agregar pasivo manual">
              <Plus className="w-3.5 h-3.5" />
              Agregar
            </Button>
          ) : undefined}
        >
          {pasivosManuales.length === 0 ? (
            <p className="px-4 py-3 text-xs text-fg-soft">Sin pasivos manuales cargados</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-strong/40">
                  <th className="text-left px-4 py-1.5 text-[10px] font-medium text-fg-soft uppercase">Descripción</th>
                  <th className="text-left px-4 py-1.5 text-[10px] font-medium text-fg-soft uppercase">Acreedor</th>
                  <th className="text-right px-4 py-1.5 text-[10px] font-medium text-fg-soft uppercase">Monto</th>
                  <th className="text-left px-4 py-1.5 text-[10px] font-medium text-fg-soft uppercase">Moneda</th>
                  {!cerrado && <th />}
                </tr>
              </thead>
              <tbody>
                {pasivosManuales.map((p) => (
                  <tr key={p.id} className="border-b border-border-strong/30 last:border-0">
                    <td className="px-4 py-1.5">
                      <input
                        type="text"
                        value={p.descripcion}
                        onChange={(e) => actualizarPasivo(p.id, { descripcion: e.target.value })}
                        disabled={cerrado}
                        placeholder="Ej: Préstamo personal"
                        className="w-full px-2 py-1 bg-surface-2 border border-[#c8c0b0] rounded text-fg text-xs focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
                      />
                    </td>
                    <td className="px-4 py-1.5">
                      <input
                        type="text"
                        value={p.acreedor ?? ''}
                        onChange={(e) => actualizarPasivo(p.id, { acreedor: e.target.value })}
                        disabled={cerrado}
                        placeholder="—"
                        className="w-full px-2 py-1 bg-surface-2 border border-[#c8c0b0] rounded text-fg text-xs focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
                      />
                    </td>
                    <td className="px-4 py-1.5 w-40">
                      <input
                        type="number"
                        step="0.01"
                        value={p.monto || ''}
                        onChange={(e) => actualizarPasivo(p.id, { monto: Number(e.target.value) })}
                        disabled={cerrado}
                        placeholder="0.00"
                        className="w-full px-2 py-1 bg-surface-2 border border-[#c8c0b0] rounded text-amber-700 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
                      />
                    </td>
                    <td className="px-4 py-1.5 w-24">
                      <select
                        value={p.moneda}
                        onChange={(e) => actualizarPasivo(p.id, { moneda: e.target.value as 'ARS' | 'USD' })}
                        disabled={cerrado}
                        className="w-full px-2 py-1 bg-surface-2 border border-[#c8c0b0] rounded text-fg text-xs focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
                      >
                        <option value="ARS">ARS</option>
                        <option value="USD">USD</option>
                      </select>
                    </td>
                    {!cerrado && (
                      <td className="px-2 py-1.5 w-10">
                        <button
                          type="button"
                          onClick={() => eliminarPasivo(p.id)}
                          className="p-1 rounded text-fg-soft hover:text-red-700 hover:bg-surface-2"
                          title="Eliminar pasivo"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SubBlock>

        {/* Cuentas corrientes — a pagar (pasivo) */}
        {(props.ccDetalle ?? []).some((c) => !c.esActivo) && (
          <SubBlock title="Cuentas corrientes (a pagar)" icon={ArrowDownCircle} iconColor="text-amber-700" headerRight={<>
            {(props.ccPasivosArs ?? 0) > 0 && <span className="font-mono text-amber-700">{formatCurrency(props.ccPasivosArs ?? 0)}</span>}
            {(props.ccPasivosUsd ?? 0) > 0 && <span className="font-mono text-amber-800">{formatCurrency(props.ccPasivosUsd ?? 0, 'USD')}</span>}
          </>}>
            <div className="divide-y divide-slate-700/30">
              {(props.ccDetalle ?? []).filter((c) => !c.esActivo).map((c, i) => (
                <div key={i} className="px-4 py-1.5 flex items-center justify-between text-xs">
                  <p className="text-fg-muted">{c.nombre}</p>
                  <span className="font-mono text-fg-muted">{formatCurrency(c.monto, c.moneda as 'ARS' | 'USD')}</span>
                </div>
              ))}
            </div>
          </SubBlock>
        )}

        <div className="bg-surface border border-amber-500/30 rounded-lg p-3 flex items-center justify-between">
          <span className="text-sm font-medium text-fg-muted">TOTAL PASIVOS</span>
          <div className="flex items-center gap-4">
            <span className="font-mono text-amber-700 font-bold text-lg">{formatCurrency(totalPasivosArs)}</span>
            {totalPasivosUsd > 0 && <span className="font-mono text-amber-800 font-bold text-lg">{formatCurrency(totalPasivosUsd, 'USD')}</span>}
          </div>
        </div>
      </Section>

      {/* SECCIÓN RETIROS */}
      <Section title="Retiros del mes" subtitle="Detraídos por los socios — se suman al resultado" icon={ArrowDownCircle} color="purple" total={<span className="text-purple-700">{formatCurrency(totalRetirosArs + totalRetirosUsd * tipoCambio)}</span>}>
        {retirosPorSocio.length === 0 ? (
          <p className="px-4 py-6 text-sm text-fg-soft text-center">Sin retiros registrados en {formatMonth(props.mes)}</p>
        ) : (
          retirosPorSocio.map(([socio, data]) => (
            <div key={socio} className="bg-surface-2/40 rounded-lg overflow-hidden">
              <div className="px-4 py-2 border-b border-border-strong/50 flex items-center justify-between">
                <h3 className="text-sm font-medium text-fg-muted">{socio}</h3>
                <div className="flex items-center gap-3 text-xs">
                  {data.ars > 0 && <span className="font-mono text-purple-700">{formatCurrency(data.ars)}</span>}
                  {data.usd > 0 && <span className="font-mono text-green-700">{formatCurrency(data.usd, 'USD')}</span>}
                </div>
              </div>
              <div className="p-3 grid grid-cols-2 md:grid-cols-3 gap-2">
                {Array.from(data.porCategoria.values()).map((c, i) => (
                  <div key={i} className="bg-surface/40 rounded p-2 text-xs">
                    <div className="flex items-center gap-1 text-fg-muted">
                      {c.cat?.emoji && <span>{c.cat.emoji}</span>}
                      <span>{c.cat?.nombre ?? 'Sin categoría'}</span>
                    </div>
                    <div className="font-mono text-fg mt-0.5">
                      {c.ars > 0 && formatCurrency(c.ars)}
                      {c.usd > 0 && (c.ars > 0 ? ' · ' : '') + formatCurrency(c.usd, 'USD')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}

        <div className="bg-surface border border-purple-500/30 rounded-lg p-3 flex items-center justify-between">
          <span className="text-sm font-medium text-fg-muted">TOTAL RETIROS</span>
          <div className="flex items-center gap-4">
            <span className="font-mono text-purple-700 font-bold text-lg">{formatCurrency(totalRetirosArs)}</span>
            {totalRetirosUsd > 0 && <span className="font-mono text-green-700 font-bold text-lg">{formatCurrency(totalRetirosUsd, 'USD')}</span>}
          </div>
        </div>
      </Section>

      {/* RESUMEN PATRIMONIAL — colapsable (el resultado clave ya está en el resumen de arriba) */}
      <Section title="Variación patrimonial" subtitle="Cómo se compone el resultado del mes (detalle)" icon={TrendingUp} color="indigo" total={<span className={resultado >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{formatCurrency(resultado)}</span>}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-fg-muted">PN al cierre del mes anterior</span>
              <span className="font-mono text-fg-muted">{formatCurrency(pnAnteriorArs)}</span>
            </div>
            <div className="flex justify-between border-t border-border pt-3">
              <span className="text-fg-muted">Activos totales (ARS + USD@TC)</span>
              <span className="font-mono text-primary">{formatCurrency(totalActivosArs + totalActivosUsd * tipoCambio)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-fg-muted">Pasivos totales (ARS + USD@TC)</span>
              <span className="font-mono text-amber-700">- {formatCurrency(totalPasivosArs + totalPasivosUsd * tipoCambio)}</span>
            </div>
            <div className="flex justify-between border-t border-border-strong pt-3 font-medium">
              <span className="text-fg-muted">PN al cierre actual</span>
              <span className="font-mono text-fg text-base">{formatCurrency(pnArs)}</span>
            </div>
          </div>
          <div className="space-y-3 text-sm bg-surface-2/40 rounded-lg p-4">
            <div className="flex justify-between">
              <span className="text-fg-muted">Variación PN</span>
              <span className={cn('font-mono font-medium', variacionPN >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                {variacionPN >= 0 ? '+' : ''}{formatCurrency(variacionPN)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-fg-muted">+ Retiros del mes</span>
              <span className="font-mono text-purple-700">{formatCurrency(totalRetirosArsConvertido)}</span>
            </div>
            <div className="flex justify-between border-t border-border-strong pt-3 font-bold">
              <span className="text-fg">RESULTADO DEL MES</span>
              <span className={cn('font-mono text-lg', resultado >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                {formatCurrency(resultado)}
              </span>
            </div>
            <p className="text-[10px] text-fg-soft italic pt-2 border-t border-border-strong/40">
              Resultado = (PN actual − PN anterior) + Retiros · TC del cierre: ${tipoCambio.toFixed(2)}
            </p>
            {/* Memo: Resultados acumulados (composición del PN, informativo — no entra al arqueo) */}
            <div className="mt-2 pt-2 border-t border-border-strong/40 space-y-1 text-[11px]">
              <div className="flex justify-between text-fg-soft">
                <span>Resultados acumulados (meses cerrados)</span>
                <span className="font-mono">{formatCurrency(props.resultadosAcumuladosPrevios ?? 0)}</span>
              </div>
              <div className="flex justify-between font-medium">
                <span className="text-fg-muted">= Acumulado al cierre de este mes</span>
                <span className="font-mono text-fg">{formatCurrency((props.resultadosAcumuladosPrevios ?? 0) + resultado)}</span>
              </div>
              <p className="text-[10px] text-fg-soft italic">
                {(props.cierresCerrados ?? []).length === 0
                  ? 'Se acumula al confirmar cada mes. Arranca el mes que viene; informativo, no cambia el PN.'
                  : `${(props.cierresCerrados ?? []).length} mes(es) cerrado(s). Arranca el mes que viene; informativo, no cambia el PN.`}
              </p>
            </div>
          </div>
        </div>

        {/* Liquidez detallada */}
        <div className="px-5 py-3 border-t border-border grid grid-cols-2 gap-4 text-xs">
          <div className="bg-surface-2/40 rounded p-2">
            <p className="text-fg-soft mb-1">Liquidez total ARS (sin convertir)</p>
            <p className="font-mono text-fg font-medium">{formatCurrency(totalActivosArs - totalPasivosArs)}</p>
          </div>
          <div className="bg-surface-2/40 rounded p-2">
            <p className="text-fg-soft mb-1">Liquidez total USD (sin convertir)</p>
            <p className="font-mono text-fg font-medium">{formatCurrency(totalActivosUsd - totalPasivosUsd, 'USD')}</p>
          </div>
        </div>
      </Section>

      {/* Notas */}
      <div className="bg-surface border border-border rounded-xl p-4">
        <label className="block text-xs font-medium text-fg-muted mb-1.5">Notas del cierre</label>
        <textarea
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          disabled={cerrado}
          rows={2}
          placeholder="Observaciones, ajustes manuales, contexto del mes..."
          className="w-full px-3 py-2 bg-surface-2 border border-border-strong rounded-lg text-fg text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60 resize-none"
        />
      </div>
    </div>
  )
}

// ─── Helpers de UI ─────────────────────────────────────────────────────

function Section({ title, subtitle, icon: Icon, color, total, defaultOpen = false, children }: {
  title: string
  subtitle: string
  icon: React.ElementType
  color: 'indigo' | 'amber' | 'purple'
  total?: React.ReactNode
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const colorMap = {
    indigo: 'border-orange-500/20',
    amber: 'border-amber-500/20',
    purple: 'border-purple-500/20',
  }
  const iconColor = {
    indigo: 'text-primary',
    amber: 'text-amber-700',
    purple: 'text-purple-700',
  }
  return (
    <div className={cn('bg-surface border rounded-xl overflow-hidden', colorMap[color])}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full px-5 py-3 flex items-center justify-between gap-3 text-left hover:bg-surface-2/30 transition-colors"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <ChevronDown className={cn('w-4 h-4 text-fg-soft shrink-0 transition-transform', open ? '' : '-rotate-90')} />
          <div className="min-w-0">
            <h2 className={cn('text-sm font-semibold flex items-center gap-2', iconColor[color])}>
              <Icon className="w-4 h-4 shrink-0" />
              {title}
            </h2>
            <p className="text-xs text-fg-soft mt-0.5 truncate">{subtitle}</p>
          </div>
        </div>
        {total != null && <div className="font-mono font-bold text-base shrink-0">{total}</div>}
      </button>
      {open && <div className="p-4 space-y-3 overflow-x-auto border-t border-border">{children}</div>}
    </div>
  )
}

// Sub-bloque plegable reutilizable (2º nivel de acordeón dentro de Activos/Pasivos).
// El header es un <div> clickeable (no <button>) para poder anidar controles
// interactivos (ej. el "Agregar" de pasivos manuales) sin <button> dentro de <button>.
function SubBlock({ title, icon: Icon, iconColor = 'text-fg-muted', headerRight, defaultOpen = false, children }: {
  title: React.ReactNode
  icon?: React.ElementType
  iconColor?: string
  headerRight?: React.ReactNode
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-surface-2/40 rounded-lg overflow-hidden">
      <div
        onClick={() => setOpen((o) => !o)}
        className="px-4 py-2 flex items-center justify-between gap-2 cursor-pointer select-none hover:bg-surface-2/60 transition-colors"
      >
        <h3 className="text-sm font-medium text-fg-muted flex items-center gap-2 min-w-0">
          <ChevronDown className={cn('w-3.5 h-3.5 text-fg-soft shrink-0 transition-transform', open ? '' : '-rotate-90')} />
          {Icon && <Icon className={cn('w-3.5 h-3.5 shrink-0', iconColor)} />}
          <span className="truncate">{title}</span>
        </h3>
        {headerRight != null && <div className="flex items-center gap-3 text-xs shrink-0">{headerRight}</div>}
      </div>
      {open && <div className="border-t border-border-strong/50">{children}</div>}
    </div>
  )
}

function PasivoBlock({ title, icon: Icon, items }: {
  title: string
  icon: React.ElementType
  items: { label: string; detalle: string; monto: number; moneda: string; grupo?: string }[]
}) {
  const totalArs = items.filter((i) => i.moneda !== 'USD').reduce((s, i) => s + i.monto, 0)
  const totalUsd = items.filter((i) => i.moneda === 'USD').reduce((s, i) => s + i.monto, 0)
  const headerRight = (
    <>
      {totalArs > 0 && <span className="font-mono text-amber-700">{formatCurrency(totalArs)}</span>}
      {totalUsd > 0 && <span className="font-mono text-amber-800">{formatCurrency(totalUsd, 'USD')}</span>}
    </>
  )
  const renderItem = (it: typeof items[number], i: number) => (
    <div key={i} className="px-4 py-1.5 flex items-center justify-between text-xs">
      <div>
        <p className="text-fg-muted">{it.label}</p>
        <p className="text-fg-soft text-[10px]">{it.detalle}</p>
      </div>
      <span className="font-mono text-fg-muted">{formatCurrency(it.monto, it.moneda as 'ARS' | 'USD')}</span>
    </div>
  )
  // Agrupación opcional por categoría (preserva el orden de aparición de los grupos)
  const hayGrupos = items.some((i) => i.grupo)
  const grupos = new Map<string, typeof items>()
  for (const it of items) {
    const k = it.grupo ?? ''
    if (!grupos.has(k)) grupos.set(k, [])
    grupos.get(k)!.push(it)
  }
  return (
    <SubBlock title={title} icon={Icon} headerRight={headerRight}>
      {hayGrupos ? (
        <div className="divide-y divide-slate-700/40">
          {Array.from(grupos.entries()).map(([grupo, its]) => {
            const subArs = its.filter((i) => i.moneda !== 'USD').reduce((s, i) => s + i.monto, 0)
            const subUsd = its.filter((i) => i.moneda === 'USD').reduce((s, i) => s + i.monto, 0)
            return (
              <div key={grupo}>
                <div className="px-4 py-1 flex items-center justify-between bg-surface-2/50">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-fg-soft">{grupo || 'Sin categoría'}</span>
                  <span className="font-mono text-[10px] text-fg-soft">
                    {subArs > 0 && formatCurrency(subArs)}{subUsd > 0 && `${subArs > 0 ? ' · ' : ''}${formatCurrency(subUsd, 'USD')}`}
                  </span>
                </div>
                <div className="divide-y divide-slate-700/30">{its.map(renderItem)}</div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="divide-y divide-slate-700/30">{items.map(renderItem)}</div>
      )}
    </SubBlock>
  )
}

// Badge chico "Vencido"
function VencidoBadge() {
  return <span className="text-[9px] px-1 py-0.5 rounded bg-rose-500/15 text-rose-600 font-semibold uppercase tracking-wide shrink-0">Vencido</span>
}

// Un servicio con varios meses impagos → renglón desplegable con el detalle por mes/vencimiento.
function GrupoGastoRow({ items, recurrentesMap, hoy }: {
  items: GastoPendiente[]
  recurrentesMap: Map<string, { dia_vencimiento?: number | null; tipo_mes?: string | null }>
  hoy: string
}) {
  const [open, setOpen] = useState(false)
  const g0 = items[0]
  const total = items.reduce((s, g) => s + Number(g.monto), 0)
  const recOf = (g: GastoPendiente) => (g.recurrente_id ? recurrentesMap.get(g.recurrente_id) ?? null : null)
  const algunVencido = items.some((g) => estaVencido(g, recOf(g), hoy))
  const ordenados = [...items].sort((a, b) => (a.mes < b.mes ? -1 : 1))
  return (
    <div>
      <div
        onClick={() => setOpen((o) => !o)}
        className="px-4 py-1.5 flex items-center justify-between gap-2 text-xs cursor-pointer select-none hover:bg-surface-2/40"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <ChevronDown className={cn('w-3 h-3 text-fg-soft shrink-0 transition-transform', open ? '' : '-rotate-90')} />
          <div className="min-w-0">
            <p className="text-fg-muted flex items-center gap-1.5">
              <span className="truncate">{g0.concepto}</span>
              <span className="text-fg-soft text-[10px] shrink-0">· {items.length} meses</span>
              {algunVencido && <VencidoBadge />}
            </p>
            <p className="text-fg-soft text-[10px] truncate">{g0.categoria}</p>
          </div>
        </div>
        <span className="font-mono text-fg-muted shrink-0">{formatCurrency(total, g0.moneda as 'ARS' | 'USD')}</span>
      </div>
      {open && (
        <div className="bg-surface-2/20 divide-y divide-slate-700/20">
          {ordenados.map((g, i) => {
            const v = vencimientoGasto(g, recOf(g))
            const venc = estaVencido(g, recOf(g), hoy)
            return (
              <div key={i} className="pl-9 pr-4 py-1 flex items-center justify-between text-[11px]">
                <span className={cn(venc ? 'text-rose-600' : 'text-fg-soft')}>
                  {formatMonth(g.mes)}{v ? ` · vence ${formatDate(v)}` : ''}{venc ? ' · vencido' : ''}
                </span>
                <span className="font-mono text-fg-muted">{formatCurrency(Number(g.monto), g.moneda as 'ARS' | 'USD')}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Bloque "Gastos pendientes": unifica por servicio (recurrente_id, o concepto+categoría para los manuales).
// Servicios con varios meses impagos → renglón desplegable; los de un solo mes → línea plana. No cambia el total.
function GastosPendientesBlock({ gastos, recurrentesMap, hoy }: {
  gastos: GastoPendiente[]
  recurrentesMap: Map<string, { dia_vencimiento?: number | null; tipo_mes?: string | null }>
  hoy: string
}) {
  const totalArs = gastos.filter((g) => g.moneda !== 'USD').reduce((s, g) => s + Number(g.monto), 0)
  const totalUsd = gastos.filter((g) => g.moneda === 'USD').reduce((s, g) => s + Number(g.monto), 0)
  const grupos = new Map<string, GastoPendiente[]>()
  for (const g of gastos) {
    const k = g.recurrente_id ?? `${g.concepto}|${g.categoria}`
    if (!grupos.has(k)) grupos.set(k, [])
    grupos.get(k)!.push(g)
  }
  const recOf = (g: GastoPendiente) => (g.recurrente_id ? recurrentesMap.get(g.recurrente_id) ?? null : null)
  return (
    <SubBlock
      title="Gastos pendientes (servicios, sueldos, alquileres)"
      icon={Receipt}
      headerRight={<>
        {totalArs > 0 && <span className="font-mono text-amber-700">{formatCurrency(totalArs)}</span>}
        {totalUsd > 0 && <span className="font-mono text-amber-800">{formatCurrency(totalUsd, 'USD')}</span>}
      </>}
    >
      <div className="divide-y divide-slate-700/30">
        {Array.from(grupos.entries()).map(([k, items]) => {
          if (items.length > 1) {
            return <GrupoGastoRow key={k} items={items} recurrentesMap={recurrentesMap} hoy={hoy} />
          }
          const g = items[0]
          const v = vencimientoGasto(g, recOf(g))
          const venc = estaVencido(g, recOf(g), hoy)
          return (
            <div key={k} className="px-4 py-1.5 flex items-center justify-between gap-2 text-xs">
              <div className="min-w-0">
                <p className="text-fg-muted flex items-center gap-1.5">
                  <span className="truncate">{g.concepto}</span>
                  {venc && <VencidoBadge />}
                </p>
                <p className="text-fg-soft text-[10px] truncate">{g.categoria}{v ? ` · Vence ${formatDate(v)}` : ''}</p>
              </div>
              <span className="font-mono text-fg-muted shrink-0">{formatCurrency(Number(g.monto), g.moneda as 'ARS' | 'USD')}</span>
            </div>
          )
        })}
      </div>
    </SubBlock>
  )
}
