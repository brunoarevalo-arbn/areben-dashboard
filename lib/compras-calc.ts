// Helpers de valuación de compras.
//
// Las compras pueden estar en ARS o USD. El saldo (deuda con el proveedor) se conserva
// en su moneda y el cierre lo dolariza aparte. Pero para VALUAR (neto que sube el
// inventario / CMV / producción), todo tiene que estar en pesos.
//
// `netoCompraARS` devuelve el neto (monto_total − iva) en ARS: si la compra es en USD y
// tiene tipo de cambio cargado, lo pesifica; en cualquier otro caso (ARS, o USD sin TC)
// devuelve el neto tal cual (mismo comportamiento que antes → sin regresión).

export interface CompraMonto {
  monto_total: number | string
  iva: number | string
  moneda?: string | null
  tipo_cambio?: number | string | null
}

export function netoCompraARS(c: CompraMonto): number {
  const neto = Number(c.monto_total) - Number(c.iva)
  const tc = Number(c.tipo_cambio)
  return c.moneda === 'USD' && tc > 0 ? neto * tc : neto
}
