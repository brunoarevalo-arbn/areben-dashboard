export type Marca = 'BDI' | 'ZATTIA' | 'STUNNED' | 'GENERAL'
export type TipoEmpleado = 'BLANCO' | 'NEGRO'
export type EstadoGasto = 'PENDIENTE' | 'PAGADO' | 'VENCIDO'
export type EstadoNomina = 'PENDIENTE' | 'PAGADO'
export type MetodoPago = 'EFECTIVO' | 'TRANSFERENCIA'
export type TipoAporte = 'PORCENTAJE' | 'MONTO_FIJO'

export interface Gasto {
  id: string
  categoria: string
  concepto: string
  monto: number
  monto_neto: number
  moneda: 'ARS' | 'USD'
  monto_secundario?: number | null
  moneda_secundaria?: 'ARS' | 'USD' | null
  iva_incluido: boolean
  porcentaje_iva: number
  negocio: Marca
  mes: string
  fecha: string
  estado: EstadoGasto
  fecha_pago?: string | null
  notas?: string | null
  recurrente_id?: string | null
  prorrateo?: ProrrateoMarcas | null
  medio_pago?: string | null
  cuenta_id?: string | null
  cuenta_origen_pago_id?: string | null
  tarjeta_id?: string | null
  cuotas_total?: number | null
  detalles?: Record<string, unknown> | null
  confirmado: boolean
  /** Si el gasto se paga financiado (cuotas con interés) */
  tiene_intereses?: boolean
  interes_tipo?: 'MONTO' | 'PORCENTAJE' | null
  interes_valor?: number | null
  /** Snapshot del interés calculado en pesos */
  interes_monto?: number | null
  /** FK al gasto auto-generado de "Gasto Financiero" (en el gasto principal) */
  gasto_intereses_id?: string | null
  /** FK al gasto padre (en el gasto-intereses auto-generado) */
  gasto_padre_id?: string | null
  /** FK opcional al catálogo de subcategorías (mig 033). */
  subcategoria_id?: string | null
  /** FK al instrumento de inversión cuando el gasto proviene de un cierre de período. */
  instrumento_id?: string | null
  /** FK al período del instrumento (UNIQUE: un período = un gasto). */
  periodo_instrumento_id?: string | null
  /** TRUE si el sistema creó este gasto automáticamente. */
  auto_generado?: boolean
  /** Origen lógico del auto-generado: INVERSION_CIERRE, APORTES_PATRONALES, GASTO_INTERESES, etc. */
  generado_desde?: string | null
  /** Monto en la moneda original (antes de convertir a ARS si aplicó). */
  monto_origen?: number | null
  /** Moneda original del cálculo (USD/ARS). */
  moneda_origen?: 'ARS' | 'USD' | null
  /** TC aplicado para convertir monto_origen → monto final. */
  tipo_cambio_aplicado?: number | null
  subcategoria?: GastoSubcategoria | null
  created_at: string
  updated_at: string
}

// ============ Catálogo de categorías y subcategorías (mig 033) ============

export interface GastoCategoria {
  id: string
  nombre: string
  slug: string
  orden: number
  activa: boolean
  created_at: string
}

export interface GastoSubcategoria {
  id: string
  categoria_id: string
  nombre: string
  slug: string
  descripcion?: string | null
  orden: number
  activa: boolean
  created_at: string
  categoria?: GastoCategoria
}

export interface SaldoMensual {
  id: string
  mes: string
  saldo_pesos: number
  saldo_usd: number
  caja_pesos: number
  caja_usd: number
  cuentas_corrientes: number
  notas?: string | null
  created_at: string
  updated_at: string
}

export interface RetiroSocio {
  id: string
  socio: string                         // legacy: string libre, ahora se prefiere socio_id
  socio_id?: string | null              // FK a socios (mig 038)
  fecha: string
  mes?: string | null
  monto_usd: number
  monto_pesos: number
  monto_usd_calculado?: number | null
  tipo_cambio: number
  categoria_id?: string | null
  notas?: string | null
  medio_pago?: string | null
  tarjeta_id?: string | null
  cuotas_total?: number | null
  convertido_at?: string | null
  tc_cierre?: number | null
  created_at: string
  categoria?: CategoriaRetiro | null
  socioRel?: Socio | null
}

