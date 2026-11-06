import { describe, expect, it } from 'vitest'
import {
  aNumero,
  columnasCartola,
  esColumnaMonto,
  extraerMovimientos,
  filaDeMovimiento,
  monedaDeColumna,
} from './pdfCartola'

describe('columnasCartola', () => {
  it('coincide con el esquema del Excel de ejemplo en CLP', () => {
    expect(columnasCartola('CLP')).toEqual([
      'Fecha',
      'Descripción',
      'Tipo Movimiento',
      'Glosa Detalle',
      'N° Referencia',
      'RUT Contraparte',
      'Nombre Contraparte',
      'Cargo (CLP)',
      'Abono (CLP)',
      'Saldo (CLP)',
    ])
  })

  it('usa el sufijo USD para cartolas en dólares', () => {
    const cols = columnasCartola('USD')
    expect(cols.slice(7)).toEqual(['Cargo (USD)', 'Abono (USD)', 'Saldo (USD)'])
  })
})

describe('esColumnaMonto / monedaDeColumna', () => {
  it('detecta columnas de monto y su moneda', () => {
    expect(esColumnaMonto('Cargo (CLP)')).toBe(true)
    expect(esColumnaMonto('Saldo (USD)')).toBe(true)
    expect(esColumnaMonto('Fecha')).toBe(false)
    expect(monedaDeColumna('Abono (USD)')).toBe('USD')
    expect(monedaDeColumna('Abono (CLP)')).toBe('CLP')
  })
})

describe('filaDeMovimiento', () => {
  it('ordena los campos según las columnas de la cartola', () => {
    const fila = filaDeMovimiento({
      fecha: '02/01/2026',
      descripcion: 'Transferencia enviada',
      tipoMovimiento: 'Cheque',
      glosaDetalle: 'Cheque - Ref: 4516',
      referencia: '4516',
      rut: '73.863.691-0',
      nombre: 'Bio Bio Market Ltda.',
      cargo: '5352858',
      abono: '',
      saldo: '23154286',
    })
    expect(fila).toEqual([
      '02/01/2026', 'Transferencia enviada', 'Cheque', 'Cheque - Ref: 4516',
      '4516', '73.863.691-0', 'Bio Bio Market Ltda.', '5352858', '', '23154286',
    ])
  })
})

describe('extraerMovimientos', () => {
  it('mapea el arreglo movimientos y descarta filas totalmente vacías', () => {
    const filas = extraerMovimientos({
      movimientos: [
        { fecha: '02/01/2026', abono: '1615544', saldo: '28507144' },
        { fecha: '', descripcion: '', cargo: '', abono: '' },
        { fecha: '03/01/2026', cargo: '349741' },
      ],
    })
    expect(filas).toHaveLength(2)
    expect(filas[0][0]).toBe('02/01/2026')
    expect(filas[1][7]).toBe('349741')
  })

  it('devuelve [] cuando no hay movimientos', () => {
    expect(extraerMovimientos({})).toEqual([])
    expect(extraerMovimientos({ movimientos: 'x' })).toEqual([])
  })
})

describe('aNumero en CLP (enteros)', () => {
  it('descarta separadores y decimales', () => {
    expect(aNumero('1615544', 'CLP')).toBe(1615544)
    expect(aNumero('1.615.544', 'CLP')).toBe(1615544)
    expect(aNumero('$ 8.400', 'CLP')).toBe(8400)
    expect(aNumero('-349741', 'CLP')).toBe(-349741)
  })

  it('devuelve null para valores no numéricos o vacíos', () => {
    expect(aNumero('', 'CLP')).toBeNull()
    expect(aNumero('-', 'CLP')).toBeNull()
    expect(aNumero('N/A', 'CLP')).toBeNull()
  })
})

describe('aNumero en USD (conserva decimales)', () => {
  it('mantiene el decimal con punto', () => {
    expect(aNumero('580.24', 'USD')).toBe(580.24)
    expect(aNumero('12.99', 'USD')).toBe(12.99)
    expect(aNumero('17194.0', 'USD')).toBe(17194)
    expect(aNumero('$1,234.56', 'USD')).toBe(1234.56)
  })

  it('interpreta el formato con coma decimal (último separador)', () => {
    expect(aNumero('1.234,56', 'USD')).toBe(1234.56)
    expect(aNumero('-1.000,50', 'USD')).toBe(-1000.5)
  })

  it('devuelve null para vacío o no numérico', () => {
    expect(aNumero('', 'USD')).toBeNull()
    expect(aNumero('-', 'USD')).toBeNull()
  })
})
