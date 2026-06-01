/**
 * Proyección de rendimiento de un instrumento hasta su vencimiento.
 * PDF formal para mostrar al inversor: capital + intereses mes a mes hasta plazo_dias.
 */
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import React from 'react'

export interface ProyeccionMes {
  mes_num: number
  fecha_inicio: string // YYYY-MM-DD
  fecha_fin: string // YYYY-MM-DD
  saldo_inicio: number
  interes_devengado: number
  saldo_cierre: number
}

export interface ReporteProyeccionData {
  empresa: {
    razon_social: string
    nombre_fantasia: string | null
    cuit: string | null
    condicion_iva: string | null
    domicilio_calle: string | null
    domicilio_ciudad: string | null
    domicilio_provincia: string | null
    domicilio_cp: string | null
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
    capital_inicial: number
    tasa_mensual: number
    capitalizable: boolean
    fecha_inicio: string
    plazo_dias: number
    fecha_vencimiento: string
  }
  proyeccion: ProyeccionMes[]
  totales: {
    capital_inicial: number
    total_intereses: number
    capital_final: number
    total_a_cobrar: number
  }
  generadoEn: string
  ciudadEmision?: string
}

const COLOR_PRIMARY = '#0b3d91'
const COLOR_ACCENT = '#c97a00'
const COLOR_TEXT = '#1a1a1a'
const COLOR_MUTED = '#666666'
const COLOR_BORDER = '#d6d0c4'
const COLOR_BG_SOFT = '#f7f4ed'

const styles = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 10, padding: 40, paddingBottom: 80, color: COLOR_TEXT, lineHeight: 1.4 },
  header: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 2, borderBottomColor: COLOR_PRIMARY, paddingBottom: 12, marginBottom: 18 },
  empresaBlock: { flexDirection: 'column', maxWidth: '60%' },
  empresaName: { fontSize: 16, fontWeight: 700, color: COLOR_PRIMARY },
  empresaFantasia: { fontSize: 9, color: COLOR_MUTED, marginTop: 1 },
  empresaData: { fontSize: 8, color: COLOR_TEXT, marginTop: 6, lineHeight: 1.5 },
  emisionBlock: { flexDirection: 'column', alignItems: 'flex-end' },
  emisionLabel: { fontSize: 7, color: COLOR_MUTED, letterSpacing: 1 },
  emisionCiudad: { fontSize: 10, color: COLOR_TEXT, marginTop: 4, fontWeight: 700 },
  emisionFecha: { fontSize: 9, color: COLOR_TEXT, marginTop: 2 },
  title: { fontSize: 16, fontWeight: 700, color: COLOR_TEXT, textAlign: 'center', marginVertical: 14, textTransform: 'uppercase', letterSpacing: 0.5 },
  subtitle: { fontSize: 11, color: COLOR_MUTED, textAlign: 'center', marginBottom: 18 },
  destBox: { borderWidth: 1, borderColor: COLOR_BORDER, borderRadius: 4, padding: 12, marginBottom: 16 },
  destLabel: { fontSize: 8, color: COLOR_MUTED, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  destNombre: { fontSize: 12, fontWeight: 700, color: COLOR_TEXT },
  destData: { fontSize: 9, color: COLOR_TEXT, marginTop: 6, lineHeight: 1.5 },
  paragraph: { fontSize: 10, color: COLOR_TEXT, marginBottom: 12, textAlign: 'justify', lineHeight: 1.5 },
  keyBlock: { backgroundColor: COLOR_BG_SOFT, borderLeftWidth: 4, borderLeftColor: COLOR_ACCENT, padding: 12, marginBottom: 14, flexDirection: 'row', justifyContent: 'space-between' },
  keyCol: { flexDirection: 'column', flex: 1 },
  keyLabel: { fontSize: 8, color: COLOR_MUTED, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 },
  keyValue: { fontSize: 11, fontWeight: 700, color: COLOR_TEXT },
  sectionTitle: { fontSize: 10, fontWeight: 700, color: COLOR_PRIMARY, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 8 },
  // Tabla de proyección
  tHeader: { flexDirection: 'row', backgroundColor: COLOR_PRIMARY, paddingVertical: 6, paddingHorizontal: 4 },
  tHeaderCell: { color: '#ffffff', fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3 },
  tRow: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 4, borderBottomWidth: 0.5, borderBottomColor: COLOR_BORDER },
  tRowZebra: { backgroundColor: '#fafbfd' },
  tCell: { fontSize: 9, color: COLOR_TEXT },
  tCellMono: { fontSize: 9, color: COLOR_TEXT, fontFamily: 'Courier', textAlign: 'right' },
  // anchos columnas
  colMes: { width: '8%' },
  colPeriodo: { width: '32%' },
  colSaldoInicio: { width: '20%', textAlign: 'right' as const },
  colInteres: { width: '20%', textAlign: 'right' as const },
  colSaldoCierre: { width: '20%', textAlign: 'right' as const },
  // Totales
  totalBox: { backgroundColor: COLOR_BG_SOFT, borderWidth: 1, borderColor: COLOR_BORDER, borderRadius: 4, padding: 12, marginTop: 14 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  totalLabel: { fontSize: 10, color: COLOR_TEXT },
  totalLabelStrong: { fontSize: 11, color: COLOR_TEXT, fontWeight: 700 },
  totalValue: { fontSize: 10, color: COLOR_TEXT, fontFamily: 'Courier', fontWeight: 700 },
  totalValueAccent: { fontSize: 13, color: COLOR_ACCENT, fontFamily: 'Courier', fontWeight: 700 },
  noticeBox: { borderLeftWidth: 3, borderLeftColor: COLOR_PRIMARY, backgroundColor: '#f1f5fb', padding: 8, marginTop: 12, fontSize: 9, color: COLOR_TEXT },
  warningBox: { backgroundColor: '#fff7eb', borderLeftWidth: 3, borderLeftColor: COLOR_ACCENT, padding: 10, marginBottom: 14, fontSize: 9, color: COLOR_TEXT },
  // Firma
  firmaContainer: { marginTop: 28, flexDirection: 'row', justifyContent: 'flex-end' },
  firmaBox: { width: 220, alignItems: 'center' },
  firmaLinea: { borderTopWidth: 0.5, borderTopColor: COLOR_TEXT, width: '100%', marginBottom: 4, marginTop: 50 },
  firmaLabel: { fontSize: 9, color: COLOR_MUTED },
  firmaNombre: { fontSize: 9, color: COLOR_TEXT, marginTop: 1 },
  // Footer
  footer: { position: 'absolute', bottom: 28, left: 40, right: 40, borderTopWidth: 0.5, borderTopColor: COLOR_BORDER, paddingTop: 8, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7, color: COLOR_MUTED },
})

