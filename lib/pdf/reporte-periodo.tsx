/**
 * Reporte PDF de un período de inversión.
 * Renderizado con @react-pdf/renderer (server-side, sin browser).
 */
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import React from 'react'

// ============================================================
// Datos que el componente espera (resolvedos desde la API route)
// ============================================================

export interface ReportePeriodoData {
  /** Datos del inversor o acreedor */
  inversor: {
    nombre: string
    tipo: 'persona_fisica' | 'empresa'
  }
  /** Datos del instrumento */
  instrumento: {
    id: string
    codigo: string | null
    moneda: 'ARS' | 'USD'
    capital_inicial: number
    capitalizable: boolean
    tipo: 'INVERSION_PRIVADA' | 'CREDITO_BANCARIO'
    fecha_inicio: string
    acreedor_nombre: string | null
  }
  /** Datos del período */
  periodo: {
    id: string
    mes: string // YYYY-MM
    saldo_inicio: number
    interes_devengado: number
    movimiento: number
    saldo_cierre: number
    cerrado: boolean
    fecha_cierre: string | null
  }
  /** Si el período tiene gasto auto-generado, sus datos */
  gasto: {
    id: string
    monto: number
    moneda: 'ARS' | 'USD'
    monto_origen: number | null
    moneda_origen: 'ARS' | 'USD' | null
    tipo_cambio_aplicado: number | null
    estado: 'PENDIENTE' | 'PAGADO' | 'VENCIDO'
  } | null
  /** Tasa que se aplicó en el período */
  tasa_aplicada: number
  /** Fecha de emisión del PDF */
  generadoEn: string
}

// ============================================================
// Estilos
// ============================================================

const COLOR_PRIMARY = '#0b3d91'
const COLOR_ACCENT = '#c97a00'
const COLOR_TEXT = '#1a1a1a'
const COLOR_MUTED = '#666666'
const COLOR_BORDER = '#d6d0c4'
const COLOR_BG_SOFT = '#f7f4ed'

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    padding: 36,
    color: COLOR_TEXT,
  },
  // ── Encabezado ──
  header: {
    borderBottomWidth: 2,
    borderBottomColor: COLOR_PRIMARY,
    paddingBottom: 12,
    marginBottom: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  headerLeft: {
    flexDirection: 'column',
  },
  brandTag: {
    fontSize: 8,
    color: COLOR_MUTED,
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  brandTitle: {
    fontSize: 18,
    color: COLOR_PRIMARY,
    fontWeight: 700,
  },
  headerRight: {
    flexDirection: 'column',
    alignItems: 'flex-end',
  },
  emisionLabel: {
    fontSize: 7,
    color: COLOR_MUTED,
    letterSpacing: 1,
  },
  emisionDate: {
    fontSize: 9,
    color: COLOR_TEXT,
    marginTop: 2,
  },
  // ── Título reporte ──
  title: {
    fontSize: 14,
    fontWeight: 700,
    color: COLOR_TEXT,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 10,
    color: COLOR_MUTED,
    marginBottom: 16,
  },
  // ── Bloque de datos clave ──
  keyBlock: {
    backgroundColor: COLOR_BG_SOFT,
    borderLeftWidth: 4,
    borderLeftColor: COLOR_ACCENT,
    padding: 14,
    marginBottom: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  keyCol: {
    flexDirection: 'column',
    flex: 1,
  },
  keyLabel: {
    fontSize: 8,
    color: COLOR_MUTED,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  keyValue: {
    fontSize: 12,
    fontWeight: 700,
    color: COLOR_TEXT,
  },
  // ── Secciones ──
  section: {
    marginBottom: 18,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: COLOR_PRIMARY,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: COLOR_BORDER,
  },
  // ── Filas de datos ──
  row: {
    flexDirection: 'row',
    paddingVertical: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: COLOR_BORDER,
  },
  rowLabel: {
    width: '45%',
    color: COLOR_MUTED,
  },
  rowValue: {
    flex: 1,
    color: COLOR_TEXT,
  },
  rowValueMono: {
    flex: 1,
    color: COLOR_TEXT,
    fontFamily: 'Courier',
    textAlign: 'right',
  },
  rowValueStrong: {
    flex: 1,
    color: COLOR_TEXT,
    fontFamily: 'Courier',
    textAlign: 'right',
    fontWeight: 700,
  },
  // ── Tabla financiera ──
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: COLOR_PRIMARY,
    padding: 6,
  },
  tableHeaderCell: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: 700,
  },
  tableRow: {
    flexDirection: 'row',
    padding: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: COLOR_BORDER,
  },
  tableRowZebra: {
    backgroundColor: '#fafbfd',
  },
  // ── Badges ──
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    fontSize: 8,
    fontWeight: 700,
    alignSelf: 'flex-start',
  },
  badgeGreen: {
    backgroundColor: '#ecf7ed',
    color: '#2e7d32',
  },
  badgeAmber: {
    backgroundColor: '#fff7eb',
    color: '#c97a00',
  },
  badgeRed: {
    backgroundColor: '#fdecec',
    color: '#c1272d',
  },
  badgeBlue: {
    backgroundColor: '#f1f5fb',
    color: COLOR_PRIMARY,
  },
  // ── Footer ──
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 36,
    right: 36,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: COLOR_BORDER,
    fontSize: 8,
    color: COLOR_MUTED,
  },
  noticeBox: {
    backgroundColor: '#f1f5fb',
    borderLeftWidth: 3,
    borderLeftColor: COLOR_PRIMARY,
    padding: 8,
    marginTop: 10,
    fontSize: 9,
    color: COLOR_TEXT,
  },
})

