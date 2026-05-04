import { describe, it, expect } from 'vitest'
import { calcularNomina, type AporteConfig } from '@/lib/calc/nomina'

const APORTES_PATRONALES: AporteConfig[] = [
  { tipo: 'PORCENTAJE', valor: 21, aplicable_a: 'BLANCO', es_patronal: true }, // contribución patronal típica
]

describe('calcularNomina BLANCO (modelo simplificado)', () => {
  it('monto_recibo_oficial es el NETO que se paga, no se descuentan aportes', () => {
    const r = calcularNomina({
      esBlanco: true,
      sueldoBasico: 500_000,
      montoReciboOficial: 500_000,
      horasTrabajadas: 160,
      valorHora: 3125,
      horasExtras: 0,
      porcentajeExtras: 50,
      comida: 0,
      asistenciaCompleta: false,
      presentismoPctEmpleado: 0,
      aguinaldoPagadoDeCaja: 0,
      adicionalNoRegistrado: 0,
      correspondeAguinaldo: true,
      porcentajeAguinaldo: 8.33,
      aportes: APORTES_PATRONALES,
    })

    expect(r.neto).toBe(500_000)
    expect(r.subtotal).toBe(500_000)
    expect(r.aportesPatronales).toBe(500_000 * 0.21)
    // Costo empresa = neto + patronales + provisión SAC
    expect(r.costoEmpresa).toBe(r.neto + r.aportesPatronales + r.aguinaldoProvisionado)
  })

  it('aguinaldo se calcula sobre oficial + adicional fijo en negro (NO sobre extras)', () => {
    const r = calcularNomina({
      esBlanco: true,
      sueldoBasico: 500_000,
      montoReciboOficial: 500_000,
      horasTrabajadas: 160,
      valorHora: 3125,
      horasExtras: 20, // extras reales — NO cuentan para aguinaldo
      porcentajeExtras: 50,
      comida: 0,
      asistenciaCompleta: false,
      presentismoPctEmpleado: 0,
      aguinaldoPagadoDeCaja: 0,
      adicionalNoRegistrado: 350_000, // acuerdo fijo en negro
      correspondeAguinaldo: true,
      porcentajeAguinaldo: 8.33,
      aportes: APORTES_PATRONALES,
    })

    // Base aguinaldo = 500k oficial + 350k acuerdo negro = 850k (NO incluye extras)
    expect(r.baseAguinaldo).toBe(850_000)
    expect(r.aguinaldoProvisionado).toBe(Math.round(850_000 * 8.33) / 100)
    // Subtotal = oficial + extras + adicional = 500k + 93750 + 350k
    expect(r.horasExtrasMonto).toBe(93_750)
    expect(r.subtotal).toBe(500_000 + 93_750 + 350_000)
  })

  it('horas extras no afectan la base de aguinaldo', () => {
    const sinExtras = calcularNomina({
      esBlanco: true, sueldoBasico: 500_000, montoReciboOficial: 500_000,
      horasTrabajadas: 160, valorHora: 3125, horasExtras: 0, porcentajeExtras: 50,
      comida: 0, asistenciaCompleta: false, presentismoPctEmpleado: 0,
      aguinaldoPagadoDeCaja: 0, adicionalNoRegistrado: 200_000,
      correspondeAguinaldo: true, porcentajeAguinaldo: 8.33, aportes: [],
    })
    const conExtras = calcularNomina({
      esBlanco: true, sueldoBasico: 500_000, montoReciboOficial: 500_000,
      horasTrabajadas: 160, valorHora: 3125, horasExtras: 50, porcentajeExtras: 50,
      comida: 0, asistenciaCompleta: false, presentismoPctEmpleado: 0,
      aguinaldoPagadoDeCaja: 0, adicionalNoRegistrado: 200_000,
      correspondeAguinaldo: true, porcentajeAguinaldo: 8.33, aportes: [],
    })

    // El aguinaldo es idéntico en ambos casos (sólo depende del fijo)
    expect(conExtras.aguinaldoProvisionado).toBe(sinExtras.aguinaldoProvisionado)
    expect(conExtras.baseAguinaldo).toBe(sinExtras.baseAguinaldo)
    // Pero el subtotal sí cambia (extras se pagan en la nómina)
    expect(conExtras.subtotal).toBeGreaterThan(sinExtras.subtotal)
  })

  it('aportes empleado NO se descuentan del neto (recibo oficial es ya neto)', () => {
    // Configurar aportes_empleado como en el modelo viejo, deberían ignorarse
    const aportesConEmpleado: AporteConfig[] = [
      ...APORTES_PATRONALES,
      { tipo: 'PORCENTAJE', valor: 17, aplicable_a: 'BLANCO', es_patronal: false }, // empleado — debe ignorarse
    ]
    const r = calcularNomina({
      esBlanco: true, sueldoBasico: 500_000, montoReciboOficial: 500_000,
      horasTrabajadas: 160, valorHora: 3125, horasExtras: 0, porcentajeExtras: 50,
      comida: 0, asistenciaCompleta: false, presentismoPctEmpleado: 0,
      aguinaldoPagadoDeCaja: 0, adicionalNoRegistrado: 0,
      correspondeAguinaldo: false, porcentajeAguinaldo: 0,
      aportes: aportesConEmpleado,
    })
    // Neto = 500k completo. Si se descontaran aportes, sería 500k - 85k = 415k
    expect(r.neto).toBe(500_000)
  })
})

