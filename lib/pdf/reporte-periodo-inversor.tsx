/**
 * Comprobante formal de devengamiento de intereses — apto para compartir
 * con el inversor / acreedor externo.
 *
 * Diferencias con reporte-periodo.tsx (interno):
 * - Encabezado con datos formales de la empresa (configuracion_empresa).
 * - Bloque destinatario con datos formales del inversor.
 * - Sin jerga interna (no muestra subcategoría, ID de gasto, "auto-generado").
 * - Texto formal de apertura y cierre, lugar/fecha de emisión, espacio para firma.
 */
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import React from 'react'

export interface ReporteInversorData {
  empresa: {
    razon_social: string
    nombre_fantasia: string | null
    cuit: string | null
    condicion_iva: string | null
    domicilio_calle: string | null
    domicilio_ciudad: string | null
    domicilio_provincia: string | null
    domicilio_cp: string | null
    domicilio_pais: string | null
    email: string | null
    telefono: string | null
    sitio_web: string | null
  }
  inversor: {
    nombre: string
    tipo: 'persona_fisica' | 'empresa'
    dni: string | null
    cuit: string | null
    domicilio_calle: string | null
    domicilio_ciudad: string | null
    domicilio_provincia: string | null
    domicilio_cp: string | null
    email: string | null
  }
  instrumento: {
    codigo: string | null
    moneda: 'ARS' | 'USD'
    capitalizable: boolean
    tipo: 'INVERSION_PRIVADA' | 'CREDITO_BANCARIO'
    fecha_inicio: string
  }
  periodo: {
    mes: string
    saldo_inicio: number
    interes_devengado: number
    movimiento: number
    saldo_cierre: number
  }
  tasa_aplicada: number
  generadoEn: string
  /** Ciudad de emisión para la fórmula "En X, a Y de Z de N". Default = domicilio de empresa */
  ciudadEmision?: string
}

