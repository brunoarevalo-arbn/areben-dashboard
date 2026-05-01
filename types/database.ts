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
  negocio: Marca
  mes: string
  estado: EstadoGasto
  fecha_pago?: string | null
  notas?: string | null
  created_at: string
  updated_at: string
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
  socio: string
  fecha: string
  monto_usd: number
  monto_pesos: number
  tipo_cambio: number
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
  dni: string
  email?: string | null
  telefono?: string | null
  tipo_empleado: TipoEmpleado
  sueldo_basico: number
  valor_hora: number
  cbu?: string | null
  banco?: string | null
  metodo_pago?: MetodoPago | null
  fecha_ingreso: string
  fecha_egreso?: string | null
  activo: boolean
  fecha_nacimiento?: string | null
  created_at: string
  updated_at: string
}

export interface NominaMensual {
  id: string
  empleado_id: string
  mes: string
  sueldo_basico: number
  horas_trabajadas: number
  valor_hora: number
  horas_extras: number
  comida: number
  aguinaldo: number
  aportes_empleado: number
  aportes_patronales: number
  subtotal: number
  neto: number
  costo_empresa: number
  estado: EstadoNomina
  notas?: string | null
  created_at: string
  updated_at: string
  empleado?: Empleado
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