describe('calcularNomina NEGRO', () => {
  it('NEGRO sin aportes → neto = subtotal', () => {
    const r = calcularNomina({
      esBlanco: false, sueldoBasico: 400_000, montoReciboOficial: 0,
      horasTrabajadas: 160, valorHora: 2500, horasExtras: 0, porcentajeExtras: 50,
      comida: 30_000, asistenciaCompleta: false, presentismoPctEmpleado: 5,
      aguinaldoPagadoDeCaja: 0, adicionalNoRegistrado: 0,
      correspondeAguinaldo: true, porcentajeAguinaldo: 8.33, aportes: [],
    })

    expect(r.subtotal).toBe(430_000)
    expect(r.neto).toBe(430_000)
    expect(r.aportesPatronales).toBe(0)
    // Aguinaldo solo sobre el básico (no hay adicional)
    expect(r.baseAguinaldo).toBe(400_000)
  })

  it('NEGRO con asistencia completa cobra presentismo', () => {
    const r = calcularNomina({
      esBlanco: false, sueldoBasico: 400_000, montoReciboOficial: 0,
      horasTrabajadas: 160, valorHora: 2500, horasExtras: 0, porcentajeExtras: 50,
      comida: 0, asistenciaCompleta: true, presentismoPctEmpleado: 5,
      aguinaldoPagadoDeCaja: 0, adicionalNoRegistrado: 0,
      correspondeAguinaldo: false, porcentajeAguinaldo: 0, aportes: [],
    })

    expect(r.presentismo).toBe(20_000)
    expect(r.subtotal).toBe(420_000)
  })

  it('BLANCO no cobra presentismo aunque tenga asistencia completa', () => {
    const r = calcularNomina({
      esBlanco: true, sueldoBasico: 500_000, montoReciboOficial: 500_000,
      horasTrabajadas: 160, valorHora: 3125, horasExtras: 0, porcentajeExtras: 50,
      comida: 0, asistenciaCompleta: true, presentismoPctEmpleado: 10,
      aguinaldoPagadoDeCaja: 0, adicionalNoRegistrado: 0,
      correspondeAguinaldo: false, porcentajeAguinaldo: 0, aportes: APORTES_PATRONALES,
    })
    expect(r.presentismo).toBe(0)
  })
})

describe('calcularNomina ausencias y aguinaldo', () => {
  it('ausencias descuentan del subtotal pero NO afectan la base del aguinaldo', () => {
    const r = calcularNomina({
      esBlanco: true, sueldoBasico: 500_000, montoReciboOficial: 500_000,
      horasTrabajadas: 160, valorHora: 3125,
      horasExtras: 0, porcentajeExtras: 50, comida: 0,
      asistenciaCompleta: false, presentismoPctEmpleado: 0,
      aguinaldoPagadoDeCaja: 0, adicionalNoRegistrado: 200_000,
      ausenciasHoras: 16, // 2 días faltados
      correspondeAguinaldo: true, porcentajeAguinaldo: 8.33, aportes: [],
    })

    // Descuento = 16 hs × 3125 = 50_000
    expect(r.ausenciasDescuento).toBe(50_000)
    // Subtotal = oficial + adicional - ausencias = 500k + 200k - 50k
    expect(r.subtotal).toBe(650_000)
    // Aguinaldo NO se ve afectado por las ausencias — sigue sobre fijo total
    expect(r.baseAguinaldo).toBe(700_000)
  })

  it('si NO corresponde aguinaldo → provisión = 0', () => {
    const r = calcularNomina({
      esBlanco: false, sueldoBasico: 400_000, montoReciboOficial: 0,
      horasTrabajadas: 160, valorHora: 2500, horasExtras: 0, porcentajeExtras: 50,
      comida: 0, asistenciaCompleta: false, presentismoPctEmpleado: 0,
      aguinaldoPagadoDeCaja: 0, adicionalNoRegistrado: 0,
      correspondeAguinaldo: false, porcentajeAguinaldo: 8.33, aportes: [],
    })
    expect(r.aguinaldoProvisionado).toBe(0)
  })
})
