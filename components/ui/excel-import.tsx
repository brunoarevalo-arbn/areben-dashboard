'use client'

import { useState, useTransition } from 'react'
import * as XLSX from 'xlsx'
import { Modal } from './modal'
import { Button } from './button'
import { Upload, Download, FileSpreadsheet, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'

interface ExcelImportProps {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: string
  description: string
  templateColumns: { key: string; label: string; required?: boolean; example?: string | number }[]
  onImport: (rows: Record<string, unknown>[]) => Promise<{ ok: number; errors: string[] }>
  templateName?: string
}

export function ExcelImport({
  open, onOpenChange, title, description, templateColumns, onImport, templateName = 'plantilla',
}: ExcelImportProps) {
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null)
  const [result, setResult] = useState<{ ok: number; errors: string[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function descargarTemplate() {
    const headers = templateColumns.map((c) => c.label)
    const ejemplo = templateColumns.map((c) => c.example ?? '')
    const data = [headers, ejemplo]
    const ws = XLSX.utils.aoa_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Plantilla')
    XLSX.writeFile(wb, `template-${templateName}.xlsx`)
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null)
    setResult(null)
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        const sheet = wb.Sheets[wb.SheetNames[0]]
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null })

        // Mapear nombres de columnas (label) a keys
        const labelToKey = Object.fromEntries(templateColumns.map((c) => [c.label, c.key]))
        const mapped = json.map((row) => {
          const out: Record<string, unknown> = {}
          for (const [label, val] of Object.entries(row)) {
            const key = labelToKey[label]
            if (key) out[key] = val
          }
          return out
        })
        setRows(mapped)
      } catch (err) {
        setError('Error al leer el archivo: ' + (err as Error).message)
      }
    }
    reader.readAsArrayBuffer(file)
  }

  function importar() {
    if (!rows) return
    startTransition(async () => {
      try {
        const r = await onImport(rows)
        setResult(r)
      } catch (e) {
        setError((e as Error).message)
      }
    })
  }

  function close() {
    setRows(null)
    setResult(null)
    setError(null)
    onOpenChange(false)
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={title} description={description} className="max-w-lg">
      <div className="space-y-4">
        {/* Paso 1: descargar template */}
        <div className="bg-surface-2/60 border border-border-strong/60 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-fg-muted">
            <FileSpreadsheet className="w-4 h-4" />
            1. Descargá la plantilla
          </div>
          <p className="text-xs text-fg-soft">
            Plantilla con las columnas correctas y un ejemplo. Llenala y volvela a subir.
          </p>
          <Button variant="secondary" size="sm" onClick={descargarTemplate} title="Descargar plantilla Excel">
            <Download className="w-3.5 h-3.5" />
            Descargar plantilla.xlsx
          </Button>
          <div className="text-xs text-fg-soft mt-2">
            <p className="font-medium text-fg-muted mb-1">Columnas:</p>
            <ul className="space-y-0.5 list-disc list-inside">
              {templateColumns.map((c) => (
                <li key={c.key}>
                  <span className={c.required ? 'text-amber-700' : ''}>{c.label}</span>
                  {c.required && <span className="text-amber-700 ml-1">*</span>}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Paso 2: subir */}
        <div className="bg-surface-2/60 border border-border-strong/60 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-fg-muted">
            <Upload className="w-4 h-4" />
            2. Subí el archivo
          </div>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFile}
            className="block w-full text-sm text-fg-muted file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-orange-500 file:text-white hover:file:bg-orange-500 file:cursor-pointer"
          />
          {rows !== null && (
            <p className="text-xs text-fg-muted">
              <CheckCircle2 className="w-3.5 h-3.5 inline mr-1 text-green-700" />
              {rows.length} filas leídas
            </p>
          )}
        </div>

        {error && (
          <div className="text-sm text-red-700 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {result && (
          <div className="space-y-2">
            <div className={`text-sm rounded-lg px-3 py-2 border ${result.errors.length === 0 ? 'bg-green-500/10 border-green-500/20 text-green-700' : 'bg-amber-500/10 border-amber-500/20 text-amber-700'}`}>
              <CheckCircle2 className="w-4 h-4 inline mr-1" />
              {result.ok} fila(s) importadas correctamente
            </div>
            {result.errors.length > 0 && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 space-y-1">
                <p className="text-xs font-medium text-red-700">Errores:</p>
                {result.errors.slice(0, 10).map((e, i) => (
                  <p key={i} className="text-xs text-danger">• {e}</p>
                ))}
                {result.errors.length > 10 && <p className="text-xs text-red-700">...y {result.errors.length - 10} más</p>}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={close} title="Cerrar">
            {result ? 'Cerrar' : 'Cancelar'}
          </Button>
          {!result && (
            <Button onClick={importar} disabled={!rows || isPending} title="Importar al sistema">
              {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Importar {rows ? `${rows.length} fila(s)` : ''}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}
