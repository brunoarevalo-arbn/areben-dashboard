'use client'

import { useActionState, useState } from 'react'
import { upsertSaldo } from '@/app/actions/finanzas'
import { createClient } from '@/lib/supabase/client'
import { Input, Select } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { formatCurrency, getMonthOptions, getCurrentMonth, formatMonth } from '@/lib/utils'
import { Loader2, Wallet } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { SaldoMensual } from '@/types/database'

export default function SaldosPage() {
  const [mes, setMes] = useState(getCurrentMonth())
  const [saldo, setSaldo] = useState<SaldoMensual | null>(null)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    setLoading(true)
    supabase
      .from('saldos_mensuales')
      .select('*')
      .eq('mes', mes)
      .maybeSingle()
      .then(({ data }) => {
        setSaldo(data)
        setLoading(false)
      })
  }, [mes])

  const [error, action, isPending] = useActionState(upsertSaldo, null)

  const totalARS = (saldo?.saldo_pesos ?? 0) + (saldo?.caja_pesos ?? 0) + (saldo?.cuentas_corrientes ?? 0)
  const totalUSD = (saldo?.saldo_usd ?? 0) + (saldo?.caja_usd ?? 0)

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Saldos</h1>
        <p className="text-sm text-slate-400 mt-0.5">Saldo actual por cuenta y moneda</p>
      </div>

      <div className="flex items-center gap-3">
        <Select
          options={getMonthOptions()}
          value={mes}
          onChange={(e) => setMes(e.target.value)}
          className="w-48"
        />
      </div>

      {saldo && (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-slate-900 border border-indigo-500/20 rounded-xl p-5">
            <p className="text-xs text-slate-400 mb-1">Total ARS</p>
            <p className="text-3xl font-bold text-indigo-400">{formatCurrency(totalARS)}</p>
            <p className="text-xs text-slate-500 mt-2">Banco + Caja + Cta. Corriente</p>
          </div>
          <div className="bg-slate-900 border border-green-500/20 rounded-xl p-5">
            <p className="text-xs text-slate-400 mb-1">Total USD</p>
            <p className="text-3xl font-bold text-green-400">{formatCurrency(totalUSD, 'USD')}</p>
            <p className="text-xs text-slate-500 mt-2">Banco + Caja</p>
          </div>
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h2 className="text-base font-semibold text-slate-100 mb-5">
          {saldo ? 'Actualizar' : 'Cargar'} saldo — {formatMonth(mes)}
        </h2>

        {loading ? (
          <div className="flex items-center gap-2 text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            Cargando...
          </div>
        ) : (
          <form action={action} className="space-y-4">
            <input type="hidden" name="mes" value={mes} />

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Cuenta bancaria (ARS)"
                name="saldo_pesos"
                type="number"
                step="0.01"
                defaultValue={saldo?.saldo_pesos ?? 0}
                placeholder="0.00"
              />
              <Input
                label="Cuenta bancaria (USD)"
                name="saldo_usd"
                type="number"
                step="0.01"
                defaultValue={saldo?.saldo_usd ?? 0}
                placeholder="0.00"
              />
              <Input
                label="Caja (ARS)"
                name="caja_pesos"
                type="number"
                step="0.01"
                defaultValue={saldo?.caja_pesos ?? 0}
                placeholder="0.00"
              />
              <Input
                label="Caja (USD)"
                name="caja_usd"
                type="number"
                step="0.01"
                defaultValue={saldo?.caja_usd ?? 0}
                placeholder="0.00"
              />
              <Input
                label="Cuentas corrientes (ARS)"
                name="cuentas_corrientes"
                type="number"
                step="0.01"
                defaultValue={saldo?.cuentas_corrientes ?? 0}
                placeholder="0.00"
                className="col-span-2"
              />
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Guardar saldo
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