// ============ SOCIOS (mig 038) ============

export interface Socio {
  id: string
  nombre: string
  alias?: string | null
  porcentaje_participacion: number
  dni?: string | null
  cuit?: string | null
  email?: string | null
  telefono?: string | null
  activo: boolean
  notas?: string | null
  created_at: string
  updated_at: string
}

export interface CategoriaRetiro {
  id: string
  nombre: string
  emoji?: string | null
  color: string
  orden: number
  activo: boolean
  created_at: string
}

// ============ Cuentas / Tesorería ============

export type TipoTitular = 'EMPRESA' | 'SOCIO' | 'OTRO'
export type TipoCuenta = 'BANCO' | 'BILLETERA' | 'CAJA' | 'CTA_CORRIENTE'

export interface CuentaTitular {
  id: string
  nombre: string
  tipo: TipoTitular
  activo: boolean
  created_at: string
}

export interface CuentaBancaria {
  id: string
  titular_id: string
  nombre: string
  banco: string
  tipo: TipoCuenta
  permite_dual: boolean
  activo: boolean
  notas?: string | null
  created_at: string
  titular?: CuentaTitular
}

export interface SaldoCuenta {
  id: string
  cuenta_id: string
  mes: string
  saldo_ars: number
  saldo_usd: number
  cerrado: boolean
  fecha_cierre?: string | null
  notas?: string | null
  created_at: string
  updated_at: string
  cuenta?: CuentaBancaria
}

export interface TipoCambioMes {
  id: string
  mes: string
  tipo_cambio: number
  fuente?: string | null
  notas?: string | null
  created_at: string
}

export interface ActivoManual {
  id: string
  mes: string
  descripcion: string
  categoria?: string | null
  monto: number
  moneda: 'ARS' | 'USD'
  titular_id?: string | null
  notas?: string | null
  created_at: string
  updated_at: string
  titular?: CuentaTitular | null
}

// ============ CUENTAS PATRIMONIALES (plan de cuentas) ============

export type TipoCuentaPatrim =
  | 'INVENTARIO'
  | 'INVERSION'
  | 'PROVISION'
  | 'CTA_CTE_MARCA'
  | 'PASIVO_ROTATIVO'
  | 'IMPOSITIVO'
  | 'OTRO_ACTIVO'
  | 'OTRO_PASIVO'

export interface CuentaPatrimonial {
  id: string
  codigo?: string | null
  nombre: string
  tipo: TipoCuentaPatrim
  categoria?: string | null
  marca?: string | null
  moneda: 'ARS' | 'USD'
  signo_pn: 1 | -1
  saldo_inicial: number
  mes_inicial?: string | null
  notas?: string | null
  activo: boolean
  orden: number
  created_at: string
  updated_at: string
}

export interface SaldoCuentaPatrim {
  id: string
  cuenta_id: string
  mes: string
  saldo_inicio: number
  movimiento: number
  saldo_cierre: number
  notas?: string | null
  created_at: string
  updated_at: string
  cuenta?: CuentaPatrimonial
}

// ============ Tarjetas ============

export type TipoTarjeta = 'CREDITO' | 'DEBITO'

export interface TarjetaCredito {
  id: string
  titular_id?: string | null
  nombre: string
  banco: string
  tipo: TipoTarjeta
  ultimos_4?: string | null
  dia_cierre: number
  dia_vencimiento: number
  limite_ars?: number | null
  activo: boolean
  notas?: string | null
  created_at: string
  titular?: CuentaTitular | null
}

export interface CuotaTarjeta {
  id: string
  tarjeta_id: string
  origen_tipo: 'COMPRA' | 'GASTO' | 'MANUAL'
  origen_id?: string | null
  concepto: string
  monto_total: number
  cuotas_total: number
  cuota_numero: number
  monto_cuota: number
  mes_cierre: string
  mes_vencimiento: string
  /** Fecha exacta de vencimiento (mes + dia_vencimiento de la tarjeta). */
  fecha_vencimiento?: string | null
  pagada: boolean
  fecha_pago?: string | null
  created_at: string
  tarjeta?: TarjetaCredito
}

