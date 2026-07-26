import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NumberInput } from '@/components/ui/number-input'
import { Input } from '@/components/ui/input'

const html = (el: React.ReactElement) => renderToStaticMarkup(el)
const noop = () => {}

describe('NumberInput — estructura que genera', () => {
  it('SIN label va pelado, sin <div> alrededor', () => {
    // Importante: muchos campos están puestos directo adentro de una fila flex
    // o una celda de grilla. Un <div> de más ahí desacomoda el diseño.
    const out = html(<NumberInput value={5} onChange={noop} className="w-32" />)
    expect(out.startsWith('<input')).toBe(true)
    expect(out).not.toContain('<div')
  })

  it('CON label arma el campo completo (label + input)', () => {
    const out = html(<NumberInput label="Monto" value={5} onChange={noop} />)
    expect(out).toContain('<div')
    expect(out).toContain('<label')
    expect(out).toContain('Monto')
  })

  it('conserva los atributos del formulario (name, step, min)', () => {
    const out = html(<NumberInput name="monto_pesos" step="0.01" min="0" value={5} onChange={noop} />)
    expect(out).toContain('name="monto_pesos"')
    expect(out).toContain('step="0.01"')
    expect(out).toContain('min="0"')
    expect(out).toContain('type="number"')
  })
})

describe('los campos con etiqueta se ven igual que antes', () => {
  // Los 17 campos que usaban <Input type="number"> pasaron a NumberInput.
  // El HTML tiene que ser el mismo (mismas clases, misma estructura), si no
  // el formulario cambia de aspecto.
  // Lo que define cómo se ve: las clases de cada elemento y el orden de los
  // elementos. El orden de los atributos adentro del tag no cambia nada visual.
  const formaDe = (s: string) => ({
    tags: [...s.matchAll(/<(\w+)/g)].map((m) => m[1]),
    clases: [...s.matchAll(/class="([^"]*)"/g)].map((m) => m[1]),
  })

  it('mismas clases y misma estructura que el <Input> viejo', () => {
    const viejo = html(<Input label="Monto" name="monto" type="number" step="0.01" />)
    const nuevo = html(<NumberInput label="Monto" name="monto" step="0.01" value={null} onChange={noop} />)
    expect(formaDe(nuevo)).toEqual(formaDe(viejo))
  })

  it('el estado de error se ve igual', () => {
    const viejo = html(<Input label="Monto" type="number" error="Falta el monto" />)
    const nuevo = html(<NumberInput label="Monto" error="Falta el monto" value={null} onChange={noop} />)
    expect(formaDe(nuevo)).toEqual(formaDe(viejo))
    expect(nuevo).toContain('Falta el monto')
  })
})

describe('NumberInput — qué muestra el campo', () => {
  it('el cero de un alta se ve vacío', () => {
    expect(html(<NumberInput value={0} onChange={noop} />)).toContain('value=""')
  })

  it('el cero cargado a propósito se ve como 0', () => {
    // Max Capital cerró junio en $0: el campo tiene que mostrarlo
    expect(html(<NumberInput value={0} onChange={noop} mostrarCero />)).toContain('value="0"')
  })

  it('sin dato → vacío', () => {
    expect(html(<NumberInput value={null} onChange={noop} />)).toContain('value=""')
    expect(html(<NumberInput value={undefined} onChange={noop} />)).toContain('value=""')
  })

  it('un monto se ve tal cual', () => {
    expect(html(<NumberInput value={28000000} onChange={noop} />)).toContain('value="28000000"')
  })

  it('un negativo se ve tal cual', () => {
    expect(html(<NumberInput value={-34122} onChange={noop} />)).toContain('value="-34122"')
  })

  it('un cálculo roto no muestra la palabra NaN', () => {
    const out = html(<NumberInput value={NaN} onChange={noop} />)
    expect(out).toContain('value=""')
    expect(out).not.toContain('NaN')
  })

  it('el campo deshabilitado sigue mostrando su valor', () => {
    const out = html(<NumberInput value={100} onChange={noop} disabled />)
    expect(out).toContain('value="100"')
    expect(out).toContain('disabled')
  })
})
