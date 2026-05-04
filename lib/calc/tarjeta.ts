/**
 * Cálculos puros relativos a tarjetas de crédito.
 * Sin dependencias externas — testeable directo.
 */

/**
 * Calcula los meses de cierre y vencimiento de una compra/cuota con tarjeta.
 * Si la fecha es ANTES del día de cierre del mes → cierre = mes actual.
 * Si es DESPUÉS o IGUAL → cierre = mes siguiente.
 * El vencimiento siempre cae en el mes posterior al cierre.
 */
export function calcularMesesTarjeta(fechaCompra: string, diaCierre: number): {
  mesCierre: string
  mesVenc: string
} {
  const f = new Date(fechaCompra + 'T00:00:00')
  const dia = f.getDate()
  const mesCierre = new Date(f.getFullYear(), f.getMonth() + (dia >= diaCierre ? 1 : 0), 1)
  const mesVenc = new Date(mesCierre.getFullYear(), mesCierre.getMonth() + 1, 1)
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
export function calcularMesesCuotas(fechaCompra: string, diaCierre: number, cuotasTotal: number): {
  mesCierre: string
  mesVencimiento: string
}[] {
  const { mesCierre } = calcularMesesTarjeta(fechaCompra, diaCierre)
  return Array.from({ length: cuotasTotal }, (_, i) => {
    const mesC = new Date(mesCierre + '-01T00:00:00')
    mesC.setMonth(mesC.getMonth() + i)
    const mesV = new Date(mesC.getFullYear(), mesC.getMonth() + 1, 1)
    return {
      mesCierre: `${mesC.getFullYear()}-${String(mesC.getMonth() + 1).padStart(2, '0')}`,
      mesVencimiento: `${mesV.getFullYear()}-${String(mesV.getMonth() + 1).padStart(2, '0')}`,
    }
  })
}