// ============ Gastos extendidos ============

export interface ProrrateoMarcas {
  BDI?: number
  ZATTIA?: number
  STUNNED?: number
  GENERAL?: number
}

export interface ProrrateoDefault {
  id: string
  nombre: string
  porcentajes: ProrrateoMarcas
  es_default: boolean
  created_at: string
}

export interface GastoRecurrente {
  id: string
  concepto: string
  categoria: string
  monto_estimado: number
  moneda: 'ARS' | 'USD'
  monto_secundario?: number | null
  moneda_secundaria?: 'ARS' | 'USD' | null
  iva_incluido: boolean
  porcentaje_iva: number
  medio_pago: string
  cuenta_id?: string | null
  tarjeta_id?: string | null
  dia_vencimiento?: number | null
  tipo_mes: 'CORRIENTE' | 'VENCIDO'
  prorrateo?: ProrrateoMarcas | null
  detalles?: Record<string, unknown> | null
  notas?: string | null
  activo: boolean
  created_at: string
}

export interface TipoIVA {
  id: string
  nombre: string
  porcentaje: number
  activo: boolean
  orden: number
  created_at: string
}

export interface ConfiguracionProrrateo {
  id: string
  marca: string
  porcentaje: number
  orden: number
  activo: boolean
  updated_at: string
}

// ============ CIERRE DE MES ============

export interface PasivoManual {
  id: string
  descripcion: string
  monto: number
  moneda: 'ARS' | 'USD'
  acreedor?: string | null
  notas?: string | null
}

export interface SnapshotCuenta {
  cuenta_id: string
  titular_nombre: string
  banco: string
  nombre: string
  tipo: string
  saldo_ars: number
  saldo_usd: number
}

export interface CierreMensual {
  id: string
  mes: string
  tipo_cambio: number
  caja_ars: number
  caja_usd: number
  snapshot_cuentas: SnapshotCuenta[]
  snapshot_pasivos: Record<string, unknown>
  snapshot_retiros: Record<string, unknown>
  pasivos_manuales: PasivoManual[]
  total_activos_ars: number
  total_activos_usd: number
  total_pasivos_ars: number
  total_pasivos_usd: number
  pn_ars: number
  pn_usd: number
  total_retiros_ars: number
  total_retiros_usd: number
  resultado_ars: number
  cerrado: boolean
  fecha_cierre?: string | null
  notas?: string | null
  created_at: string
  updated_at: string
}

// ============ INVERSIONES DE TERCEROS ============

export type TipoInversor = 'persona_fisica' | 'empresa'
export type EstadoInstrumento = 'activo' | 'cerrado' | 'renovado'
export type TipoInstrumento = 'INVERSION_PRIVADA' | 'CREDITO_BANCARIO'

export interface Inversor {
  id: string
  nombre: string
  tipo: TipoInversor
  notas?: string | null
  activo: boolean
  /** Datos formales (mig 036) — opcionales, requeridos para comprobantes formales. */
  dni?: string | null
  cuit?: string | null
  domicilio_calle?: string | null
  domicilio_ciudad?: string | null
  domicilio_provincia?: string | null
  domicilio_cp?: string | null
  email?: string | null
  telefono?: string | null
  created_at: string
  updated_at: string
}

// ============ Configuración de empresa (mig 035) ============

export interface ConfiguracionEmpresa {
  id: 1
  razon_social: string
  nombre_fantasia?: string | null
  cuit?: string | null
  condicion_iva?: string | null
  domicilio_calle?: string | null
  domicilio_ciudad?: string | null
  domicilio_provincia?: string | null
  domicilio_cp?: string | null
  domicilio_pais?: string | null
  email?: string | null
  telefono?: string | null
  sitio_web?: string | null
  created_at: string
  updated_at: string
}

