// Lo que la puerta le contesta al Monitor sobre los acreedores.
//
// Este archivo NO consulta nada: recibe lo que ya calculó `armarCuentas` y le da la forma con la
// que viaja. Está separado del route handler para poder probarlo, y porque la forma de la
// respuesta es un contrato entre dos repos: el día que cambie hay que verlo en un solo lugar.
//
// 🔑 **El cálculo se hace acá y no del otro lado.** El Monitor podría leer `gastos` y `pagos`
// directo —ya lo hace con otras tablas del dashboard en `api/_norte.js`— pero el saldo de un
// acreedor no es una tabla, es una resta con reglas (qué pago cuenta, cuál está agendado, cómo se
// corta en cero). Si el Monitor la rehace, el día que una de las dos apps cambie una regla van a
// mostrar números distintos y nadie va a saber cuál creer.

import type { CuentaAcreedor } from '@/lib/acreedores'
import { ordenarCuentasAcreedor, type AcreedorCuenta } from '@/lib/acreedor-cuentas'

export interface ConceptoPuente {
  id: string
  concepto: string
  mes: string
  fecha: string
  monto: number
  /** Lo que ya se le pagó Y se debitó. */
  pagado: number
  /** monto − pagado: lo que se le debe por este concepto. */
  saldo: number
  /** Lo que todavía se le puede imputar (descuenta también lo agendado sin debitar). */
  disponible: number
}

export interface CuentaBancariaPuente {
  id: string
  alias: string | null
  cbu: string | null
  banco: string | null
  titular: string | null
  sugerida: boolean
}

export interface AcreedorPuente {
  id: string
  nombre: string
  /** Lo que se le debe hoy. Es el número grande de la pantalla. */
  saldo: number
  /**
   * Cuánto se le puede pedir a un cliente que le transfiera. Es el saldo menos lo que ya está
   * comprometido y todavía no se debitó.
   */
  disponible: number
  /**
   * Plata que ya se le mandó pero que el banco no debitó todavía (un cheque entregado, por
   * ejemplo). ⚠️ Es la diferencia entre las dos de arriba y existe para que nadie le mande la
   * plata dos veces: la deuda figura abierta, pero ya está saldada con un cheque en la calle.
   */
  yaPagadoSinDebitar: number
  ultimoMovimiento: string | null
  conceptos: ConceptoPuente[]
  /** La sugerida primero. Las archivadas no viajan: no se transfiere a una cuenta dada de baja. */
  cuentas: CuentaBancariaPuente[]
}

function centavos(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Arma la respuesta. `cuentasDestino` viene por `proveedor_id`; un acreedor sin ninguna cuenta
 * cargada igual viaja —hay que poder ver que se le debe— con la lista vacía, y del otro lado eso
 * se muestra como "falta cargarle el CBU" y no como un error.
 */
export function armarPuenteAcreedores(
  cuentas: CuentaAcreedor[],
  cuentasDestino: Map<string, AcreedorCuenta[]>,
): AcreedorPuente[] {
  return cuentas.map((c) => {
    const conSaldo = c.conceptos.filter((x) => x.saldo > 0.005)
    const disponible = centavos(c.conceptos.reduce((s, x) => s + x.disponible, 0))
    const saldo = centavos(c.saldo)
    return {
      id: c.proveedorId,
      nombre: c.nombre,
      saldo,
      disponible,
      // Nunca negativo: si se pagó de más, `armarCuentas` ya cortó el saldo en cero.
      yaPagadoSinDebitar: Math.max(0, centavos(saldo - disponible)),
      ultimoMovimiento: c.ultimoPago,
      conceptos: conSaldo.map((x) => ({
        id: x.id,
        concepto: x.concepto,
        mes: x.mes,
        fecha: x.fecha,
        monto: centavos(Number(x.monto)),
        pagado: centavos(x.pagado),
        saldo: centavos(x.saldo),
        disponible: centavos(x.disponible),
      })),
      cuentas: ordenarCuentasAcreedor(
        (cuentasDestino.get(c.proveedorId) ?? []).filter((b) => b.activa),
      ).map((b) => ({
        id: b.id,
        alias: b.alias ?? null,
        cbu: b.cbu ?? null,
        banco: b.banco ?? null,
        titular: b.titular ?? null,
        sugerida: b.sugerida,
      })),
    }
  })
}
