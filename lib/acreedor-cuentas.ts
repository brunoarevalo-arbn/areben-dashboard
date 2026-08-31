// A qué cuenta se le transfiere a cada acreedor — la libreta de direcciones.
//
// Acá NO hay plata: son los datos para transferir (alias, CBU, banco, titular). Se separa de
// lib/acreedores.ts a propósito: ese archivo calcula CUÁNTO se debe, este dice A DÓNDE se manda.
//
// Todo lo de este archivo es puro: no toca la base ni React, así que lo puede usar igual la
// pantalla, la server action y —más adelante— la puerta que lee el Monitor.

import type { AcreedorCuenta } from '@/types/database'

export type { AcreedorCuenta }

/**
 * Deja el CBU en los 22 dígitos pelados. Se copia y se pega de todos lados —de un chat, de un
 * PDF, del home banking— y viene con espacios, guiones o puntos en el medio.
 * Devuelve null si no quedó nada.
 */
export function normalizarCbu(v: string | null | undefined): string | null {
  const solo = (v ?? '').replace(/\D/g, '')
  return solo || null
}

/** Recorta y colapsa espacios. Vacío → null, para que la base no guarde cadenas en blanco. */
export function limpiar(v: string | null | undefined): string | null {
  const t = (v ?? '').trim().replace(/\s+/g, ' ')
  return t || null
}

export interface CuentaEditable {
  alias?: string | null
  cbu?: string | null
  banco?: string | null
  titular?: string | null
  notas?: string | null
}

/**
 * Revisa una cuenta antes de guardarla. Devuelve el mensaje para mostrar, o null si está bien.
 * Los mensajes son los que ve la persona: sin tecnicismos y diciendo qué hacer.
 */
export function validarCuenta(c: CuentaEditable): string | null {
  const alias = limpiar(c.alias)
  const cbu = normalizarCbu(c.cbu)

  if (!alias && !cbu) return 'Poné al menos el alias o el CBU: sin uno de los dos no se puede transferir.'
  if (cbu && cbu.length !== 22) {
    return `El CBU tiene que tener 22 números y pusiste ${cbu.length}. Revisá que no falte ni sobre ninguno.`
  }
  // Los alias van de 6 a 20 caracteres y aceptan letras, números, punto y guion.
  if (alias && !/^[A-Za-z0-9.\-]{6,20}$/.test(alias)) {
    return 'El alias tiene entre 6 y 20 caracteres y solo lleva letras, números, puntos y guiones.'
  }
  return null
}

/** El CBU en dos bloques (8 + 14), que es como se lee y se dicta. */
export function formatearCbu(cbu: string | null | undefined): string {
  const n = normalizarCbu(cbu)
  if (!n || n.length !== 22) return n ?? ''
  return `${n.slice(0, 8)} ${n.slice(8)}`
}

/** Cómo se nombra la cuenta en una línea: el alias si hay, si no el banco, si no el CBU. */
export function etiquetaCuenta(c: AcreedorCuenta): string {
  return c.alias || c.banco || formatearCbu(c.cbu) || 'Cuenta sin nombre'
}

/**
 * La sugerida primero, después por banco y alias. Es el orden en que se muestra y también el
 * que va a devolver la puerta de lectura: el que consulta agarra la primera y transfiere.
 */
export function ordenarCuentasAcreedor(cuentas: AcreedorCuenta[]): AcreedorCuenta[] {
  return [...cuentas].sort(
    (a, b) =>
      Number(b.sugerida) - Number(a.sugerida) ||
      (a.banco ?? '').localeCompare(b.banco ?? '', 'es') ||
      etiquetaCuenta(a).localeCompare(etiquetaCuenta(b), 'es'),
  )
}

/** Agrupa las cuentas por acreedor, ya ordenadas. Las archivadas quedan afuera. */
export function cuentasPorAcreedor(cuentas: AcreedorCuenta[]): Map<string, AcreedorCuenta[]> {
  const m = new Map<string, AcreedorCuenta[]>()
  for (const c of cuentas) {
    const lista = m.get(c.proveedor_id)
    if (lista) lista.push(c)
    else m.set(c.proveedor_id, [c])
  }
  for (const [k, v] of m) m.set(k, ordenarCuentasAcreedor(v))
  return m
}
