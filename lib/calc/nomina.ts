/**
 * Cálculo puro de subtotal, neto y costo empresa de una nómina.
 * Modelo simplificado:
 * - Para BLANCO: monto_recibo_oficial es el NETO que se paga del recibo (no se descuentan aportes empleado).
 * - Para NEGRO: sueldo_basico es el total mensual.
 * - Aguinaldo se provisiona sobre el sueldo FIJO mensual (oficial + adicional fijo en negro).
 *   Las horas extras reales NO suman a la base del aguinaldo.
 * - Aportes patronales (es_patronal=true) son las cargas sociales que paga la empresa.
 */

export interface AporteConfig {
  tipo: 'PORCENTAJE' | 'MONTO_FIJO'
  valor: number
  aplicable_a: 'BLANCO' | 'NEGRO' | 'AMBOS'
  es_patronal: boolean
}

export interface CalcNominaInput {
  esBlanco: boolean
  sueldoBasico: number
  montoReciboOficial: number
  horasTrabajadas: number
  valorHora: number
  horasExtras: number
  porcentajeExtras: number
  comida: number
  asistenciaCompleta: boolean
  presentismoPctEmpleado: number
  aguinaldoPagadoDeCaja: number
  /** Monto fijo en negro (parte del acuerdo) — suma a la base del aguinaldo */
  adicionalNoRegistrado: number
  /** Horas faltadas este mes — descuento sobre el subtotal */
  ausenciasHoras?: number
  /** Bono / premio / comisión puntual del mes — NO afecta aguinaldo */
  bonoMonto?: number
  /** Descuento otro (multa, devolución, etc.) — NO afecta aguinaldo */
  descuentoOtroMonto?: number
  correspondeAguinaldo: boolean
  porcentajeAguinaldo: number
  aportes: AporteConfig[]
}

export interface CalcNominaOutput {
  basicoEfectivo: number
  horasExtrasMonto: number
  presentismo: number
  ausenciasDescuento: number
  baseAguinaldo: number
  aguinaldoProvisionado: number
  subtotal: number
  aportesPatronales: number
  neto: number
  costoEmpresa: number
  valorHoraReal: number
}

export function calcularNomina(input: CalcNominaInput): CalcNominaOutput {
  const tipoEmpleado = input.esBlanco ? 'BLANCO' : 'NEGRO'

  const basicoEfectivo = input.esBlanco && input.montoReciboOficial > 0
    ? input.montoReciboOficial
    : input.sueldoBasico

  const horasExtrasMonto = input.horasExtras * input.valorHora * (1 + input.porcentajeExtras / 100)

  // Presentismo solo para NEGRO con asistencia completa
  const presentismo = !input.esBlanco && input.asistenciaCompleta
    ? Math.round(basicoEfectivo * input.presentismoPctEmpleado) / 100
    : 0

  const ausenciasDescuento = (input.ausenciasHoras ?? 0) * input.valorHora

  // Base aguinaldo = sueldo FIJO mensual (oficial + adicional fijo en negro).
  // No incluye extras reales, comida, presentismo (variables).
  const baseAguinaldo = basicoEfectivo + input.adicionalNoRegistrado
  const aguinaldoProvisionado = input.correspondeAguinaldo
    ? Math.round(baseAguinaldo * input.porcentajeAguinaldo) / 100
    : 0

  const subtotal = basicoEfectivo + horasExtrasMonto + input.comida
    + presentismo + input.aguinaldoPagadoDeCaja + input.adicionalNoRegistrado - ausenciasDescuento
    + (input.bonoMonto ?? 0) - (input.descuentoOtroMonto ?? 0)

  // Aportes patronales sobre el bruto del recibo oficial (BLANCO) o el básico fijo (NEGRO)
  const baseAportesPatronales = input.esBlanco && input.montoReciboOficial > 0
    ? input.montoReciboOficial
    : basicoEfectivo
  let aportesPatronales = 0
  for (const a of input.aportes) {
    if (!a.es_patronal) continue
    if (a.aplicable_a !== 'AMBOS' && a.aplicable_a !== tipoEmpleado) continue
    const monto = a.tipo === 'PORCENTAJE' ? (baseAportesPatronales * a.valor) / 100 : a.valor
    aportesPatronales += monto
  }

  // Neto = subtotal (lo que efectivamente se paga al empleado)
  const neto = subtotal
  // Costo empresa = neto + cargas sociales + provisión SAC
  const costoEmpresa = neto + aportesPatronales + aguinaldoProvisionado

  const valorHoraReal = input.horasTrabajadas > 0 && input.montoReciboOficial > 0
    ? input.montoReciboOficial / input.horasTrabajadas
    : input.valorHora

  return {
    basicoEfectivo,
    horasExtrasMonto: Math.round(horasExtrasMonto * 100) / 100,
    presentismo: Math.round(presentismo * 100) / 100,
    ausenciasDescuento: Math.round(ausenciasDescuento * 100) / 100,
    baseAguinaldo: Math.round(baseAguinaldo * 100) / 100,
    aguinaldoProvisionado: Math.round(aguinaldoProvisionado * 100) / 100,
    subtotal: Math.round(subtotal * 100) / 100,
    aportesPatronales: Math.round(aportesPatronales * 100) / 100,
    neto: Math.round(neto * 100) / 100,
    costoEmpresa: Math.round(costoEmpresa * 100) / 100,
    valorHoraReal: Math.round(valorHoraReal * 100) / 100,
  }
}
