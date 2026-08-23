<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# areben-dashboard

Sistema financiero y comercial de Areben: gastos, pagos, cierre de mes, patrimonio, inversores,
nómina, compras y análisis. Next 16 (App Router) + React 19 + Supabase + Vercel.

**No confundir con `areben-produccion`** (taller: cortes, escandallos, insumos) ni con
`monitor-areben` (producto, stock, rotación). Son tres repos distintos. Lo de producto y rotación
vive en el monitor y **no se duplica acá**.

Este archivo se carga en **cada** sesión de IA: cada línea se paga siempre. Entra solo lo que evita
un error caro o una búsqueda repetida. Techo: 160 líneas.

## ⛔ Invariantes — romper una de estas cuesta caro

**Las migraciones se aplican con el script, nunca con un ORM.** No hay Prisma ni Supabase CLI acá:
`node scripts/apply-migrations.mjs 063_saldos_revisados` (nombre sin `.sql`, admite varios). Lee
`DATABASE_URL` de `.env.local` y corre cada archivo en su propia transacción. Los `.sql` de
`supabase/migrations/` se escriben **idempotentes** (`IF NOT EXISTS` / `ON CONFLICT`) porque se
re-corren. Van numerados correlativos (con un hueco en 066-068); el último es el 075.

**Los movimientos de plata de un instrumento viven en `movimientos_instrumento`** (mig 075), uno por
renglón, con su día y su motivo. `periodos_instrumento.movimiento` y `.fecha_movimiento` quedaron
como **caché derivada** que recalcula `regenerarPeriodosDB`: se leen, no se escriben a mano. Un
movimiento **sin fecha mueve el saldo pero no ajusta el interés** — es la semántica de los que venían
de antes, y por eso se migraron sin día: inventarles uno cambiaría meses ya cerrados.

**Toda server action mutadora arranca con `await requireUser()`** (`lib/supabase/server.ts`). Es
defensa en profundidad sobre la RLS `authenticated_all`: sin eso, la action queda invocable sin
sesión. Dos excepciones legítimas: `app/actions/auth.ts` y `app/actions/horas-publicas.ts` — esta
última es la carga de horas extras del propio empleado (`/horas/<token>`, exceptuada también en
`proxy.ts`), donde la autorización es el token del link: no escribe con `.from(...)` sino por las
funciones `security definer` de la migración 077, únicas ejecutables por `anon`, y todo lo que
entra nace `PENDIENTE` hasta que alguien lo aprueba.

**`proxy.ts` es el middleware** — Next 16 renombró `middleware.ts` a `proxy.ts` y la función
exportada es `proxy()`. `/auth/*` está excluido del guard **a propósito**: la vuelta de Google llega
sin sesión, trayendo el `code` a canjear. Si se la trata como ruta privada, el login entra en loop
infinito (login → Google → callback → login).

**Retiros de socios: ARS o USD, nunca los dos** (`lib/retiros.ts`). Un retiro dolarizado vale por su
USD y su `monto_pesos` queda solo como origen histórico. Y **un dolarizado puede ser negativo**
(devolución), así que `usd > 0` NO sirve para detectar si está dolarizado: se mira `convertido_at`.
Sumar ambos lados es doble conteo directo sobre el patrimonio.

**El estado de un gasto es COMPUTADO, no se guarda** (`lib/gastos-estado.ts`). Pagado / Devengado /
Cuenta corriente / Pago programado / Vencido / Pendiente salen de los pagos y del concepto, con esa
prioridad. Filtrar por `estado` contra la DB da resultados mal: se filtra client-side. Un pago sin
`fecha_pago` se cae del pasivo.

**El cierre de mes es una foto a la fecha de corte**, no el estado de hoy: todo se calcula por fecha
≤ corte, nunca por "lo que está tildado ahora". Mayo-2026 es el primer mes con PN — **abril no se
cierra**.

**Nómina: motor único en `lib/calc/nomina.ts`.** No recalcular sueldos en un client ni en una
action. Los empleados en negro llevan 0 cargas patronales.

**La liquidación sólo mira las horas extras `estado='APROBADA'`.** `reconciliarHorasExtras`
(`app/actions/rrhh.ts`) **borra** los candidatos que no vengan en las líneas del formulario: sin
ese filtro, liquidar el mes se come en silencio lo que el empleado cargó por su link y todavía
nadie aprobó. Lo que se carga de adentro nace `APROBADA` y se comporta como siempre.

**Gestión Nube es multi-cuenta** (`lib/gestion-nube/client.ts`): el token va por parámetro, leído de
`GN_TOKEN_<ALIAS>` (BDI / ZATTIA). La API es inestable y no banca `per_page > 50`; todo pasa por el
retry con backoff del cliente. El IVA depende de la cuenta de cobro, no de la marca.

**El mes activo viaja por `?mes=YYYY-MM`.** `MesActivoProvider` (cliente) garantiza que el param
esté siempre en la URL, sincronizado con `localStorage`; las pages server lo leen de
`searchParams.mes`. El default lo da `getMesActivo()`: el siguiente al último cierre confirmado, no
el mes calendario.

**Repo compartido con el hermano de Bruno, en el mismo `main`.** No pushear a `main` sin coordinar y
evitar `components/layout/sidebar.tsx`, que es donde chocan siempre. El trabajo va en ramas
`feat/…` / `fix/…`.

## Arquitectura

Cadena estándar de una pantalla:

`app/(dashboard)/<area>/<x>/page.tsx` — server, resuelve tabs y hace `await searchParams` →
`components/<area>/<x>-panel.tsx` — server component que fetchea Supabase (no todas las rutas lo
tienen; las simples fetchean en la page) → `components/<area>/<x>-client.tsx` — la UI, `'use client'` →
`app/actions/<dominio>.ts` — mutaciones con `requireUser()` + `revalidatePath()`.