const COLOR_PRIMARY = '#0b3d91'
const COLOR_ACCENT = '#c97a00'
const COLOR_TEXT = '#1a1a1a'
const COLOR_MUTED = '#666666'
const COLOR_BORDER = '#d6d0c4'

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    padding: 40,
    paddingBottom: 80,
    color: COLOR_TEXT,
    lineHeight: 1.4,
  },
  // ── Encabezado empresa ──
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 2,
    borderBottomColor: COLOR_PRIMARY,
    paddingBottom: 12,
    marginBottom: 18,
  },
  empresaBlock: {
    flexDirection: 'column',
    maxWidth: '60%',
  },
  empresaName: {
    fontSize: 16,
    fontWeight: 700,
    color: COLOR_PRIMARY,
  },
  empresaFantasia: {
    fontSize: 9,
    color: COLOR_MUTED,
    marginTop: 1,
  },
  empresaData: {
    fontSize: 8,
    color: COLOR_TEXT,
    marginTop: 6,
    lineHeight: 1.5,
  },
  emisionBlock: {
    flexDirection: 'column',
    alignItems: 'flex-end',
  },
  emisionLabel: {
    fontSize: 7,
    color: COLOR_MUTED,
    letterSpacing: 1,
  },
  emisionCiudad: {
    fontSize: 10,
    color: COLOR_TEXT,
    marginTop: 4,
    fontWeight: 700,
  },
  emisionFecha: {
    fontSize: 9,
    color: COLOR_TEXT,
    marginTop: 2,
  },
  // ── Título ──
  title: {
    fontSize: 16,
    fontWeight: 700,
    color: COLOR_TEXT,
    textAlign: 'center',
    marginVertical: 14,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 11,
    color: COLOR_MUTED,
    textAlign: 'center',
    marginBottom: 18,
  },
  // ── Destinatario ──
  destBox: {
    borderWidth: 1,
    borderColor: COLOR_BORDER,
    borderRadius: 4,
    padding: 12,
    marginBottom: 18,
  },
  destLabel: {
    fontSize: 8,
    color: COLOR_MUTED,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  destNombre: {
    fontSize: 12,
    fontWeight: 700,
    color: COLOR_TEXT,
  },
  destData: {
    fontSize: 9,
    color: COLOR_TEXT,
    marginTop: 6,
    lineHeight: 1.5,
  },
  // ── Texto narrativo ──
  paragraph: {
    fontSize: 10,
    color: COLOR_TEXT,
    marginBottom: 12,
    textAlign: 'justify',
    lineHeight: 1.5,
  },
  // ── Tabla de detalle ──
  tableTitle: {
    fontSize: 10,
    fontWeight: 700,
    color: COLOR_PRIMARY,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 4,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    borderBottomWidth: 0.5,
    borderBottomColor: COLOR_BORDER,
  },
  tableLabel: {
    width: '55%',
    color: COLOR_MUTED,
    fontSize: 10,
  },
  tableValue: {
    flex: 1,
    color: COLOR_TEXT,
    fontFamily: 'Courier',
    textAlign: 'right',
    fontSize: 10,
  },
  tableValueStrong: {
    flex: 1,
    color: COLOR_TEXT,
    fontFamily: 'Courier',
    textAlign: 'right',
    fontSize: 11,
    fontWeight: 700,
  },
  totalRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    marginTop: 4,
    borderTopWidth: 1.5,
    borderTopColor: COLOR_PRIMARY,
  },
  totalLabel: {
    width: '55%',
    color: COLOR_TEXT,
    fontWeight: 700,
    fontSize: 11,
  },
  // ── Firma ──
  firmaContainer: {
    marginTop: 36,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  firmaBox: {
    width: 220,
    alignItems: 'center',
  },
  firmaLinea: {
    borderTopWidth: 0.5,
    borderTopColor: COLOR_TEXT,
    width: '100%',
    marginBottom: 4,
    marginTop: 50,
  },
  firmaLabel: {
    fontSize: 9,
    color: COLOR_MUTED,
  },
  firmaNombre: {
    fontSize: 9,
    color: COLOR_TEXT,
    marginTop: 1,
  },
  // ── Aviso de datos incompletos ──
  warningBox: {
    backgroundColor: '#fff7eb',
    borderLeftWidth: 3,
    borderLeftColor: COLOR_ACCENT,
    padding: 10,
    marginBottom: 14,
    fontSize: 9,
    color: COLOR_TEXT,
  },
  // ── Footer ──
  footer: {
    position: 'absolute',
    bottom: 28,
    left: 40,
    right: 40,
    borderTopWidth: 0.5,
    borderTopColor: COLOR_BORDER,
    paddingTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7,
    color: COLOR_MUTED,
  },
})

// ============ Helpers (idéntica lógica al reporte interno) ============

