import JSZip from 'jszip';

// A real .xlsx with no extra dependency: the format is a zip of XML files. Every cell is written as inline text, so a value such as
// "=HYPERLINK(...)" stays text and can never run as a formula in Excel.
const escapeXml = (text: string) =>
  text
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const columnName = (index: number) => {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
};

const cell = (value: string, column: number, row: number, style: number) =>
  `<c r="${columnName(column)}${row}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;

const header = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

const contentTypes = `${header}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
const rootRels = `${header}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
const workbookRels = `${header}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
// Style 0 is plain text; style 1 is the header row: bold white on navy.
const styles = `${header}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0A1E37"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf/><xf fontId="1" fillId="2" applyFont="1" applyFill="1"/></cellXfs></styleSheet>`;

export interface SpreadsheetColumn {
  title: string;
  width: number;
}

export function renderXlsx(sheetName: string, columns: SpreadsheetColumn[], rows: string[][]): Promise<Buffer> {
  const widths = columns
    .map(({ width }, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`)
    .join('');
  const headRow = `<row r="1">${columns.map(({ title }, index) => cell(title, index, 1, 1)).join('')}</row>`;
  const bodyRows = rows.map((row, y) => `<row r="${y + 2}">${row.map((value, x) => cell(value, x, y + 2, 0)).join('')}</row>`).join('');
  const lastCell = `${columnName(columns.length - 1)}${rows.length + 1}`;
  const sheet = `${header}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths}</cols><sheetData>${headRow}${bodyRows}</sheetData><autoFilter ref="A1:${lastCell}"/></worksheet>`;
  const workbook = `${header}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;

  const zip = new JSZip();
  zip.file('[Content_Types].xml', contentTypes);
  zip.file('_rels/.rels', rootRels);
  zip.file('xl/workbook.xml', workbook);
  zip.file('xl/_rels/workbook.xml.rels', workbookRels);
  zip.file('xl/styles.xml', styles);
  zip.file('xl/worksheets/sheet1.xml', sheet);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