// ============================================================
// Helpers
// ============================================================

function formatMoney(amount: number, currency: 'ARS' | 'USD'): string {
  const symbol = currency === 'USD' ? 'U$S' : '$'
  return `${symbol} ${amount.toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatPercent(rate: number): string {
  return `${(rate * 100).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} %`
}

function formatMonthLong(yyyyMM: string): string {
  const [y, m] = yyyyMM.split('-').map(Number)
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  return `${meses[m - 1]} ${y}`
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

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  const hh = String(d.getHours()).padStart(2, '0')
  const mn = String(d.getMinutes()).padStart(2, '0')
  return `${dd}/${mm}/${yyyy} ${hh}:${mn}`
}

// ============================================================
// Componente
// ============================================================

export function ReportePeriodoPDF({ data }: { data: ReportePeriodoData }) {
  const { inversor, instrumento, periodo, gasto, tasa_aplicada, generadoEn } = data
  const tipoLabel = instrumento.tipo === 'CREDITO_BANCARIO' ? 'Crédito Bancario' : 'Inversión Privada'
  const acreedorNombre = instrumento.tipo === 'CREDITO_BANCARIO' && instrumento.acreedor_nombre
    ? instrumento.acreedor_nombre
    : inversor.nombre

  return (
    <Document title={`Reporte ${acreedorNombre} ${periodo.mes}`} author="Areben Dashboard">
      <Page size="A4" style={styles.page}>
        {/* Encabezado */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.brandTag}>AREBEN · GESTIÓN INTERNA</Text>
            <Text style={styles.brandTitle}>Areben Dashboard</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.emisionLabel}>EMITIDO</Text>
            <Text style={styles.emisionDate}>{formatTimestamp(generadoEn)}</Text>
          </View>
        </View>

        {/* Título */}
        <Text style={styles.title}>Reporte de período de inversión</Text>
        <Text style={styles.subtitle}>
          {acreedorNombre} · {tipoLabel} · {formatMonthLong(periodo.mes)}
        </Text>

        {/* Bloque clave con datos resumen */}
        <View style={styles.keyBlock}>
          <View style={styles.keyCol}>
            <Text style={styles.keyLabel}>Capital inicial</Text>
            <Text style={styles.keyValue}>{formatMoney(periodo.saldo_inicio, instrumento.moneda)}</Text>
          </View>
          <View style={styles.keyCol}>
            <Text style={styles.keyLabel}>Interés devengado</Text>
            <Text style={[styles.keyValue, { color: COLOR_ACCENT }]}>{formatMoney(periodo.interes_devengado, instrumento.moneda)}</Text>
          </View>
          <View style={styles.keyCol}>
            <Text style={styles.keyLabel}>Capital al cierre</Text>
            <Text style={styles.keyValue}>{formatMoney(periodo.saldo_cierre, instrumento.moneda)}</Text>
          </View>
        </View>

        {/* Datos del acreedor/inversor */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Acreedor / Inversor</Text>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Nombre</Text>
            <Text style={styles.rowValue}>{acreedorNombre}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Tipo de instrumento</Text>
            <Text style={styles.rowValue}>{tipoLabel}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Categoría de inversor</Text>
            <Text style={styles.rowValue}>{inversor.tipo === 'empresa' ? 'Empresa' : 'Persona física'}</Text>
          </View>
          {instrumento.codigo && (
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Código del instrumento</Text>
              <Text style={styles.rowValue}>{instrumento.codigo}</Text>
            </View>
          )}
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Moneda</Text>
            <Text style={styles.rowValue}>{instrumento.moneda}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Capitalizable</Text>
            <Text style={styles.rowValue}>{instrumento.capitalizable ? 'Sí — el interés se reinvierte' : 'No — el interés se paga'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Fecha de inicio del instrumento</Text>
            <Text style={styles.rowValue}>{instrumento.fecha_inicio.split('-').reverse().join('/')}</Text>
          </View>
        </View>

        {/* Datos del período */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Período</Text>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Mes</Text>
            <Text style={styles.rowValue}>{formatMonthLong(periodo.mes)} ({periodo.mes})</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Fecha de inicio del período</Text>
            <Text style={styles.rowValue}>{fechaInicioMes(periodo.mes)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Fecha de cierre del período</Text>
            <Text style={styles.rowValue}>{fechaFinMes(periodo.mes)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Días del período</Text>
            <Text style={styles.rowValue}>{diasDelMes(periodo.mes)} días</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Tasa mensual aplicada</Text>
            <Text style={styles.rowValue}>{formatPercent(tasa_aplicada)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Estado del período</Text>
            <View style={[styles.badge, periodo.cerrado ? styles.badgeGreen : styles.badgeAmber]}>
              <Text>{periodo.cerrado ? 'CERRADO' : 'ABIERTO'}</Text>
            </View>
          </View>
          {periodo.fecha_cierre && (
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Cerrado el</Text>
              <Text style={styles.rowValue}>{formatTimestamp(periodo.fecha_cierre)}</Text>
            </View>
          )}
        </View>

        {/* Cálculo financiero */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cálculo financiero</Text>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>(A) Capital al inicio del período</Text>
            <Text style={styles.rowValueMono}>{formatMoney(periodo.saldo_inicio, instrumento.moneda)}</Text>
          </View>
          {/* En NO capitalizable, el interés NO se suma al capital — se paga aparte */}
          {instrumento.capitalizable && (
            <View style={styles.row}>
              <Text style={styles.rowLabel}>(B) Interés devengado (se reinvierte)</Text>
              <Text style={[styles.rowValueMono, { color: COLOR_ACCENT }]}>+ {formatMoney(periodo.interes_devengado, instrumento.moneda)}</Text>
            </View>
          )}
          {periodo.movimiento !== 0 && (
            <View style={styles.row}>
              <Text style={styles.rowLabel}>{instrumento.capitalizable ? '(C)' : '(B)'} Movimientos del período (ingresos/retiros)</Text>
              <Text style={styles.rowValueMono}>
                {periodo.movimiento >= 0 ? '+ ' : '- '}{formatMoney(Math.abs(periodo.movimiento), instrumento.moneda)}
              </Text>
            </View>
          )}
          <View style={[styles.row, { borderBottomWidth: 1.5, borderBottomColor: COLOR_PRIMARY, marginTop: 4 }]}>
            <Text style={[styles.rowLabel, { color: COLOR_TEXT, fontWeight: 700 }]}>(=) Capital al cierre del período</Text>
            <Text style={styles.rowValueStrong}>{formatMoney(periodo.saldo_cierre, instrumento.moneda)}</Text>
          </View>

          {/* En NO capitalizable, mostrar el interés aparte */}
          {!instrumento.capitalizable && (
            <View style={[styles.row, { marginTop: 8, borderBottomWidth: 0 }]}>
              <Text style={[styles.rowLabel, { color: COLOR_TEXT, fontWeight: 700 }]}>
                Interés a pagar al inversor (no se reinvierte)
              </Text>
              <Text style={[styles.rowValueStrong, { color: COLOR_ACCENT }]}>
                {formatMoney(periodo.interes_devengado, instrumento.moneda)}
              </Text>
            </View>
          )}
        </View>

        {/* Gasto generado */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Gasto financiero registrado</Text>
          {gasto ? (
            <>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Referencia interna</Text>
                <Text style={[styles.rowValue, { fontFamily: 'Courier' }]}>#{gasto.id.slice(0, 8).toUpperCase()}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Subcategoría</Text>
                <Text style={styles.rowValue}>{instrumento.tipo === 'CREDITO_BANCARIO' ? 'Créditos Bancarios' : 'Inversores Privados'}</Text>
              </View>
              {gasto.moneda_origen === 'USD' && gasto.monto_origen !== null && gasto.tipo_cambio_aplicado !== null ? (
                <>
                  <View style={styles.row}>
                    <Text style={styles.rowLabel}>Monto en moneda original</Text>
                    <Text style={styles.rowValueMono}>{formatMoney(gasto.monto_origen, 'USD')}</Text>
                  </View>
                  <View style={styles.row}>
                    <Text style={styles.rowLabel}>Tipo de cambio aplicado</Text>
                    <Text style={styles.rowValueMono}>{formatMoney(gasto.tipo_cambio_aplicado, 'ARS')} / USD</Text>
                  </View>
                  <View style={styles.row}>
                    <Text style={styles.rowLabel}>Monto convertido a ARS</Text>
                    <Text style={[styles.rowValueMono, { fontWeight: 700, color: COLOR_ACCENT }]}>{formatMoney(gasto.monto, 'ARS')}</Text>
                  </View>
                </>
              ) : (
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>Monto del gasto</Text>
                  <Text style={[styles.rowValueMono, { fontWeight: 700, color: COLOR_ACCENT }]}>{formatMoney(gasto.monto, gasto.moneda)}</Text>
                </View>
              )}
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Estado del pago</Text>
                <View style={[
                  styles.badge,
                  gasto.estado === 'PAGADO' ? styles.badgeGreen : gasto.estado === 'VENCIDO' ? styles.badgeRed : styles.badgeAmber,
                ]}>
                  <Text>{gasto.estado}</Text>
                </View>
              </View>
            </>
          ) : (
            <View style={styles.noticeBox}>
              <Text>
                Este período aún no tiene un gasto financiero registrado. El gasto se crea automáticamente al cerrar el período desde
                la pantalla de Cierre Mensual de Inversiones.
              </Text>
            </View>
          )}
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text>Reporte generado automáticamente por Areben Dashboard · Documento interno</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
