// Valuación única de un retiro de socio para evitar doble conteo.
//
// Un retiro puede estar:
//  - En USD: dolarizado al cerrar el mes (`convertido_at` seteado → vale por `monto_usd_calculado`),
//    o cargado directamente en USD (`monto_usd` != 0).
//  - En ARS todavía sin dolarizar (`monto_pesos`), cuando el mes no se cerró/convirtió.
//
// Regla: si está en USD, vale por ese USD (su `monto_pesos` queda solo como origen histórico,
// NO se suma aparte). Si no, vale por su ARS. Nunca los dos a la vez.
//
// OJO: un retiro dolarizado puede ser NEGATIVO (devolución/reintegro), así que NO se puede usar
// "usd > 0" para decidir si está dolarizado — hay que mirar el estado de conversión.

type RetiroMonto = {
  monto_pesos?: number | null
  monto_usd?: number | null
  monto_usd_calculado?: number | null
  convertido_at?: string | null
}

/** ¿El retiro se valúa en USD? Dolarizado en el cierre, o cargado nativo en USD. */
export function retiroEsUsd(r: RetiroMonto): boolean {
  return r.convertido_at != null || Number(r.monto_usd ?? 0) !== 0
}

/** USD del retiro (0 si sigue en ARS puro). Puede ser negativo (devolución). */
export function valorRetiroUsd(r: RetiroMonto): number {
  if (!retiroEsUsd(r)) return 0
  return Number(r.monto_usd_calculado ?? 0) || Number(r.monto_usd ?? 0)
}

/** ARS del retiro que TODAVÍA cuenta (0 si ya está dolarizado → cuenta en USD). */
export function valorRetiroArs(r: RetiroMonto): number {
  return retiroEsUsd(r) ? 0 : Number(r.monto_pesos ?? 0)
}
