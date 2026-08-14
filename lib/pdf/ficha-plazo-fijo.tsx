/**
 * Ficha de un plazo fijo: cómo arrancó, cuánto rindió mes a mes y toda la plata que
 * entró y salió, con el día y el motivo de cada movimiento.
 * Sirve para plazos vivos y cerrados. Misma estética que `comprobante-devolucion.tsx`.
 *
 * Muestra SOLO el tramo vigente (desde la última renovación): al renovar, los intereses
 * del tramo anterior ya quedaron adentro del capital, así que volver a listarlos sería
 * contar la misma plata dos veces.
 */
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import React from 'react'

export interface FichaMes {
  mes: string // YYYY-MM
  saldo_inicio: number
  interes_devengado: number
  movimiento: number
  saldo_cierre: number
  cerrado: boolean
}

export interface FichaMovimiento {
  fecha: string | null // YYYY-MM-DD; null = sin día
  mes: string
  monto: number
  motivo: string
  nota: string | null
}

export interface FichaPlazoFijoData {
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
    fecha_fin: string | null
    plazo_dias: number | null
    estado: 'activo' | 'cerrado' | 'renovado'
  }
  detalle: FichaMes[]
  movimientos: FichaMovimiento[]
  totales: {
    intereses: number
    movimientosNetos: number
    saldoActual: number
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
const COLOR_SALE = '#a02020'
const COLOR_ENTRA = '#1d6b34'

const styles = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 10, padding: 30, paddingBottom: 40, color: COLOR_TEXT, lineHeight: 1.35 },
  header: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 2, borderBottomColor: COLOR_PRIMARY, paddingBottom: 8, marginBottom: 9 },
  empresaBlock: { flexDirection: 'column', maxWidth: '60%' },
  empresaName: { fontSize: 16, fontWeight: 700, color: COLOR_PRIMARY },
  empresaFantasia: { fontSize: 9, color: COLOR_MUTED, marginTop: 1 },
  empresaData: { fontSize: 8, color: COLOR_TEXT, marginTop: 6, lineHeight: 1.5 },
  emisionBlock: { flexDirection: 'column', alignItems: 'flex-end' },
  emisionLabel: { fontSize: 7, color: COLOR_MUTED, letterSpacing: 1 },
  emisionCiudad: { fontSize: 10, color: COLOR_TEXT, marginTop: 4, fontWeight: 700 },
  emisionFecha: { fontSize: 9, color: COLOR_TEXT, marginTop: 2 },
  title: { fontSize: 14, fontWeight: 700, color: COLOR_TEXT, textAlign: 'center', marginVertical: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  subtitle: { fontSize: 9, color: COLOR_MUTED, textAlign: 'center', marginBottom: 8 },
  destBox: { borderWidth: 1, borderColor: COLOR_BORDER, borderRadius: 4, padding: 8, marginBottom: 8 },
  destLabel: { fontSize: 8, color: COLOR_MUTED, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  destNombre: { fontSize: 12, fontWeight: 700, color: COLOR_TEXT },
  destData: { fontSize: 8.5, color: COLOR_TEXT, marginTop: 3, lineHeight: 1.35 },
  keyBlock: { backgroundColor: COLOR_BG_SOFT, borderLeftWidth: 4, borderLeftColor: COLOR_ACCENT, padding: 8, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between' },
  keyCol: { flexDirection: 'column', flex: 1 },
  keyLabel: { fontSize: 8, color: COLOR_MUTED, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 },
  keyValue: { fontSize: 11, fontWeight: 700, color: COLOR_TEXT },
  sectionTitle: { fontSize: 9.5, fontWeight: 700, color: COLOR_PRIMARY, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3, marginTop: 7 },
  tHeader: { flexDirection: 'row', backgroundColor: COLOR_PRIMARY, paddingVertical: 4.5, paddingHorizontal: 4 },
  tHeaderCell: { color: '#ffffff', fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3 },
  tRow: { flexDirection: 'row', paddingVertical: 2, paddingHorizontal: 4, borderBottomWidth: 0.5, borderBottomColor: COLOR_BORDER },
  tRowZebra: { backgroundColor: '#fafbfd' },
  tCell: { fontSize: 9, color: COLOR_TEXT },
  tCellMono: { fontSize: 9, color: COLOR_TEXT, fontFamily: 'Courier', textAlign: 'right' },
  // Tabla de intereses
  colMes: { width: '22%' },
  colSaldoInicio: { width: '21%', textAlign: 'right' as const },
  colInteres: { width: '19%', textAlign: 'right' as const },
  colMovMes: { width: '19%', textAlign: 'right' as const },
  colSaldoCierre: { width: '19%', textAlign: 'right' as const },
  // Tabla de movimientos
  colDia: { width: '15%' },
  colQuePaso: { width: '20%' },
  // paddingRight para que el monto (alineado a la derecha) no quede pegado a la nota
  colMonto: { width: '24%', textAlign: 'right' as const, paddingRight: 10 },
  colNota: { width: '41%' },
  totalBox: { backgroundColor: COLOR_BG_SOFT, borderWidth: 1, borderColor: COLOR_BORDER, borderRadius: 4, padding: 8, marginTop: 8 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2.5 },
  totalLabel: { fontSize: 10, color: COLOR_TEXT },
  totalLabelStrong: { fontSize: 11, color: COLOR_TEXT, fontWeight: 700 },
  totalValue: { fontSize: 10, color: COLOR_TEXT, fontFamily: 'Courier', fontWeight: 700 },
  totalValueAccent: { fontSize: 13, color: COLOR_ACCENT, fontFamily: 'Courier', fontWeight: 700 },
  noticeBox: { borderLeftWidth: 3, borderLeftColor: COLOR_PRIMARY, backgroundColor: '#f1f5fb', padding: 7, marginTop: 6, fontSize: 8.5, color: COLOR_TEXT },
  firmaContainer: { marginTop: 8, flexDirection: 'row', justifyContent: 'flex-end' },
  firmaBox: { width: 210, alignItems: 'center' },
  firmaLinea: { borderTopWidth: 0.5, borderTopColor: COLOR_TEXT, width: '100%', marginBottom: 3, marginTop: 14 },
  firmaLabel: { fontSize: 9, color: COLOR_MUTED },
  firmaNombre: { fontSize: 11, color: COLOR_TEXT, marginTop: 2, fontWeight: 700 },
  firmaCargo: { fontSize: 9, color: COLOR_MUTED, marginTop: 1 },
  vacio: { fontSize: 9, color: COLOR_MUTED, paddingVertical: 6 },
  footer: { position: 'absolute', bottom: 18, left: 30, right: 30, borderTopWidth: 0.5, borderTopColor: COLOR_BORDER, paddingTop: 8, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7, color: COLOR_MUTED },
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

const ETIQUETA_MOTIVO: Record<string, string> = {
  retiro_parcial: 'Sacó plata',
  aporte_nuevo: 'Puso más plata',
  devolucion: 'Devolución',
  ajuste: 'Ajuste',
}

export function FichaPlazoFijoPDF({ data }: { data: FichaPlazoFijoData }) {
  const { empresa, inversor, instrumento, detalle, movimientos, totales, generadoEn, ciudadEmision } = data
  const ciudad = ciudadEmision || empresa.domicilio_ciudad || 'Buenos Aires'
  const domEmp = buildDomicilio(empresa)
  const domInv = buildDomicilio(inversor)
  const docInv = inversor.cuit ? `CUIT: ${inversor.cuit}` : inversor.dni ? `DNI: ${inversor.dni}` : null
  const moneda = instrumento.moneda
  const cerrado = instrumento.estado === 'cerrado'
  const haySinDia = movimientos.some((m) => !m.fecha)

  return (
    <Document title={`Ficha ${inversor.nombre} ${instrumento.codigo ?? ''}`.trim()} author={empresa.razon_social}>
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

        <Text style={styles.title}>Ficha del plazo fijo</Text>
        {/* Helvetica no tiene la flecha "→": va la palabra "al". */}
        <Text style={styles.subtitle}>
          {instrumento.codigo ? `${instrumento.codigo} — ` : ''}
          {formatDateShort(instrumento.fecha_inicio)}
          {instrumento.fecha_fin ? ` al ${formatDateShort(instrumento.fecha_fin)}` : ' · sin vencimiento'}
          {cerrado ? ' · cerrado' : ''}
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

        {/* Cómo arrancó */}
        <View style={styles.keyBlock}>
          <View style={styles.keyCol}>
            <Text style={styles.keyLabel}>Capital al inicio</Text>
            <Text style={styles.keyValue}>{formatMoney(instrumento.capital_inicial, moneda)}</Text>
          </View>
          <View style={styles.keyCol}>
            <Text style={styles.keyLabel}>Tasa mensual</Text>
            <Text style={[styles.keyValue, { color: COLOR_ACCENT }]}>{formatPercent(instrumento.tasa_mensual)}</Text>
          </View>
          <View style={styles.keyCol}>
            <Text style={styles.keyLabel}>Plazo pactado</Text>
            <Text style={styles.keyValue}>
              {instrumento.plazo_dias ? `${instrumento.plazo_dias} días` : 'sin plazo'}
            </Text>
          </View>
          <View style={styles.keyCol}>
            <Text style={styles.keyLabel}>Vencimiento</Text>
            <Text style={styles.keyValue}>
              {instrumento.fecha_fin ? formatDateShort(instrumento.fecha_fin) : 'sin vencimiento'}
            </Text>
          </View>
          <View style={styles.keyCol}>
            <Text style={styles.keyLabel}>Interés</Text>
            <Text style={styles.keyValue}>{instrumento.capitalizable ? 'Capitaliza' : 'No capitaliza'}</Text>
          </View>
        </View>

        {/* Intereses mes a mes */}
        <Text style={styles.sectionTitle}>Cómo rindió mes a mes</Text>
        {detalle.length === 0 ? (
          <Text style={styles.vacio}>Todavía no hay meses calculados para este plazo.</Text>
        ) : (
          <>
            <View style={styles.tHeader}>
              <Text style={[styles.tHeaderCell, styles.colMes]}>Mes</Text>
              <Text style={[styles.tHeaderCell, styles.colSaldoInicio]}>Saldo inicio</Text>
              <Text style={[styles.tHeaderCell, styles.colInteres]}>Interés</Text>
              <Text style={[styles.tHeaderCell, styles.colMovMes]}>Movimientos</Text>
              <Text style={[styles.tHeaderCell, styles.colSaldoCierre]}>Saldo cierre</Text>
            </View>
            {detalle.map((d, idx) => (
              <View key={d.mes} style={[styles.tRow, idx % 2 === 1 ? styles.tRowZebra : {}]}>
                <Text style={[styles.tCell, styles.colMes]}>
                  {formatMesLargo(d.mes)}{d.cerrado ? '' : ' *'}
                </Text>
                <Text style={[styles.tCellMono, styles.colSaldoInicio]}>{formatMoney(d.saldo_inicio, moneda)}</Text>
                <Text style={[styles.tCellMono, styles.colInteres, { color: COLOR_ACCENT, fontWeight: 700 }]}>
                  {formatMoney(d.interes_devengado, moneda)}
                </Text>
                <Text style={[styles.tCellMono, styles.colMovMes, d.movimiento < 0 ? { color: COLOR_SALE } : d.movimiento > 0 ? { color: COLOR_ENTRA } : {}]}>
                  {d.movimiento === 0 ? '-' : formatMoney(d.movimiento, moneda)}
                </Text>
                <Text style={[styles.tCellMono, styles.colSaldoCierre, { fontWeight: 700 }]}>
                  {formatMoney(d.saldo_cierre, moneda)}
                </Text>
              </View>
            ))}
          </>
        )}

        {/* Movimientos */}
        <Text style={styles.sectionTitle}>La plata que entró y salió</Text>
        {movimientos.length === 0 ? (
          <Text style={styles.vacio}>No se movió plata en este plazo fijo.</Text>
        ) : (
          <>
            <View style={styles.tHeader}>
              <Text style={[styles.tHeaderCell, styles.colDia]}>Día</Text>
              <Text style={[styles.tHeaderCell, styles.colQuePaso]}>Qué pasó</Text>
              <Text style={[styles.tHeaderCell, styles.colMonto]}>Monto</Text>
              <Text style={[styles.tHeaderCell, styles.colNota]}>Nota</Text>
            </View>
            {movimientos.map((m, idx) => (
              <View key={`${m.mes}-${idx}`} style={[styles.tRow, idx % 2 === 1 ? styles.tRowZebra : {}]}>
                <Text style={[styles.tCell, styles.colDia]}>
                  {m.fecha ? formatDateShort(m.fecha) : 'sin día'}
                </Text>
                <Text style={[styles.tCell, styles.colQuePaso]}>{ETIQUETA_MOTIVO[m.motivo] ?? m.motivo}</Text>
                <Text style={[styles.tCellMono, styles.colMonto, m.monto < 0 ? { color: COLOR_SALE } : { color: COLOR_ENTRA }]}>
                  {m.monto > 0 ? '+ ' : ''}{formatMoney(m.monto, moneda)}
                </Text>
                <Text style={[styles.tCell, styles.colNota]}>{m.nota ?? ''}</Text>
              </View>
            ))}
          </>
        )}

        {/* Totales */}
        <View style={styles.totalBox}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Capital al inicio</Text>
            <Text style={styles.totalValue}>{formatMoney(instrumento.capital_inicial, moneda)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Intereses acumulados</Text>
            <Text style={[styles.totalValue, { color: COLOR_ACCENT }]}>+ {formatMoney(totales.intereses, moneda)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Plata que entró y salió</Text>
            <Text style={[styles.totalValue, totales.movimientosNetos < 0 ? { color: COLOR_SALE } : { color: COLOR_ENTRA }]}>
              {totales.movimientosNetos === 0 ? formatMoney(0, moneda) : formatMoney(totales.movimientosNetos, moneda)}
            </Text>
          </View>
          <View style={[styles.totalRow, { borderTopWidth: 1, borderTopColor: COLOR_PRIMARY, paddingTop: 8, marginTop: 4 }]}>
            <Text style={styles.totalLabelStrong}>{cerrado ? 'TOTAL DEVUELTO' : 'SALDO A HOY'}</Text>
            <Text style={styles.totalValueAccent}>{formatMoney(totales.saldoActual, moneda)}</Text>
          </View>
        </View>

        <View style={styles.noticeBox}>
          <Text>
            La plata que se retira cobra la tasa pactada por los días que estuvo trabajando y deja
            de cobrar desde el día que sale. Lo que queda sigue cobrando normal hasta el vencimiento.
            {haySinDia
              ? ' Los movimientos marcados como "sin día" no cambian el cálculo del interés: solo mueven el saldo.'
              : ''}
            {detalle.some((d) => !d.cerrado) ? ' Los meses con asterisco todavía no están cerrados.' : ''}
          </Text>
        </View>

        {/* Firma. wrap={false} para que el bloque no se parta entre hojas. */}
        <View style={styles.firmaContainer} wrap={false}>
          <View style={styles.firmaBox}>
            <View style={styles.firmaLinea} />
            <Text style={styles.firmaLabel}>Por {empresa.razon_social}</Text>
            <Text style={styles.firmaNombre}>Darío Arévalo</Text>
            <Text style={styles.firmaCargo}>Socio Gerente y CFO</Text>
          </View>
        </View>

        {/* Footer.
            Sin contador de páginas: en @react-pdf/renderer 4.5 un <Text render={...}>
            hace que NO se dibuje nada del bloque que lo contiene — se pierde el pie entero. */}
        <View style={styles.footer} fixed>
          <Text>
            {empresa.razon_social}{empresa.email ? ` · ${empresa.email}` : ''}{empresa.telefono ? ` · ${empresa.telefono}` : ''}{empresa.sitio_web ? ` · ${empresa.sitio_web}` : ''}
          </Text>
          <Text>Ficha del plazo fijo</Text>
        </View>
      </Page>
    </Document>
  )
}
