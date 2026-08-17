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
    { mes: '2026-06', saldo_inicio: 45000000, interes_devengado: 1408695.65, movimiento: -1000, saldo_cierre: 46407695.65 },
    {
      mes: '2026-07', saldo_inicio: 46408695.65, interes_devengado: 1361739.13, movimiento: -5000000, saldo_cierre: 42770434.78,
      tramos: [
        { desde: '2026-07-01', hasta: '2026-07-13', dias: 13, base: 46408695.65, interes: 730303.03 },
        { desde: '2026-07-14', hasta: '2026-07-31', dias: 18, base: 41408695.65, interes: 631436.10 },
      ],
    },
    { mes: '2026-08', saldo_inicio: 42770434.78, interes_devengado: 1293913.05, movimiento: 0, saldo_cierre: 44063347.83 },
  ],
  movimientos: [
    { fecha: '2026-07-14', mes: '2026-07', monto: -5000000, motivo: 'retiro_parcial', nota: 'Se lo llevó para la obra', interesResignado: 255652.17 },
    { fecha: null, mes: '2026-06', monto: -1000, motivo: 'ajuste', nota: 'Movimiento viejo sin día' },
  ],
  totales: { intereses: 4064347.83, movimientosNetos: -5001000, saldoActual: 44063347.83 },
  tasaAnual: 0.4593,
  mostrar: { tna: true, capitalizacion: true },
  fechaSaldo: '2026-09-01',
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
      <FichaPlazoFijoPDF data={{ ...DATA_FICHA, detalle: [], movimientos: [], fechaSaldo: null, totales: { intereses: 0, movimientosNetos: 0, saldoActual: 45000000 } }} />,
    )
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-')
  })

  // No se puede buscar el texto adentro del PDF: react-pdf embebe las fuentes y las
  // letras quedan como glifos, no como texto. Se verifica que el selector tenga
  // efecto — que saque contenido — y el resultado se mira a ojo al cambiarlo.
  it('ocultar la tasa anual y la capitalización achica la ficha', async () => {
    const completa = await renderToBuffer(<FichaPlazoFijoPDF data={DATA_FICHA} />)
    const recortada = await renderToBuffer(
      <FichaPlazoFijoPDF data={{ ...DATA_FICHA, mostrar: { tna: false, capitalizacion: false } }} />,
    )
    expect(recortada.subarray(0, 5).toString()).toBe('%PDF-')
    expect(recortada.length).toBeLessThan(completa.length)
  })

  it('cada opción por separado también cambia el resultado', async () => {
    const render = (tna: boolean, capitalizacion: boolean) =>
      renderToBuffer(<FichaPlazoFijoPDF data={{ ...DATA_FICHA, mostrar: { tna, capitalizacion } }} />)
    const [ambas, soloTna, soloCap, ninguna] = await Promise.all([
      render(true, true), render(true, false), render(false, true), render(false, false),
    ])
    const tamaños = [ambas.length, soloTna.length, soloCap.length, ninguna.length]
    expect(new Set(tamaños).size).toBe(4) // las cuatro combinaciones dan algo distinto
    expect(ninguna.length).toBeLessThan(ambas.length)
  })

  it('un plazo cerrado también se dibuja', async () => {
    const buffer = await renderToBuffer(
      <FichaPlazoFijoPDF data={{ ...DATA_FICHA, instrumento: { ...DATA_FICHA.instrumento, estado: 'cerrado' } }} />,
    )
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-')
  })
})