Dos grupos de rutas: `(auth)` para el login y `(dashboard)` para todo lo demás, con el shell y el
sidebar. Supabase por `lib/supabase/server.ts` (server, con `server-only`) y `client.ts` (browser).
Cálculo puro y testeable en `lib/calc/` y en los `lib/*-calc.ts`. Zustand (`store/`) solo tiene un
flag de loading: el estado real vive en la URL y en el server. PDFs con `@react-pdf/renderer` en
`lib/pdf/`, servidos por `app/api/reportes/`.

## Mapa de secciones

`ruta → components/… + app/actions/…`. El sidebar (`components/layout/sidebar.tsx`) se escribe a
mano; muchas entradas son la misma page con `?tab=`.

**Finanzas** (`app/(dashboard)/finanzas/`, actions en `finanzas.ts` salvo aclaración) —
`cierre-mes` · `gastos` (+ tab `fijos` → `recurrentes-client`) · `pagos` (+ tab `pendientes` →
`pendientes-client`, el más grande) · `vencimientos` (`vencimientos.ts`) · `cuentas-corrientes`
(`cuentas-corrientes.ts`) · `tarjetas` · `saldos` (tesorería) · `cuentas-patrimoniales` (tabs
`mercaderia` / `activo-fijo` / `impositivos` / `otros-activos` / `bienes` / `cuentas-particulares`,
cada uno su `*-panel.tsx`) · `cuenta-socios` → `socios-client` · `afip` (+ tab `planes` →
`planes-afip.ts`) · `prestamos` (`prestamos.ts`) · `saldos-acumulados` · `saldos-impositivos` ·
`recurrentes` · `pendientes`

**Inversiones** (`inversiones.ts`) — `/inversiones` (inversores) · `/inversiones/[id]` ·
`prestamos` (capital de inversores) · `cierre` · `gastos` (financieros) · `reporte`

**RR.HH.** (`rrhh.ts`) — `empleados` · `nomina` · `vacaciones`

**Compras** (`compras.ts`) — `proveedores` · `lista` → `compras-client` · `produccion` · `costeo`
(importación) · `proyecciones`

**Egresos** (`pagos.ts`) — `pagos` · `cheques`

**Análisis** — `gn` → `analitica-gn-client` (`gestion-nube.ts`) · `ventas` · `pl-marca` ·
`cash-flow` · `exportar`

**Configuración** — `empresa` · `prorrateo` · `aportes` · `depreciacion` · `comisiones`
(`comisiones.ts`) · `cuentas-cobro` (`cuentas-cobro.ts`) · `api-gestion-nube`

**Home** (`app/(dashboard)/page.tsx`) — KPIs + panel de estado del mes por sector
(`estado-sectores.ts`). Los sectores marcables se definen a mano en `lib/sectores.ts`; hoy hay uno
solo.

## Comandos

```bash
npx tsc --noEmit    # no hay script `typecheck` en package.json
npm run lint        # eslint
npm run test        # vitest run (7 archivos en __tests__/, corta)
npm run build       # next build
npm run dev         # next dev — acá sí, no hace falta vercel dev
```

**No hay CI**: no existe `.github/workflows/`. Nadie corre esto por vos — typecheck y lint antes de
pushear, siempre.

Scripts de sincronización con Gestión Nube (`scripts/sync-*.mjs`) y de inspección
(`check-schema.mjs`, `gn-probe.mjs`): se corren a mano con `node`, pegan contra la DB real.

## Higiene de contexto

Todo lo que entra al contexto se re-paga en cada turno, así que un output largo temprano cuesta
varias veces su tamaño.

- **Los archivos caros se leen por rango, no enteros.** Los peores: `app/actions/finanzas.ts`
  (2.731 líneas) · `components/finanzas/pendientes-client.tsx` (2.023) ·
  `components/finanzas/cierre-mes-client.tsx` (1.414) · `recurrentes-client.tsx` (1.358) ·
  `app/actions/rrhh.ts` (1.305) · `components/rrhh/empleados-client.tsx` (1.231) ·
  `gastos-client.tsx` (1.170) · `saldos-client.tsx` (1.004) · `types/database.ts` (951 — es data
  generada, casi nunca hace falta entera).
- **Tests: uno por vez**, `npx vitest run __tests__/<archivo>.test.ts --reporter=dot`.
- **Comandos largos van cortados**: `git log`, builds y deploys con `| tail -30`.
- **Avisar el `/clear` al cerrar cada unidad de trabajo** — Bruno no lo tiene que pedir. El marcador
  natural es después de deployar y verificar. El criterio no es "cambió el tema" sino **"¿vamos a
  volver a abrir los mismos archivos?"**. Donde más rinde es justo después de resolver un bug
  difícil: ese contexto es casi todo intento fallido. Dentro de una tarea sin terminar va
  `/compact`, no `/clear`.

## Estilo

Acento **terracota** (`--primary:#e07840`), sidebar navy en ambos modos. Los tokens son CSS real en
`app/globals.css`, con tema claro/oscuro por `[data-theme]` — no se hardcodean colores en las
clases. Tailwind v4 (sin `tailwind.config`, todo por `@import "tailwindcss"`).

Kit en `components/ui/`: `button` · `badge` · `input` · `modal` · `tabs` · `sortable` ·
`info-popover` · `excel-import` · **`number-input` y `money-input`**. Todo campo numérico usa esos
dos: resuelven el `0` pegado adelante al escribir. Reusar el kit antes de escribir un componente
nuevo.
