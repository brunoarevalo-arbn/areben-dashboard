// Gastos comerciales del ERP (comisiones de plataformas, impuestos, envío de devoluciones…): lo que cuesta VENDER.
// Los carga el ERP del Monitor; acá sólo se interpreta lo que contesta `gastos-puente`.
// ⛔ Nada de esto toca el resultado del cierre: se muestra como dato (Bruno, 28-oct) hasta confirmar que no se duplica con lo cargado a mano.

export type GastosComerciales = {
  marca: 'BDI' | 'ZATTIA'
  total: number
  porTipo: { comision: number; impuesto: number; otro: number }
  comisionAutomatica: number
  /** Cobros con tarjeta/MP cuya ruta no tiene tasa cargada: esas comisiones NO están en el total. */
  cobrosSinComision: number
}

const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null)

/** Valida la respuesta del Monitor. `null` si no tiene la forma esperada (⛔ se inventan ceros: un cero AFIRMA que no hubo gastos). */
export function leerGastosComerciales(marca: GastosComerciales['marca'], d: unknown): GastosComerciales | null {
  const r = d as { total?: unknown; por_tipo?: Record<string, unknown>; comisionAutomatica?: unknown; cobrosSinComision?: unknown } | null
  const total = num(r?.total)
  const comision = num(r?.por_tipo?.comision)
  const impuesto = num(r?.por_tipo?.impuesto)
  const otro = num(r?.por_tipo?.otro)
  const auto = num(r?.comisionAutomatica)
  const sinTasa = num(r?.cobrosSinComision)
  if (total === null || comision === null || impuesto === null || otro === null || auto === null || sinTasa === null) return null
  return { marca, total, porTipo: { comision, impuesto, otro }, comisionAutomatica: auto, cobrosSinComision: sinTasa }
}
