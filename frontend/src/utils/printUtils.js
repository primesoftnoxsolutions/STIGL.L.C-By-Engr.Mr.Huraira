export const A4_MARGIN_MM = 10;

export const getA4PrintStyles = (extraStyles = '') => `
  * { box-sizing: border-box; }
  html, body { width: 210mm; height: 297mm; }
  body {
    margin: 0;
    padding: 0;
    font-family: Arial, sans-serif;
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }
  @page { size: A4; margin: ${A4_MARGIN_MM}mm; }
  .print-page { width: 100%; }
  .invoice-print-content .invoice-items-table {
    border: 0.7px solid #dbe3ec !important;
    border-collapse: collapse !important;
    table-layout: fixed !important;
    width: 100% !important;
  }
  .invoice-print-content .invoice-items-table th,
  .invoice-print-content .invoice-items-table td {
    border: 0.7px solid #dbe3ec !important;
    padding: 7px 8px !important;
    font-size: 11.5px !important;
    line-height: 1.25 !important;
    vertical-align: middle !important;
  }
  .invoice-print-content .invoice-items-table th:nth-child(1),
  .invoice-print-content .invoice-items-table td:nth-child(1) {
    width: 6% !important;
    text-align: center !important;
  }
  .invoice-print-content .invoice-items-table th:nth-child(2),
  .invoice-print-content .invoice-items-table td:nth-child(2) {
    width: 36% !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
  }
  .invoice-print-content .invoice-items-table th:nth-child(3),
  .invoice-print-content .invoice-items-table td:nth-child(3) {
    width: 14% !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
  }
  .invoice-print-content .invoice-items-table th:nth-child(4),
  .invoice-print-content .invoice-items-table td:nth-child(4) {
    width: 9% !important;
    text-align: center !important;
  }
  .invoice-print-content .invoice-items-table th:nth-child(5),
  .invoice-print-content .invoice-items-table td:nth-child(5),
  .invoice-print-content .invoice-items-table th:nth-child(6),
  .invoice-print-content .invoice-items-table td:nth-child(6),
  .invoice-print-content .invoice-items-table th:nth-child(7),
  .invoice-print-content .invoice-items-table td:nth-child(7) {
    width: 11.67% !important;
    text-align: right !important;
    white-space: nowrap !important;
  }
  ${extraStyles}
`;

export const buildPrintHtml = ({ title = 'Print', body = '', extraStyles = '' }) => `<!DOCTYPE html>
<html>
  <head>
    <title>${title}</title>
    <style>
      ${getA4PrintStyles(extraStyles)}
    </style>
  </head>
  <body>
    <div class="print-page">
      ${body}
    </div>
  </body>
</html>`;
