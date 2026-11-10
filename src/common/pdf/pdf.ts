import PdfPrinter from 'pdfmake';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';

// PDF on the server with pdfmake and the standard PDF fonts (Helvetica): no font files or native dependencies.
const printer = new PdfPrinter({
  Helvetica: { normal: 'Helvetica', bold: 'Helvetica-Bold', italics: 'Helvetica-Oblique', bolditalics: 'Helvetica-BoldOblique' },
});

export const pdfStyles = {
  title: { fontSize: 16, bold: true, margin: [0, 0, 0, 2] },
  subtitle: { fontSize: 10, color: '#555555', margin: [0, 0, 0, 10] },
  section: { fontSize: 12, bold: true, margin: [0, 14, 0, 6] },
  muted: { fontSize: 9, color: '#666666' },
} satisfies TDocumentDefinitions['styles'];

export function renderPdf(definition: TDocumentDefinitions): Promise<Buffer> {
  const doc = printer.createPdfKitDocument({
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 50],
    styles: pdfStyles,
    ...definition,
    defaultStyle: { font: 'Helvetica', fontSize: 10, ...definition.defaultStyle },
    footer: (page, pages) => ({ text: `${page} / ${pages}`, alignment: 'right', fontSize: 8, color: '#888888', margin: [40, 20] }),
  });
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

// Horizontal bar chart: one row per data point (label | vector bar | value). No native canvas or images.
export function barChart(
  rows: { label: string; value: number | null; text?: string }[],
  options: { max?: number; color: string },
): Content {
  const width = 300;
  const max = options.max ?? Math.max(1, ...rows.map((r) => r.value ?? 0));
  return {
    table: {
      widths: [90, width, '*'],
      body: rows.map(({ label, value, text }) => [
        { text: label, fontSize: 9 },
        {
          canvas: [
            { type: 'rect', x: 0, y: 1, w: width, h: 10, color: '#EEEEEE' },
            ...(value
              ? [{ type: 'rect' as const, x: 0, y: 1, w: Math.max(1, (Math.min(value, max) / max) * width), h: 10, color: options.color }]
              : []),
          ],
        },
        { text: text ?? (value === null ? '—' : String(value)), fontSize: 9 },
      ]),
    },
    layout: 'noBorders',
  };
}

// Simple table with a gray header.
export function dataTable(header: string[], rows: string[][], widths?: (string | number)[]): Content {
  return {
    table: {
      headerRows: 1,
      widths: widths ?? header.map(() => '*'),
      body: [header.map((h) => ({ text: h, bold: true, fillColor: '#EEEEEE' })), ...rows],
    },
    layout: 'lightHorizontalLines',
    fontSize: 9,
  };
}

export const isoDay = (date: Date) => date.toISOString().slice(0, 10);
