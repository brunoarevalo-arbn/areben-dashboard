/**
 * Comprobante de devolución y cierre de un instrumento.
 * Es un RECIBO: se le entrega al inversor para que firme conforme al cobrar.
 * Misma estética que `reporte-proyeccion.tsx` (azul + acento naranja).
 */
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import React from 'react'

export interface DevolucionMes {
  mes: string // YYYY-MM
  saldo_inicio: number
  interes_devengado: number
  saldo_cierre: number
}

export interface ComprobanteDevolucionData {
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
    tasa_mensual: number
    capitalizable: boolean
    fecha_inicio: string
    /** Vencimiento acordado del ciclo. */
    fecha_vencimiento: string | null
  }
  devolucion: {
    /** Día en que se le pagó. */
    fecha_pago: string
    capital: number
    intereses: number
    total: number
    /** true si se devolvió antes del vencimiento acordado. */
    anticipada: boolean
  }
  /** Meses del ciclo con su interés, para respaldar el número. */
  detalle: DevolucionMes[]
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
  page: { fontFamily: 'Helvetica', fontSize: 10, padding: 36, paddingBottom: 46, color: COLOR_TEXT, lineHeight: 1.4 },
  header: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 2, borderBottomColor: COLOR_PRIMARY, paddingBottom: 10, marginBottom: 12 },
  empresaBlock: { flexDirection: 'column', maxWidth: '60%' },
  empresaName: { fontSize: 16, fontWeight: 700, color: COLOR_PRIMARY },
  empresaFantasia: { fontSize: 9, color: COLOR_MUTED, marginTop: 1 },
  empresaData: { fontSize: 8, color: COLOR_TEXT, marginTop: 6, lineHeight: 1.5 },
  emisionBlock: { flexDirection: 'column', alignItems: 'flex-end' },
  emisionLabel: { fontSize: 7, color: COLOR_MUTED, letterSpacing: 1 },
  emisionCiudad: { fontSize: 10, color: COLOR_TEXT, marginTop: 4, fontWeight: 700 },
  emisionFecha: { fontSize: 9, color: COLOR_TEXT, marginTop: 2 },
  title: { fontSize: 15, fontWeight: 700, color: COLOR_TEXT, textAlign: 'center', marginVertical: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  subtitle: { fontSize: 10, color: COLOR_MUTED, textAlign: 'center', marginBottom: 10 },
  destBox: { borderWidth: 1, borderColor: COLOR_BORDER, borderRadius: 4, padding: 10, marginBottom: 10 },
  destLabel: { fontSize: 8, color: COLOR_MUTED, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  destNombre: { fontSize: 12, fontWeight: 700, color: COLOR_TEXT },
  destData: { fontSize: 9, color: COLOR_TEXT, marginTop: 5, lineHeight: 1.4 },
  paragraph: { fontSize: 10, color: COLOR_TEXT, marginBottom: 8, textAlign: 'justify', lineHeight: 1.4 },
  keyBlock: { backgroundColor: COLOR_BG_SOFT, borderLeftWidth: 4, borderLeftColor: COLOR_ACCENT, padding: 10, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between' },
  keyCol: { flexDirection: 'column', flex: 1 },
  keyLabel: { fontSize: 8, color: COLOR_MUTED, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 },
  keyValue: { fontSize: 11, fontWeight: 700, color: COLOR_TEXT },
  sectionTitle: { fontSize: 10, fontWeight: 700, color: COLOR_PRIMARY, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, marginTop: 4 },
  tHeader: { flexDirection: 'row', backgroundColor: COLOR_PRIMARY, paddingVertical: 6, paddingHorizontal: 4 },
  tHeaderCell: { color: '#ffffff', fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3 },
  tRow: { flexDirection: 'row', paddingVertical: 2.5, paddingHorizontal: 4, borderBottomWidth: 0.5, borderBottomColor: COLOR_BORDER },
  tRowZebra: { backgroundColor: '#fafbfd' },
  tCell: { fontSize: 9, color: COLOR_TEXT },
  tCellMono: { fontSize: 9, color: COLOR_TEXT, fontFamily: 'Courier', textAlign: 'right' },
  colMes: { width: '34%' },
  colSaldoInicio: { width: '22%', textAlign: 'right' as const },
  colInteres: { width: '22%', textAlign: 'right' as const },
  colSaldoCierre: { width: '22%', textAlign: 'right' as const },
  totalBox: { backgroundColor: COLOR_BG_SOFT, borderWidth: 1, borderColor: COLOR_BORDER, borderRadius: 4, padding: 10, marginTop: 10 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  totalLabel: { fontSize: 10, color: COLOR_TEXT },
  totalLabelStrong: { fontSize: 11, color: COLOR_TEXT, fontWeight: 700 },
  totalValue: { fontSize: 10, color: COLOR_TEXT, fontFamily: 'Courier', fontWeight: 700 },
  totalValueAccent: { fontSize: 13, color: COLOR_ACCENT, fontFamily: 'Courier', fontWeight: 700 },
  noticeBox: { borderLeftWidth: 3, borderLeftColor: COLOR_PRIMARY, backgroundColor: '#f1f5fb', padding: 8, marginTop: 8, fontSize: 9, color: COLOR_TEXT },
  firmaContainer: { marginTop: 10, flexDirection: 'row', justifyContent: 'space-between' },
  firmaBox: { width: 210, alignItems: 'center' },
  firmaLinea: { borderTopWidth: 0.5, borderTopColor: COLOR_TEXT, width: '100%', marginBottom: 4, marginTop: 18 },
  firmaLabel: { fontSize: 9, color: COLOR_MUTED },
  firmaNombre: { fontSize: 11, color: COLOR_TEXT, marginTop: 2, fontWeight: 700 },
  firmaCargo: { fontSize: 9, color: COLOR_MUTED, marginTop: 1 },
  footer: { position: 'absolute', bottom: 22, left: 36, right: 36, borderTopWidth: 0.5, borderTopColor: COLOR_BORDER, paddingTop: 8, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7, color: COLOR_MUTED },
})

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
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
function formatMesLargo(yyyyMM: string): string {
  const [y, m] = yyyyMM.split('-')
  return `${MESES_CORTOS[Number(m) - 1]}-${y}`
}
function buildDomicilio(e: { domicilio_calle: string | null; domicilio_ciudad: string | null; domicilio_provincia: string | null; domicilio_cp: string | null }): string {
  return [e.domicilio_calle, e.domicilio_ciudad, e.domicilio_provincia, e.domicilio_cp].filter(Boolean).join(', ')
}

export function ComprobanteDevolucionPDF({ data }: { data: ComprobanteDevolucionData }) {
  const { empresa, inversor, instrumento, devolucion, detalle, generadoEn, ciudadEmision } = data
  const ciudad = ciudadEmision || empresa.domicilio_ciudad || 'Buenos Aires'
  const domEmp = buildDomicilio(empresa)
  const domInv = buildDomicilio(inversor)
  const docInv = inversor.cuit ? `CUIT: ${inversor.cuit}` : inversor.dni ? `DNI: ${inversor.dni}` : null
  const moneda = instrumento.moneda

  return (
    <Document title={`Devolución ${inversor.nombre} ${devolucion.fecha_pago}`} author={empresa.razon_social}>
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

        <Text style={styles.title}>Comprobante de devolución</Text>
        <Text style={styles.subtitle}>
          Cierre del instrumento {instrumento.codigo ? `${instrumento.codigo} ` : ''}
          — {formatDateShort(instrumento.fecha_inicio)} al {formatDateShort(devolucion.fecha_pago)}
          {devolucion.anticipada ? ' · devolución anticipada' : ''}
        </Text>

        {/* Destinatario */}
        <View style={styles.destBox}>
          <Text style={styles.destLabel}>SR./SRA. INVERSOR</Text>
          <Text style={styles.destNombre}>{inversor.nombre}</Text>
          <Text style={styles.destData}>
            {docInv && `${docInv}\n`}
            {domInv}
          </Text>
        </View>

        {/* Datos clave */}
        <View style={styles.keyBlock}>
          <View style={styles.keyCol}>
            <Text style={styles.keyLabel}>Fecha de pago</Text>
            <Text style={styles.keyValue}>{formatDateShort(devolucion.fecha_pago)}</Text>
          </View>
          <View style={styles.keyCol}>
            <Text style={styles.keyLabel}>Tasa mensual</Text>
            <Text style={[styles.keyValue, { color: COLOR_ACCENT }]}>{formatPercent(instrumento.tasa_mensual)}</Text>
          </View>
          <View style={styles.keyCol}>
            <Text style={styles.keyLabel}>Vencimiento acordado</Text>
            <Text style={styles.keyValue}>
              {instrumento.fecha_vencimiento ? formatDateShort(instrumento.fecha_vencimiento) : 'sin plazo'}
            </Text>
          </View>
          <View style={styles.keyCol}>
            <Text style={styles.keyLabel}>Moneda</Text>
            <Text style={styles.keyValue}>{moneda === 'USD' ? 'Dólares' : 'Pesos'}</Text>
          </View>
        </View>

        {/* Detalle de intereses */}
        {detalle.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Intereses del período</Text>
            <View style={styles.tHeader}>
              <Text style={[styles.tHeaderCell, styles.colMes]}>Mes</Text>
              <Text style={[styles.tHeaderCell, styles.colSaldoInicio]}>Saldo inicio</Text>
              <Text style={[styles.tHeaderCell, styles.colInteres]}>Interés</Text>
              <Text style={[styles.tHeaderCell, styles.colSaldoCierre]}>Saldo cierre</Text>
            </View>
            {detalle.map((d, idx) => (
              <View key={d.mes} style={[styles.tRow, idx % 2 === 1 ? styles.tRowZebra : {}]}>
                <Text style={[styles.tCell, styles.colMes]}>{formatMesLargo(d.mes)}</Text>
                <Text style={[styles.tCellMono, styles.colSaldoInicio]}>{formatMoney(d.saldo_inicio, moneda)}</Text>
                <Text style={[styles.tCellMono, styles.colInteres, { color: COLOR_ACCENT, fontWeight: 700 }]}>
                  {formatMoney(d.interes_devengado, moneda)}
                </Text>
                <Text style={[styles.tCellMono, styles.colSaldoCierre, { fontWeight: 700 }]}>
                  {formatMoney(d.saldo_cierre, moneda)}
                </Text>
              </View>
            ))}
          </>
        )}

        {/* Totales */}
        <View style={styles.totalBox}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Capital devuelto</Text>
            <Text style={styles.totalValue}>{formatMoney(devolucion.capital, moneda)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Intereses devengados</Text>
            <Text style={[styles.totalValue, { color: COLOR_ACCENT }]}>
              + {formatMoney(devolucion.intereses, moneda)}
            </Text>
          </View>
          <View style={[styles.totalRow, { borderTopWidth: 1, borderTopColor: COLOR_PRIMARY, paddingTop: 8, marginTop: 4 }]}>
            <Text style={styles.totalLabelStrong}>TOTAL ABONADO AL INVERSOR</Text>
            <Text style={styles.totalValueAccent}>{formatMoney(devolucion.total, moneda)}</Text>
          </View>
          <View style={[styles.totalRow, { paddingTop: 2 }]}>
            <Text style={styles.totalLabelStrong}>SALDO PENDIENTE</Text>
            <Text style={[styles.totalValue, { color: COLOR_PRIMARY }]}>{formatMoney(0, moneda)}</Text>
          </View>
        </View>

        <View style={styles.noticeBox}>
          <Text>
            Recibí de {empresa.razon_social} la suma de {formatMoney(devolucion.total, moneda)} en
            concepto de devolución de capital e intereses del instrumento referenciado
            {devolucion.anticipada
              ? ', calculados en proporción a los días transcurridos por tratarse de una devolución anticipada'
              : ''}, que queda CERRADO a partir de la fecha de pago, no quedando saldo alguno
            pendiente entre las partes.
          </Text>
        </View>

        {/* Firmas: la empresa entrega, el inversor recibe conforme */}
        <View style={styles.firmaContainer} wrap={false}>
          <View style={styles.firmaBox}>
            <View style={styles.firmaLinea} />
            <Text style={styles.firmaLabel}>Recibí conforme</Text>
            <Text style={styles.firmaNombre}>{inversor.nombre}</Text>
            {docInv && <Text style={styles.firmaCargo}>{docInv}</Text>}
          </View>
          <View style={styles.firmaBox}>
            <View style={styles.firmaLinea} />
            <Text style={styles.firmaLabel}>Por {empresa.razon_social}</Text>
            <Text style={styles.firmaNombre}>Darío Arévalo</Text>
            <Text style={styles.firmaCargo}>Socio Gerente y CFO</Text>
          </View>
        </View>

        {/* Footer.
            Sin contador de páginas: en @react-pdf/renderer 4.5 un <Text render={...}>
            hace que NO se dibuje nada del bloque que lo contiene — se pierde el pie
            entero. El comprobante entra en una hoja, así que el contador no hace falta. */}
        <View style={styles.footer} fixed>
          <Text>
            {empresa.razon_social}{empresa.email ? ` · ${empresa.email}` : ''}{empresa.telefono ? ` · ${empresa.telefono}` : ''}{empresa.sitio_web ? ` · ${empresa.sitio_web}` : ''}
          </Text>
          <Text>Comprobante de devolución</Text>
        </View>
      </Page>
    </Document>
  )
}
