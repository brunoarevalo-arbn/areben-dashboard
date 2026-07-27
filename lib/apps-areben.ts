/**
 * Registro de los sistemas internos de Areben (sección "Nuestras apps").
 *
 * Se repite igual en los tres repos a propósito: son proyectos separados, sin
 * paquete compartido, y este archivo es chico y estable. Duplicarlo cuesta menos
 * que montar y mantener un paquete común.
 *
 * SALTO SILENCIOSO (`?sso=1`): las apps marcadas con `sso: true` aceptan un link
 * a `/login?sso=1`, que dispara el ingreso con Google SIN pantalla (`prompt=none`).
 * Como ya estás autenticado en Google, la vuelta es inmediata y caés adentro: es
 * el mismo efecto que una cookie compartida, pero sin depender del DNS. Si esa
 * app ya tiene sesión propia, su proxy te rebota directo a su home y el `?sso=1`
 * ni se usa.
 *
 * URLs: `dashboard` y `produccion` ya viven en `arebensrl.com` (CNAME a
 * `cname.vercel-dns.com`, DNS only, 27-jul-2026). Las de `vercel.app` siguen
 * funcionando como alias. El monitor está en la cuenta de Vercel de Darío y
 * espera su propio subdominio.
 */

export type AppInterna = {
  id: string
  nombre: string
  descripcion: string
  url: string
  /** Acepta `/login?sso=1` (salto silencioso). Las de Gerardo tienen login propio. */
  sso: boolean
}

/** Cuál de las apps del registro es ESTA: se muestra marcada y sin link. */
export const APP_ACTUAL = 'dashboard'

export const APPS: AppInterna[] = [
  {
    id: 'monitor',
    nombre: 'Monitor',
    descripcion: 'Ventas, stock, fotos y solicitudes del día',
    url: 'https://monitorareben.vercel.app',
    sso: false,
  },
  {
    id: 'produccion',
    nombre: 'Producción',
    descripcion: 'Taller: cortes, escandallos, insumos y costos',
    url: 'https://produccion.arebensrl.com',
    sso: true,
  },
  {
    id: 'dashboard',
    nombre: 'Dashboard',
    descripcion: 'Finanzas: cierres, gastos, nómina y resultados',
    url: 'https://dashboard.arebensrl.com',
    sso: true,
  },
  {
    id: 'ingresos',
    nombre: 'Ingresos',
    descripcion: 'Ingreso de mercadería (sistema de Gerardo)',
    url: 'https://ingreso2.arebensrl.com',
    sso: false,
  },
  {
    id: 'logistica',
    nombre: 'Logística',
    descripcion: 'Preparación y envíos (sistema de Gerardo)',
    url: 'https://logistica.arebensrl.com',
    sso: false,
  },
]

/**
 * A dónde apunta el link de cada app. Las que soportan el salto entran solas;
 * el resto abre su propia pantalla de ingreso.
 */
export function linkDe(app: AppInterna): string {
  return app.sso ? `${app.url}/login?sso=1` : app.url
}