export interface Instrumento {
  id: string
  inversor_id: string
  codigo?: string | null
  moneda: 'USD' | 'ARS'
  capital_inicial: number
  tasa_mensual: number
  capitalizable: boolean
  fecha_inicio: string
  fecha_fin?: string | null
  estado: EstadoInstrumento
  notas?: string | null
  /** Distingue inversión privada vs crédito bancario (mig 034). Default INVERSION_PRIVADA. */
  tipo?: TipoInstrumento
  /** Nombre del banco/acreedor si tipo=CREDITO_BANCARIO. */
  acreedor_nombre?: string | null
  /** Datos de contacto del acreedor. */
  acreedor_contacto?: string | null
  /** Plazo del instrumento en días (típicamente 30/60/90/180/270/365). NULL = plazo indeterminado. (mig 037) */
  plazo_dias?: number | null
  created_at: string
  updated_at: string
  inversor?: Inversor
}

export interface PeriodoInstrumento {
  id: string
  instrumento_id: string
  mes: string
  saldo_inicio: number
  interes_devengado: number
  int_inicio_prorrateado: number
  int_fin_prorrateado: number
  movimiento: number
  saldo_cierre: number
  tasa_aplicada: number
  cerrado: boolean
  fecha_cierre?: string | null
  created_at: string
  updated_at: string
  instrumento?: Instrumento
}

export interface TramoTasa {
  id: string
  instrumento_id: string
  tasa_mensual: number
  fecha_desde: string
  notas?: string | null
  created_at: string
}

export interface AfipFacturacion {
  id: string
  mes: string
  motivo: string
  monto: number
  responsable: string
  estado: EstadoGasto
  fecha_vencimiento?: string | null
  created_at: string
}

export interface BienUso {
  id: string
  nombre: string
  tipo: string
  fecha_compra: string
  precio: number
  vida_util_anos: number
  valor_residual: number
  descripcion?: string | null
  activo: boolean
  created_at: string
}

export interface Empleado {
  id: string
  nombre: string
  apellido: string
  dni?: string | null
  email?: string | null
  telefono?: string | null
  tipo_empleado: TipoEmpleado
  sueldo_basico: number
  valor_hora: number
  horas_mensuales: number
  corresponde_aguinaldo: boolean
  porcentaje_aguinaldo: number
  monto_comidas: number
  presentismo_pct: number
  /** Horas mensuales fijas acordadas en negro (no son extras). Suman al aguinaldo. */
  horas_acuerdo_negro: number
  /** Tipo del plus salarial fijo en negro (mensual). Suma al aguinaldo. */
  plus_negro_tipo?: 'MONTO' | 'PORCENTAJE' | null
  /** Si plus_negro_tipo=MONTO → pesos mensuales. Si PORCENTAJE → % sobre monto_recibo_oficial. */
  plus_negro_valor?: number | null
  cbu?: string | null
  banco?: string | null
  metodo_pago?: MetodoPago | null
  fecha_ingreso?: string | null
  fecha_egreso?: string | null
  activo: boolean
  fecha_nacimiento?: string | null
  created_at: string
  updated_at: string
}

export interface HoraExtraRegistro {
  id: string
  empleado_id: string
  fecha: string
  cantidad: number
  porcentaje: number
  notas?: string | null
  incluido_en_nomina_id?: string | null
  created_at: string
}

export type TipoAusencia = 'FALTA' | 'LICENCIA_NO_PAGA' | 'SIN_AVISO' | 'JUSTIFICADA' | 'OTRO'

export interface AusenciaRegistro {
  id: string
  empleado_id: string
  fecha: string
  dias: number
  tipo: TipoAusencia
  justificada: boolean
  monto_descuento: number
  notas?: string | null
  incluido_en_nomina_id?: string | null
  created_at: string
  updated_at: string
}

export type TipoEvento = 'INCIDENCIA' | 'AJUSTE_SALARIAL' | 'LICENCIA' | 'PREMIO' | 'AMONESTACION' | 'OTRO'

export interface EventoEmpleado {
  id: string
  empleado_id: string
  tipo: TipoEvento
  fecha: string
  titulo: string
  descripcion?: string | null
  sueldo_anterior?: number | null
  sueldo_nuevo?: number | null
  created_at: string
}

