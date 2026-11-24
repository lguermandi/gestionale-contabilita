import { DOMParser as XmlDomParser } from '@xmldom/xmldom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseFatturaPaXml } from './fatturaPaImport'

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<FatturaElettronica xmlns="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2">
  <FatturaElettronicaHeader>
    <CedentePrestatore>
      <DatiAnagrafici>
        <IdFiscaleIVA><IdPaese>DE</IdPaese><IdCodice>123456789</IdCodice></IdFiscaleIVA>
        <CodiceFiscale>DE123456789</CodiceFiscale>
        <Anagrafica><Denominazione>Fornitore GmbH</Denominazione></Anagrafica>
      </DatiAnagrafici>
      <Sede>
        <Indirizzo>Musterstrasse</Indirizzo><NumeroCivico>10</NumeroCivico>
        <CAP>10115</CAP><Comune>Berlin</Comune><Provincia>BE</Provincia>
      </Sede>
    </CedentePrestatore>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <TipoDocumento>TD01</TipoDocumento><Data>2026-11-20</Data><Numero>INV-42</Numero>
        <ImportoTotaleDocumento>122.00</ImportoTotaleDocumento>
      </DatiGeneraliDocumento>
    </DatiGenerali>
    <DatiBeniServizi>
      <DettaglioLinee>
        <Descrizione>Servizio cloud</Descrizione><Quantita>1.00</Quantita>
        <PrezzoUnitario>100.00</PrezzoUnitario><PrezzoTotale>100.00</PrezzoTotale>
        <AliquotaIVA>22.00</AliquotaIVA>
      </DettaglioLinee>
      <DatiRiepilogo><ImponibileImporto>100.00</ImponibileImporto><Imposta>22.00</Imposta></DatiRiepilogo>
    </DatiBeniServizi>
    <DatiPagamento><DettaglioPagamento><DataScadenzaPagamento>2026-12-20</DataScadenzaPagamento></DettaglioPagamento></DatiPagamento>
  </FatturaElettronicaBody>
</FatturaElettronica>`

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('importazione XML FatturaPA', () => {
  it('estrae fornitore, righe, imponibile, IVA, totale e scadenza da XML namespaced', () => {
    vi.stubGlobal('DOMParser', XmlDomParser)

    expect(parseFatturaPaXml(xml)).toEqual({
      data: '2026-11-20',
      dataScadenza: '2026-12-20',
      documentType: 'TD01',
      numeroDocumento: 'INV-42',
      fornitore: {
        ragioneSociale: 'Fornitore GmbH',
        indirizzo: 'Musterstrasse, 10',
        partitaIva: '123456789',
        codiceFiscale: 'DE123456789',
        nazione: 'DE',
        provincia: 'BE',
        cap: '10115',
        comune: 'Berlin',
      },
      descrizione: 'Servizio cloud',
      righe: [{
        id: 'xml-1',
        descrizione: 'Servizio cloud',
        imponibile: 100,
        aliquotaIva: 22,
      }],
      imponibile: 100,
      iva: 22,
      totale: 122,
    })
  })

  it('rifiuta un XML che non è una fattura elettronica', () => {
    vi.stubGlobal('DOMParser', XmlDomParser)

    expect(() => parseFatturaPaXml('<Documento />')).toThrow('non è una fattura elettronica FatturaPA')
  })
})