// Helpers
function formatMoney(amount: number, currency: 'ARS' | 'USD'): string {
  const symbol = currency === 'USD' ? 'U$S' : '$'
  return `${symbol} ${amount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function formatPercent(rate: number): string {
  return `${(rate * 100).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} %`
}
function formatDateShort(yyyyMMdd: string): string {
  const [y, m, d] = yyyyMMdd.split('-')
  return `${d}/${m}/${y}`
}
function formatFechaLarga(iso: string): string {
  const dt = new Date(iso)
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  return `${dt.getDate()} de ${meses[dt.getMonth()]} de ${dt.getFullYear()}`
}
function buildEmpresaDomicilio(e: ReporteProyeccionData['empresa']): string {
  return [e.domicilio_calle, e.domicilio_ciudad, e.domicilio_provincia, e.domicilio_cp].filter(Boolean).join(', ')
}
function buildInversorDomicilio(i: ReporteProyeccionData['inversor']): string {
  return [i.domicilio_calle, i.domicilio_ciudad, i.domicilio_provincia, i.domicilio_cp].filter(Boolean).join(', ')
}

export function ReporteProyeccionPDF({ data }: { data: ReporteProyeccionData }) {
  const { empresa, inversor, instrumento, proyeccion, totales, generadoEn, ciudadEmision } = data
  const ciudad = ciudadEmision || empresa.domicilio_ciudad || 'Buenos Aires'
  const domEmp = buildEmpresaDomicilio(empresa)
  const domInv = buildInversorDomicilio(inversor)
  const docInv = inversor.cuit ? `CUIT: ${inversor.cuit}` : inversor.dni ? `DNI: ${inversor.dni}` : null

  return (
    <Document title={`Proyección ${inversor.nombre} ${instrumento.plazo_dias}d`} author={empresa.razon_social}>
      <Page size="A4" style={styles.page}>
        {/* Header empresa */}
        <View style={styles.header}>
          <View style={styles.empresaBlock}>
            <Text style={styles.empresaName}>{empresa.razon_social}</Text>
            {empresa.nombre_fantasia && empresa.nombre_fantasia !== empresa.razon_social && (
              <Text style={styles.empresaFantasia}>{empresa.nombre_fantasia}</Text>
            )}
            <Text style={styles.empresaData}>
              {empresa.cuit && `CUIT: ${empresa.cuit}\n`}
              {empresa.condicion_iva && `${empresa.condicion_iva}\n`}
              {domEmp && `${domEmp}\n`}
              {empresa.telefono && `Tel: ${empresa.telefono}  `}{empresa.email && `Email: ${empresa.email}`}
            </Text>
          </View>
          <View style={styles.emisionBlock}>
            <Text style={styles.emisionLabel}>LUGAR Y FECHA</Text>
            <Text style={styles.emisionCiudad}>{ciudad}</Text>
            <Text style={styles.emisionFecha}>{formatFechaLarga(generadoEn)}</Text>
          </View>
        </View>

        <Text style={styles.title}>Proyección de rendimiento</Text>
        <Text style={styles.subtitle}>
          Instrumento {instrumento.codigo ? `(${instrumento.codigo}) ` : ''}a {instrumento.plazo_dias} días
        </Text>

        {/* Destinatario */}
        <View style={styles.destBox}>
          <Text style={styles.destLabel}>SR./SRA. INVERSOR</Text>
          <Text style={styles.destNombre}>{inversor.nombre}</Text>
          <Text style={styles.destData}>
            {docInv && `${docInv}\n`}
            {domInv && `${domInv}\n`}
            {inversor.email && `Email: ${inversor.email}`}
          </Text>
        </View>

        {/* Datos clave del instrumento */}
        <View style={styles.keyBlock}>
          <View style={styles.keyCol}>
            <Text style={styles.keyLabel}>Capital inicial</Text>
            <Text style={styles.keyValue}>{formatMoney(instrumento.capital_inicial, instrumento.moneda)}</Text>
          </View>
          <View style={styles.keyCol}>
            <Text style={styles.keyLabel}>Tasa mensual</Text>
            <Text style={[styles.keyValue, { color: COLOR_ACCENT }]}>{formatPercent(instrumento.tasa_mensual)}</Text>
          </View>
          <View style={styles.keyCol}>
            <Text style={styles.keyLabel}>Plazo</Text>
            <Text style={styles.keyValue}>{instrumento.plazo_dias} días</Text>
          </View>
          <View style={styles.keyCol}>
            <Text style={styles.keyLabel}>Vencimiento</Text>
            <Text style={styles.keyValue}>{formatDateShort(instrumento.fecha_vencimiento)}</Text>
          </View>
        </View>

        {/* Introducción */}
        <Text style={styles.paragraph}>
          Por el presente, {empresa.razon_social} presenta la proyección de rendimiento del instrumento
          arriba referenciado al plazo acordado.
        </Text>

        {/* Tabla */}
        <Text style={styles.sectionTitle}>Detalle mes a mes</Text>

        <View style={styles.tHeader}>
          <Text style={[styles.tHeaderCell, styles.colMes]}>Mes</Text>
          <Text style={[styles.tHeaderCell, styles.colPeriodo]}>Período</Text>
          <Text style={[styles.tHeaderCell, styles.colSaldoInicio]}>Saldo inicio</Text>
          <Text style={[styles.tHeaderCell, styles.colInteres]}>Interés</Text>
          <Text style={[styles.tHeaderCell, styles.colSaldoCierre]}>Saldo cierre</Text>
        </View>

        {proyeccion.map((p, idx) => (
          <View key={p.mes_num} style={[styles.tRow, idx % 2 === 1 ? styles.tRowZebra : {}]}>
            <Text style={[styles.tCell, styles.colMes]}>{p.mes_num}</Text>
            <Text style={[styles.tCell, styles.colPeriodo]}>
              {formatDateShort(p.fecha_inicio)} → {formatDateShort(p.fecha_fin)}
            </Text>
            <Text style={[styles.tCellMono, styles.colSaldoInicio]}>{formatMoney(p.saldo_inicio, instrumento.moneda)}</Text>
            <Text style={[styles.tCellMono, styles.colInteres, { color: COLOR_ACCENT, fontWeight: 700 }]}>
              {formatMoney(p.interes_devengado, instrumento.moneda)}
            </Text>
            <Text style={[styles.tCellMono, styles.colSaldoCierre, { fontWeight: 700 }]}>
              {formatMoney(p.saldo_cierre, instrumento.moneda)}
            </Text>
          </View>
        ))}

        {/* Totales */}
        <View style={styles.totalBox}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Capital invertido</Text>
            <Text style={styles.totalValue}>{formatMoney(totales.capital_inicial, instrumento.moneda)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total intereses generados en {instrumento.plazo_dias} días</Text>
            <Text style={[styles.totalValue, { color: COLOR_ACCENT }]}>
              + {formatMoney(totales.total_intereses, instrumento.moneda)}
            </Text>
          </View>
          <View style={[styles.totalRow, { borderTopWidth: 0.5, borderTopColor: COLOR_BORDER, paddingTop: 6, marginTop: 4 }]}>
            <Text style={styles.totalLabel}>Capital al cierre del instrumento</Text>
            <Text style={styles.totalValue}>{formatMoney(totales.capital_final, instrumento.moneda)}</Text>
          </View>
          <View style={[styles.totalRow, { borderTopWidth: 1, borderTopColor: COLOR_PRIMARY, paddingTop: 8, marginTop: 4 }]}>
            <Text style={styles.totalLabelStrong}>TOTAL A COBRAR POR EL INVERSOR</Text>
            <Text style={styles.totalValueAccent}>{formatMoney(totales.total_a_cobrar, instrumento.moneda)}</Text>
          </View>
        </View>

        <View style={styles.noticeBox}>
          <Text>
            Detalle del rendimiento conforme a las condiciones pactadas. {empresa.razon_social} ratifica
            el cumplimiento al vencimiento.
          </Text>
        </View>

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