export interface NominaMensual {
  id: string
  empleado_id: string
  mes: string
  sueldo_basico: number
  horas_trabajadas: number
  valor_hora: number
  valor_hora_real: number
  horas_extras: number
  porcentaje_extras: number
  comida: number
  aguinaldo: number
  aguinaldo_provisionado: number
  aguinaldo_pagado_de_caja: number
  asistencia_completa: boolean
  presentismo_monto: number
  monto_recibo_oficial: number
  adicional_no_registrado: number
  aportes_empleado: number
  aportes_patronales: number
  subtotal: number
  neto: number
  costo_empresa: number
  estado: EstadoNomina
  fecha_programada_pago?: string | null
  gasto_pendiente_id?: string | null
  gasto_aportes_patronales_id?: string | null
  notas?: string | null
  ausencias_descuento?: number
  ausencias_dias?: number
  ausencias_horas?: number
  ausencias_motivo?: string | null
  bono_monto?: number
  bono_concepto?: string | null
  bono_descripcion?: string | null
  descuento_otro_monto?: number
  descuento_otro_concepto?: string | null
  descuento_otro_descripcion?: string | null
  created_at: string
  updated_at: string
  empleado?: Empleado
  pagos_parciales?: PagoParcialNomina[]
  total_pagado?: number
  saldo_pendiente?: number
}

/**
 * Pago: ledger único de salidas. Polimórfico por (tipo_origen, origen_id).
 * - COMPRA: origen_id = compra.id (también compra_id por compatibilidad)
 * - GASTO/NOMINA/CUOTA: origen_id apunta a la entidad correspondiente
 * - LIBRE: origen_id = NULL (cheques históricos sin asignar)
 */
export type TipoOrigenPago = 'COMPRA' | 'GASTO' | 'NOMINA' | 'CUOTA' | 'LIBRE' | 'PRESTAMO'
export type InstrumentoPago = 'EFECTIVO' | 'TRANSFERENCIA' | 'CUENTA_CORRIENTE' | 'CHEQUE_FISICO' | 'ECHEQ' | 'TARJETA'

export interface Pago {
  id: string
  tipo_origen: TipoOrigenPago
  origen_id?: string | null
  compra_id?: string | null
  monto: number
  moneda: 'ARS' | 'USD'
  fecha_emision: string
  fecha_vencimiento?: string | null
  condicion_pago: string
  instrumento: InstrumentoPago
  numero_cheque?: string | null
  banco_emisor?: string | null
  numero_cuota?: number | null
  total_cuotas?: number | null
  cuenta_id?: string | null
  acreditado?: boolean
  fecha_acreditacion?: string | null
  notas?: string | null
  created_at: string
}

/** @deprecated — la tabla pagos_parciales_nomina fue migrada a pagos en 019. Mantenido como alias. */
export type PagoParcialNomina = Pago & {
  nomina_id: string
  fecha: string
  medio_pago: string
}

export interface VacacionEmpleado {
  id: string
  empleado_id: string
  ano: number
  dias_disponibles: number
  dias_tomados: number
  dias_restantes: number
  periodos: VacacionPeriodo[]
  created_at: string
  updated_at: string
  empleado?: Empleado
}

export interface VacacionPeriodo {
  fecha_inicio: string
  fecha_fin: string
  dias: number
  notas?: string
}

export interface ConfiguracionAporte {
  id: string
  nombre: string
  tipo: TipoAporte
  valor: number
  aplicable_a: TipoEmpleado | 'AMBOS'
  es_patronal: boolean
  activo: boolean
  orden: number
  created_at: string
  updated_at: string
}

export interface ConfiguracionDepreciacion {
  id: string
  tipo_bien: string
  vida_util_anos: number
  valor_residual_porcentaje: number
  activo: boolean
  created_at: string
}

export interface Proveedor {
  id: string
  nombre: string
  tipo: 'NACIONAL' | 'IMPORTACION'
  contacto?: string | null
  email?: string | null
  telefono?: string | null
  pais: string
  condiciones_pago?: string | null
  moneda: 'ARS' | 'USD'
  notas?: string | null
  marcas?: string[] | null
  activo: boolean
  created_at: string
}

