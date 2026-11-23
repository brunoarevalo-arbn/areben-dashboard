/**
 * Cálculos puros relativos a tarjetas de crédito.
 * Sin dependencias externas — testeable directo.
 */

/**
 * ¿El resumen vence en el MISMO mes en que cierra?
 * Si el día de vencimiento cae después del de cierre, sí (ej. Mercado Pago: cierra 12, vence 17).
 * Si cae antes, el vencimiento es el mes siguiente (ej. Galicia: cierra 30, vence 10).
 * Sin dato de vencimiento se asume el mes siguiente, que era el comportamiento histórico.
 */
function venceMismoMes(diaCierre: number, diaVencimiento?: number | null): boolean {
  return diaVencimiento != null && diaVencimiento > diaCierre
}

/**
 * Calcula los meses de cierre y vencimiento de una compra/cuota con tarjeta.
 * Si la fecha es ANTES del día de cierre del mes → cierre = mes actual.
 * Si es DESPUÉS o IGUAL → cierre = mes siguiente.
 * El vencimiento cae en el mismo mes del cierre o en el siguiente, según la tarjeta
 * (ver `venceMismoMes`).
 */
export function calcularMesesTarjeta(fechaCompra: string, diaCierre: number, diaVencimiento?: number | null): {
  mesCierre: string
  mesVenc: string
} {
  const f = new Date(fechaCompra + 'T00:00:00')
  const dia = f.getDate()
  const mesCierre = new Date(f.getFullYear(), f.getMonth() + (dia >= diaCierre ? 1 : 0), 1)
  const offset = venceMismoMes(diaCierre, diaVencimiento) ? 0 : 1
  const mesVenc = new Date(mesCierre.getFullYear(), mesCierre.getMonth() + offset, 1)
  return {
    mesCierre: `${mesCierre.getFullYear()}-${String(mesCierre.getMonth() + 1).padStart(2, '0')}`,
    mesVenc: `${mesVenc.getFullYear()}-${String(mesVenc.getMonth() + 1).padStart(2, '0')}`,
  }
}

/**
 * Distribuye un total en N cuotas, ajustando la última para que la suma cierre exacta.
 */
export function calcularMontosCuota(montoTotal: number, cuotasTotal: number): number[] {
  if (cuotasTotal < 1) return []
  const montoCuota = Math.round((montoTotal / cuotasTotal) * 100) / 100
  return Array.from({ length: cuotasTotal }, (_, i) => {
    if (i === cuotasTotal - 1) {
      return Math.round((montoTotal - montoCuota * (cuotasTotal - 1)) * 100) / 100
    }
    return montoCuota
  })
}

/**
 * Genera los meses de cierre/venc para N cuotas a partir de la fecha base.
 */
export function calcularMesesCuotas(fechaCompra: string, diaCierre: number, cuotasTotal: number, diaVencimiento?: number | null): {
  mesCierre: string
  mesVencimiento: string
}[] {
  const { mesCierre } = calcularMesesTarjeta(fechaCompra, diaCierre, diaVencimiento)
  const offset = venceMismoMes(diaCierre, diaVencimiento) ? 0 : 1
  return Array.from({ length: cuotasTotal }, (_, i) => {
    const mesC = new Date(mesCierre + '-01T00:00:00')
    mesC.setMonth(mesC.getMonth() + i)
    const mesV = new Date(mesC.getFullYear(), mesC.getMonth() + offset, 1)
    return {
      mesCierre: `${mesC.getFullYear()}-${String(mesC.getMonth() + 1).padStart(2, '0')}`,
      mesVencimiento: `${mesV.getFullYear()}-${String(mesV.getMonth() + 1).padStart(2, '0')}`,
    }
  })
}

/** Desde qué mes el cierre cuenta las cuotas como deuda con el arreglo (los meses anteriores ya estaban cerrados). */
export const DESDE_MES_CONSUMO_TARJETA = '2026-09'

/**
 * Mes en que una cuota de tarjeta pasa a ser DEUDA en el cierre: el mes del consumo para la
 * cuota 1, el siguiente para la 2, etc. No se usa `mes_cierre` porque es el mes en que cierra el
 * RESUMEN: lo consumido después del cierre (MP cierra el 12, Macro el 22-24) no figuraba como
 * deuda en su mes. Sin fecha del consumo (cuotas históricas cargadas a mano) se queda con
 * `mes_cierre`, y nunca da un mes POSTERIOR a ese.
 */
export function mesDeudaCuota(c: { mes_cierre: string; cuota_numero: number }, fechaConsumo: string | null | undefined): string {
  if (!fechaConsumo || !/^\d{4}-\d{2}/.test(fechaConsumo)) return c.mes_cierre
  const [y, m] = fechaConsumo.slice(0, 7).split('-').map(Number)
  const d = new Date(y, m - 1 + Math.max(0, (c.cuota_numero || 1) - 1), 1)
  const mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  return mes < c.mes_cierre ? mes : c.mes_cierre
}
