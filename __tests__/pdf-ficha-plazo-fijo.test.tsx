import { describe, it, expect } from 'vitest'
import { renderToBuffer } from '@react-pdf/renderer'
import { FichaPlazoFijoPDF, type FichaPlazoFijoData } from '@/lib/pdf/ficha-plazo-fijo'
import React from 'react'

// Datos del plazo real de Fredy, con un retiro a mitad de período.
export const DATA_FICHA: FichaPlazoFijoData = {
  empresa: {
    razon_social: 'Areben S.R.L.',
    nombre_fantasia: 'Areben',
    cuit: '30-11111111-1',
    condicion_iva: 'Responsable Inscripto',
    domicilio_calle: 'Av. Siempreviva 742',
    domicilio_ciudad: 'Buenos Aires',
    domicilio_provincia: 'CABA',
    domicilio_cp: '1000',
    email: 'info@arebensrl.com',
    telefono: '11-4444-5555',
    sitio_web: null,
  },
  inversor: {
    nombre: 'Fredy Arevalo',
    tipo: 'persona_fisica',
    dni: '20111222',
    cuit: null,
    domicilio_calle: 'Calle Falsa 123',
    domicilio_ciudad: 'Buenos Aires',
    domicilio_provincia: 'CABA',
    domicilio_cp: '1000',
    email: null,
  },
  instrumento: {
    codigo: 'INV-001',
    moneda: 'ARS',
    capital_inicial: 45000000,
    tasa_mensual: 0.032,
    capitalizable: false,
    fecha_inicio: '2026-06-01',
    fecha_fin: '2026-09-01',
    plazo_dias: 90,
    estado: 'activo',
  },
  detalle: [
    { mes: '2026-06', saldo_inicio: 45000000, interes_devengado: 1408695.65, movimiento: -1000, saldo_cierre: 46407695.65, cerrado: true },
    { mes: '2026-07', saldo_inicio: 46408695.65, interes_devengado: 1361739.13, movimiento: -5000000, saldo_cierre: 42770434.78, cerrado: false },
    { mes: '2026-08', saldo_inicio: 42770434.78, interes_devengado: 1293913.05, movimiento: 0, saldo_cierre: 44063347.83, cerrado: false },
  ],
  movimientos: [
    { fecha: '2026-07-14', mes: '2026-07', monto: -5000000, motivo: 'retiro_parcial', nota: 'Se lo llevó para la obra' },
    { fecha: null, mes: '2026-06', monto: -1000, motivo: 'ajuste', nota: 'Movimiento viejo sin día' },
  ],
  totales: { intereses: 4064347.83, movimientosNetos: -5001000, saldoActual: 44063347.83 },
  generadoEn: '2026-08-14T12:00:00.000Z',
}

describe('la ficha del plazo fijo se dibuja entera', () => {
  it('genera un PDF válido', async () => {
    const buffer = await renderToBuffer(<FichaPlazoFijoPDF data={DATA_FICHA} />)
    expect(buffer.length).toBeGreaterThan(1000)
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-')
  })

  it('entra en una sola hoja', async () => {
    // La trampa de react-pdf 4.5: si se cuela un <Text render={...}>, el bloque que lo
    // contiene no se dibuja y puede aparecer una hoja de más casi vacía.
    const buffer = await renderToBuffer(<FichaPlazoFijoPDF data={DATA_FICHA} />)
    const paginas = (buffer.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length
    expect(paginas).toBe(1)
  })

  it('no se rompe cuando el plazo todavía no tiene meses ni movimientos', async () => {
    const buffer = await renderToBuffer(
      <FichaPlazoFijoPDF data={{ ...DATA_FICHA, detalle: [], movimientos: [], totales: { intereses: 0, movimientosNetos: 0, saldoActual: 45000000 } }} />,
    )
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-')
  })

  it('un plazo cerrado también se dibuja', async () => {
    const buffer = await renderToBuffer(
      <FichaPlazoFijoPDF data={{ ...DATA_FICHA, instrumento: { ...DATA_FICHA.instrumento, estado: 'cerrado' } }} />,
    )
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-')
  })
})
