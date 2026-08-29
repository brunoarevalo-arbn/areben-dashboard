import { describe, it, expect } from 'vitest'
import { renderToBuffer } from '@react-pdf/renderer'
import { ReporteProyeccionPDF, type ReporteProyeccionData } from '@/lib/pdf/reporte-proyeccion'
import React from 'react'

// El ciclo nuevo de Fredy: renovado el 01/09 con 49.320.000 y un aporte de 108.000 el mismo día.
const BASE: ReporteProyeccionData = {
  empresa: {
    razon_social: 'Areben S.R.L.', nombre_fantasia: 'Areben', cuit: '30-11111111-1',
    condicion_iva: 'Responsable Inscripto', domicilio_calle: 'Av. Siempreviva 742',
    domicilio_ciudad: 'Buenos Aires', domicilio_provincia: 'CABA', domicilio_cp: '1000',
    email: 'info@arebensrl.com', telefono: '11-4444-5555', sitio_web: null,
  },
  inversor: {
    nombre: 'Fredy Arevalo', tipo: 'persona_fisica', dni: '20111222', cuit: null,
    domicilio_calle: 'Calle Falsa 123', domicilio_ciudad: 'Buenos Aires',
    domicilio_provincia: 'CABA', domicilio_cp: '1000', email: null,
  },
  instrumento: {
    codigo: 'INV-001', moneda: 'ARS', capital_inicial: 49_320_000, tasa_mensual: 0.032,
    capitalizable: false, fecha_inicio: '2026-09-01', plazo_dias: 91,
    fecha_vencimiento: '2026-12-01',
  },
  proyeccion: [
    { mes_num: 1, fecha_inicio: '2026-09-01', fecha_fin: '2026-09-30', saldo_inicio: 49_428_000, interes_devengado: 1_581_696, saldo_cierre: 51_009_696 },
    { mes_num: 2, fecha_inicio: '2026-10-01', fecha_fin: '2026-10-31', saldo_inicio: 49_428_000, interes_devengado: 1_581_696, saldo_cierre: 52_591_392 },
    { mes_num: 3, fecha_inicio: '2026-11-01', fecha_fin: '2026-11-30', saldo_inicio: 49_428_000, interes_devengado: 1_581_696, saldo_cierre: 54_173_088 },
  ],
  movimientos: [{ fecha: '2026-09-01', etiqueta: 'Aporte', monto: 108_000 }],
  totales: {
    capital_inicial: 49_320_000, neto_movimientos: 108_000, capital_invertido: 49_428_000,
    total_intereses: 4_745_088, capital_final: 49_428_000, total_a_cobrar: 54_173_088,
  },
  generadoEn: '2026-08-29T12:00:00.000Z',
  ciudadEmision: 'Buenos Aires',
}

describe('PDF de proyección', () => {
  it('renderiza con la sección de movimientos', async () => {
    const buf = await renderToBuffer(<ReporteProyeccionPDF data={BASE} />)
    expect(buf.length).toBeGreaterThan(1000)
  })

  it('sigue renderizando sin movimientos (instrumento sin aportes)', async () => {
    const sinMovs = { ...BASE, movimientos: [], totales: { ...BASE.totales, neto_movimientos: 0, capital_invertido: 49_320_000 } }
    const buf = await renderToBuffer(<ReporteProyeccionPDF data={sinMovs} />)
    expect(buf.length).toBeGreaterThan(1000)
  })

  it('el PDF con movimientos pesa más que el que no los tiene: la sección se dibuja', async () => {
    const sinMovs = { ...BASE, movimientos: [] }
    const conMovs = await renderToBuffer(<ReporteProyeccionPDF data={BASE} />)
    const vacio = await renderToBuffer(<ReporteProyeccionPDF data={sinMovs} />)
    expect(conMovs.length).toBeGreaterThan(vacio.length)
  })

  it('el campo movimientos es opcional: los llamadores viejos no rompen', async () => {
    const viejo = { ...BASE }
    delete (viejo as { movimientos?: unknown }).movimientos
    const buf = await renderToBuffer(<ReporteProyeccionPDF data={viejo} />)
    expect(buf.length).toBeGreaterThan(1000)
  })
})