export interface Compra {
  id: string
  proveedor_id: string
  fecha: string
  descripcion: string
  cantidad: number
  precio_unitario: number
  moneda: 'ARS' | 'USD'
  tipo_cambio?: number | null
  estado: EstadoGasto
  fecha_pago?: string | null
  negocio: Marca
  notas?: string | null
  created_at: string
  proveedor?: Proveedor
}

export interface CosteoImportacion {
  id: string
  compra_id: string
  cif_usd: number
  derechos_porcentaje: number
  tasa_estadistica: number
  iva_importacion: number
  ganancias: number
  servicios_despachante: number
  flete_interno: number
  otros_gastos: number
  tipo_cambio: number
  costo_total_ars: number
  notas?: string | null
  created_at: string
}

export interface DatosVentasGN {
  id: string
  mes: string
  marca: Marca
  ventas_brutas: number
  devoluciones: number
  ventas_netas: number
  cmv: number
  margen_pesos: number
  margen_porcentaje: number
  cantidad_vendida: number
  comisiones: number
  fecha_sincronizacion: string
  sincronizado_por: string
  created_at: string
}

export interface Database {
  public: {
    Tables: {
      gastos: {
        Row: Gasto
        Insert: Omit<Gasto, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Gasto, 'id' | 'created_at' | 'updated_at'>>
      }
      saldos_mensuales: {
        Row: SaldoMensual
        Insert: Omit<SaldoMensual, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<SaldoMensual, 'id' | 'created_at' | 'updated_at'>>
      }
      retiros_socios: {
        Row: RetiroSocio
        Insert: Omit<RetiroSocio, 'id' | 'created_at'>
        Update: Partial<Omit<RetiroSocio, 'id' | 'created_at'>>
      }
      afip_facturacion: {
        Row: AfipFacturacion
        Insert: Omit<AfipFacturacion, 'id' | 'created_at'>
        Update: Partial<Omit<AfipFacturacion, 'id' | 'created_at'>>
      }
      bienes_uso: {
        Row: BienUso
        Insert: Omit<BienUso, 'id' | 'created_at'>
        Update: Partial<Omit<BienUso, 'id' | 'created_at'>>
      }
      empleados: {
        Row: Empleado
        Insert: Omit<Empleado, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Empleado, 'id' | 'created_at' | 'updated_at'>>
      }
      nomina_mensual: {
        Row: NominaMensual
        Insert: Omit<NominaMensual, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<NominaMensual, 'id' | 'created_at' | 'updated_at'>>
      }
      vacaciones_empleados: {
        Row: VacacionEmpleado
        Insert: Omit<VacacionEmpleado, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<VacacionEmpleado, 'id' | 'created_at' | 'updated_at'>>
      }
      configuracion_aportes: {
        Row: ConfiguracionAporte
        Insert: Omit<ConfiguracionAporte, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<ConfiguracionAporte, 'id' | 'created_at' | 'updated_at'>>
      }
      configuracion_depreciacion: {
        Row: ConfiguracionDepreciacion
        Insert: Omit<ConfiguracionDepreciacion, 'id' | 'created_at'>
        Update: Partial<Omit<ConfiguracionDepreciacion, 'id' | 'created_at'>>
      }
      proveedores: {
        Row: Proveedor
        Insert: Omit<Proveedor, 'id' | 'created_at'>
        Update: Partial<Omit<Proveedor, 'id' | 'created_at'>>
      }
      compras: {
        Row: Compra
        Insert: Omit<Compra, 'id' | 'created_at'>
        Update: Partial<Omit<Compra, 'id' | 'created_at'>>
      }
      costeo_importacion: {
        Row: CosteoImportacion
        Insert: Omit<CosteoImportacion, 'id' | 'created_at'>
        Update: Partial<Omit<CosteoImportacion, 'id' | 'created_at'>>
      }
      datos_ventas_gn: {
        Row: DatosVentasGN
        Insert: Omit<DatosVentasGN, 'id' | 'created_at'>
        Update: Partial<Omit<DatosVentasGN, 'id' | 'created_at'>>
      }
    }
  }
}