function formatMoney(amount: number, currency: 'ARS' | 'USD'): string {
  const symbol = currency === 'USD' ? 'U$S' : '$'
  return `${symbol} ${amount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatPercent(rate: number): string {
  return `${(rate * 100).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} %`
}

function formatMonthLong(yyyyMM: string): string {
  const [y, m] = yyyyMM.split('-').map(Number)
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  return `${meses[m - 1]} de ${y}`
}

function fechaInicioMes(yyyyMM: string): string {
  return `01/${yyyyMM.slice(5, 7)}/${yyyyMM.slice(0, 4)}`
}

function fechaFinMes(yyyyMM: string): string {
  const [y, m] = yyyyMM.split('-').map(Number)
  const ultimo = new Date(y, m, 0).getDate()
  return `${String(ultimo).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`
}

function diasDelMes(yyyyMM: string): number {
  const [y, m] = yyyyMM.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

function formatFechaLarga(iso: string): string {
  const d = new Date(iso)
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`
}

function buildEmpresaDomicilio(e: ReporteInversorData['empresa']): string {
  const partes = [e.domicilio_calle, e.domicilio_ciudad, e.domicilio_provincia, e.domicilio_cp].filter(Boolean)
  return partes.join(', ')
}

function buildInversorDomicilio(i: ReporteInversorData['inversor']): string {
  const partes = [i.domicilio_calle, i.domicilio_ciudad, i.domicilio_provincia, i.domicilio_cp].filter(Boolean)
  return partes.join(', ')
}

// ============ Componente ============

export function ReporteInversorPDF({ data }: { data: ReporteInversorData }) {
  const { empresa, inversor, instrumento, periodo, tasa_aplicada, generadoEn, ciudadEmision } = data
  const ciudad = ciudadEmision || empresa.domicilio_ciudad || 'Buenos Aires'
  const domicilioEmpresa = buildEmpresaDomicilio(empresa)
  const domicilioInversor = buildInversorDomicilio(inversor)
  const docInversor = inversor.cuit ? `CUIT: ${inversor.cuit}` : inversor.dni ? `DNI: ${inversor.dni}` : null

  const datosIncompletos =
    !empresa.cuit || !empresa.domicilio_calle ||
    (!inversor.cuit && !inversor.dni) || !inversor.domicilio_calle

  return (
    <Document title={`Comprobante ${inversor.nombre} ${periodo.mes}`} author={empresa.razon_social}>
      <Page size="A4" style={styles.page}>
        {/* Encabezado de la empresa */}
        <View style={styles.header}>
          <View style={styles.empresaBlock}>
            <Text style={styles.empresaName}>{empresa.razon_social}</Text>
            {empresa.nombre_fantasia && empresa.nombre_fantasia !== empresa.razon_social && (
              <Text style={styles.empresaFantasia}>{empresa.nombre_fantasia}</Text>
            )}
            <Text style={styles.empresaData}>
              {empresa.cuit && `CUIT: ${empresa.cuit}\n`}
              {empresa.condicion_iva && `${empresa.condicion_iva}\n`}
              {domicilioEmpresa && `${domicilioEmpresa}\n`}
              {empresa.telefono && `Tel: ${empresa.telefono}  `}{empresa.email && `Email: ${empresa.email}`}
            </Text>
          </View>
          <View style={styles.emisionBlock}>
            <Text style={styles.emisionLabel}>LUGAR Y FECHA</Text>
            <Text style={styles.emisionCiudad}>{ciudad}</Text>
            <Text style={styles.emisionFecha}>{formatFechaLarga(generadoEn)}</Text>
          </View>
        </View>

        {/* Aviso si faltan datos formales */}
        {datosIncompletos && (
          <View style={styles.warningBox}>
            <Text>
              Aviso: faltan datos formales (CUIT, domicilio) que deberían figurar en este comprobante.
              Cargalos desde el sistema antes de entregar el documento al inversor.
            </Text>
          </View>
        )}

        {/* Título */}
        <Text style={styles.title}>Comprobante de devengamiento de intereses</Text>
        <Text style={styles.subtitle}>Período {formatMonthLong(periodo.mes)}</Text>

        {/* Destinatario */}
        <View style={styles.destBox}>
          <Text style={styles.destLabel}>SR./SRA. INVERSOR</Text>
          <Text style={styles.destNombre}>{inversor.nombre}</Text>
          <Text style={styles.destData}>
            {docInversor && `${docInversor}\n`}
            {domicilioInversor && `${domicilioInversor}\n`}
            {inversor.email && `Email: ${inversor.email}`}
          </Text>
        </View>

        {/* Texto introductorio */}
        <Text style={styles.paragraph}>
          Por el presente comprobante, {empresa.razon_social} deja constancia de los intereses devengados a
          favor del/de la inversor/a arriba identificado/a, correspondientes al período comprendido entre el
          <Text style={{ fontWeight: 700 }}> {fechaInicioMes(periodo.mes)}</Text> y el
          <Text style={{ fontWeight: 700 }}> {fechaFinMes(periodo.mes)}</Text>, sobre el capital invertido bajo
          el instrumento vigente {instrumento.codigo ? `(código ${instrumento.codigo})` : ''} en moneda {instrumento.moneda}.
        </Text>

        {/* Detalle del cálculo */}
        <Text style={styles.tableTitle}>Detalle del período</Text>

        <View style={styles.tableRow}>
          <Text style={styles.tableLabel}>Período</Text>
          <Text style={styles.tableValue}>{formatMonthLong(periodo.mes)}  ({diasDelMes(periodo.mes)} días)</Text>
        </View>
        <View style={styles.tableRow}>
          <Text style={styles.tableLabel}>Fecha de inicio del período</Text>
          <Text style={styles.tableValue}>{fechaInicioMes(periodo.mes)}</Text>
        </View>
        <View style={styles.tableRow}>
          <Text style={styles.tableLabel}>Fecha de cierre del período</Text>
          <Text style={styles.tableValue}>{fechaFinMes(periodo.mes)}</Text>
        </View>
        <View style={styles.tableRow}>
          <Text style={styles.tableLabel}>Tasa mensual aplicada</Text>
          <Text style={styles.tableValue}>{formatPercent(tasa_aplicada)}</Text>
        </View>
        <View style={styles.tableRow}>
          <Text style={styles.tableLabel}>Modalidad</Text>
          <Text style={styles.tableValue}>{instrumento.capitalizable ? 'Capitalizable' : 'No capitalizable'}</Text>
        </View>

        <Text style={[styles.tableTitle, { marginTop: 14 }]}>Cálculo financiero</Text>

        <View style={styles.tableRow}>
          <Text style={styles.tableLabel}>Capital al inicio del período</Text>
          <Text style={styles.tableValue}>{formatMoney(periodo.saldo_inicio, instrumento.moneda)}</Text>
        </View>
        {/* En NO capitalizable, el interés NO se suma al capital — se paga aparte */}
        {instrumento.capitalizable && (
          <View style={styles.tableRow}>
            <Text style={styles.tableLabel}>Interés devengado (se reinvierte)</Text>
            <Text style={[styles.tableValue, { color: COLOR_ACCENT, fontWeight: 700 }]}>
              + {formatMoney(periodo.interes_devengado, instrumento.moneda)}
            </Text>
          </View>
        )}
        {periodo.movimiento !== 0 && (
          <View style={styles.tableRow}>
            <Text style={styles.tableLabel}>Movimientos del período (ingresos/retiros)</Text>
            <Text style={styles.tableValue}>
              {periodo.movimiento >= 0 ? '+ ' : '- '}{formatMoney(Math.abs(periodo.movimiento), instrumento.moneda)}
            </Text>
          </View>
        )}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Capital al cierre del período</Text>
          <Text style={styles.tableValueStrong}>{formatMoney(periodo.saldo_cierre, instrumento.moneda)}</Text>
        </View>

        {/* Para NO capitalizable, mostrar aparte el interés a pagar */}
        {!instrumento.capitalizable && (
          <>
            <View style={[styles.tableRow, { marginTop: 8 }]}>
              <Text style={[styles.tableLabel, { color: COLOR_TEXT, fontWeight: 700 }]}>Interés a pagar al inversor</Text>
              <Text style={[styles.tableValueStrong, { color: COLOR_ACCENT }]}>
                {formatMoney(periodo.interes_devengado, instrumento.moneda)}
              </Text>
            </View>
            <Text style={[styles.paragraph, { fontSize: 9, color: COLOR_MUTED, marginTop: 4 }]}>
              Modalidad no capitalizable: el interés del período se abona al inversor y no se reinvierte al capital.
            </Text>
          </>
        )}

        {/* Texto de cierre */}
        <Text style={[styles.paragraph, { marginTop: 14 }]}>
          {instrumento.capitalizable
            ? 'En virtud de la modalidad capitalizable acordada, el interés devengado se reinvierte sumándose al capital del próximo período.'
            : 'En virtud de la modalidad no capitalizable acordada, el interés devengado queda disponible para su retiro.'}
        </Text>

        <Text style={styles.paragraph}>
          Sin otro particular y a los efectos que pudieran corresponder, saludamos a Ud. atentamente.
        </Text>

        {/* Firma */}
        <View style={styles.firmaContainer}>
          <View style={styles.firmaBox}>
            <View style={styles.firmaLinea} />
            <Text style={styles.firmaLabel}>Firma y aclaración</Text>
            <Text style={styles.firmaNombre}>{empresa.razon_social}</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text>
            {empresa.razon_social}{empresa.email ? ` · ${empresa.email}` : ''}{empresa.telefono ? ` · ${empresa.telefono}` : ''}{empresa.sitio_web ? ` · ${empresa.sitio_web}` : ''}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
