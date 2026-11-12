import { useState, type RefObject } from 'react'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

export interface ReportExportData {
  title: string
  headers: string[]
  rows: string[][]
}

export function ReportExportActions({
  data,
  reportRef,
}: {
  data: ReportExportData
  reportRef: RefObject<HTMLDivElement | null>
}) {
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')

  async function exportReport(format: 'excel' | 'pdf' | 'jpg') {
    setError('')
    setExporting(true)
    try {
      if (format === 'excel') {
        downloadExcel(data)
      } else if (format === 'pdf') {
        downloadPdf(data)
      } else {
        await downloadJpg(data, reportRef.current)
      }
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'Esportazione non riuscita.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className="rounded border border-stone-300 px-3 py-2 text-sm text-stone-700 hover:bg-stone-100 disabled:opacity-50" onClick={() => void exportReport('excel')} disabled={exporting}>Excel</button>
        <button type="button" className="rounded border border-stone-300 px-3 py-2 text-sm text-stone-700 hover:bg-stone-100 disabled:opacity-50" onClick={() => void exportReport('pdf')} disabled={exporting}>PDF</button>
        <button type="button" className="rounded border border-stone-300 px-3 py-2 text-sm text-stone-700 hover:bg-stone-100 disabled:opacity-50" onClick={() => void exportReport('jpg')} disabled={exporting}>JPG</button>
      </div>
      {error && <p className="mt-2 text-right text-xs text-rose-700" role="alert">{error}</p>}
    </div>
  )
}

function downloadExcel(data: ReportExportData) {
  const cell = (value: string) => `<td>${escapeHtml(value)}</td>`
  const table = `<table><thead><tr>${data.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${data.rows.map((row) => `<tr>${data.headers.map((_, index) => cell(row[index] ?? '')).join('')}</tr>`).join('')}</tbody></table>`
  const html = `<html><head><meta charset="utf-8"></head><body><h1>${escapeHtml(data.title)}</h1>${table}</body></html>`
  downloadBlob(`application/vnd.ms-excel;charset=utf-8`, `\uFEFF${html}`, `${fileName(data.title)}.xls`)
}

function downloadPdf(data: ReportExportData) {
  const document = new jsPDF({ orientation: data.headers.length > 2 ? 'landscape' : 'portrait', format: 'a4', unit: 'mm' })
  document.setFontSize(14)
  document.text(data.title, 14, 16)
  autoTable(document, {
    head: [data.headers],
    body: data.rows,
    startY: 22,
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
    headStyles: { fillColor: [6, 95, 70] },
    margin: { left: 14, right: 14 },
  })
  document.save(`${fileName(data.title)}.pdf`)
}

async function downloadJpg(data: ReportExportData, element: HTMLDivElement | null) {
  if (!element) throw new Error('Il prospetto non è pronto per l’esportazione.')
  const canvas = await html2canvas(element, {
    backgroundColor: '#ffffff',
    scale: 2,
    useCORS: true,
    onclone: (clonedDocument, clonedElement) => inlineReportStyles(element, clonedElement, clonedDocument),
  })
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))
  if (!blob) throw new Error('Non è stato possibile creare l’immagine JPG.')
  downloadBlob(blob.type, blob, `${fileName(data.title)}.jpg`)
}

function inlineReportStyles(sourceElement: HTMLDivElement, clonedElement: HTMLElement, clonedDocument: Document) {
  const context = clonedDocument.createElement('canvas').getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Impossibile inizializzare il rendering del prospetto JPG.')
  const colorCache = new Map<string, string>()
  const normalizeValue = (value: string) => value.replace(/oklch\([^)]*\)/gi, (color) => {
    const cachedColor = colorCache.get(color)
    if (cachedColor) return cachedColor
    context.clearRect(0, 0, 1, 1)
    context.fillStyle = color
    context.fillRect(0, 0, 1, 1)
    const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data
    const normalizedColor = alpha === 255 ? `rgb(${red}, ${green}, ${blue})` : `rgba(${red}, ${green}, ${blue}, ${alpha / 255})`
    colorCache.set(color, normalizedColor)
    return normalizedColor
  })
  const sourceNodes = [sourceElement, ...sourceElement.querySelectorAll<HTMLElement>('*')]
  const clonedNodes = [clonedElement, ...clonedElement.querySelectorAll<HTMLElement>('*')]
  sourceNodes.forEach((source, index) => {
    const sourceStyle = window.getComputedStyle(source)
    const clonedStyle = clonedNodes[index]?.style
    if (!clonedStyle) return
    Array.from(sourceStyle).forEach((property) => {
      if (property.startsWith('--')) return
      const value = sourceStyle.getPropertyValue(property)
      clonedStyle.setProperty(property, value.includes('oklch(') ? normalizeValue(value) : value)
    })
  })
  clonedDocument.querySelectorAll('style, link[rel="stylesheet"]').forEach((stylesheet) => stylesheet.remove())
}

function downloadBlob(type: string, content: BlobPart, name: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function fileName(value: string) {
  return value.toLocaleLowerCase('it').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function escapeHtml(value: string) {
  const replacements: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }
  return value.replace(/[&<>"']/g, (character) => replacements[character])
}
