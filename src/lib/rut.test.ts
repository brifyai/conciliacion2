import { describe, expect, it } from 'vitest'
import { cuerpoRUT, extraerRUTDeTexto } from './rut'

describe('extraerRUTDeTexto', () => {
  it('recupera el RUT de una glosa con relleno de ceros y guion', () => {
    expect(extraerRUTDeTexto('PAGO RECIBIDO PRV 078187230-K BCO CHILE')).toBe('78187230K')
  })

  it('recupera el RUT pegado al nombre de la contraparte', () => {
    expect(extraerRUTDeTexto('0762690195 Transf. ORIGEN COMUNICA')).toBe('762690195')
  })

  it('ignora textos sin RUT y números de operación del banco', () => {
    expect(extraerRUTDeTexto('TRASPASO FONDOS OTRO BANCO EN LINEA')).toBeUndefined()
    expect(extraerRUTDeTexto('(sin glosa)')).toBeUndefined()
    // Número de operación de 10 dígitos cuyo DV no calza.
    expect(extraerRUTDeTexto('1331863784')).toBeUndefined()
    // Correlativo largo (15 dígitos): nunca debe recortarse como RUT.
    expect(extraerRUTDeTexto('PAC Seg. Fraude 000005501011537')).toBeUndefined()
  })

  it('devuelve vacío para una cadena vacía', () => {
    expect(extraerRUTDeTexto('')).toBeUndefined()
  })
})

describe('cuerpoRUT', () => {
  it('iguala el RUT de la glosa con el del libro pese al relleno de ceros', () => {
    expect(cuerpoRUT('078187230-K')).toBe(cuerpoRUT('78187230K'))
    expect(cuerpoRUT('78187230K')).toBe('78187230')
  })

  it('devuelve vacío cuando no hay RUT', () => {
    expect(cuerpoRUT('')).toBe('')
  })
})
