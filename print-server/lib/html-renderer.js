/**
 * HTML Renderer
 * สร้าง HTML receipt/label จาก PrintPayload + ReceiptSettings
 * ใช้แทน React components (ReceiptContent / LabelContent)
 */

class HtmlRenderer {
  constructor(receiptSettings, storeName, paperWidth) {
    this.settings = receiptSettings || {};
    this.storeName = storeName;
    this.paperWidth = paperWidth || this.settings.paper_width || 80;
  }

  updateSettings(settings) {
    this.settings = settings || {};
    this.paperWidth = this.settings.paper_width || this.paperWidth;
  }

  /**
   * สร้าง HTML ใบเสร็จฝากเหล้า
   */
  renderReceipt(payload) {
    const width = this.paperWidth === 58 ? '48mm' : '72mm';
    const fontSize = this.paperWidth === 58 ? '8pt' : '9pt';
    const codeSize = this.paperWidth === 58 ? '14pt' : '18pt';
    const sep = this.paperWidth === 58
      ? '- '.repeat(16)
      : '- '.repeat(24);

    const headerText = this.settings.header_text || '';
    const footerText = this.settings.footer_text || '';
    const showQr = this.settings.show_qr && this.settings.qr_code_image_url;
    const lineOaId = this.settings.line_oa_id || '';

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @page { size: ${this.paperWidth}mm auto; margin: 0; }
    @media print { body { margin: 0; padding: 0; } }
    body {
      font-family: 'Tahoma', 'TH Sarabun New', sans-serif;
      font-size: ${fontSize};
      width: ${width};
      margin: 0 auto;
      padding: 2mm 4mm;
      color: #000;
    }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .code {
      font-size: ${codeSize};
      font-weight: 700;
      letter-spacing: 1px;
      text-align: center;
      padding: 4px 0;
      font-family: 'Courier New', monospace;
    }
    .sep { text-align: center; color: #666; margin: 2px 0; font-size: 7pt; }
    .row { display: flex; justify-content: space-between; padding: 1px 0; }
    .row .label { color: #555; min-width: 65px; }
    .row .value { text-align: right; flex: 1; }
    .qr { text-align: center; margin: 6px 0; }
    .qr img { width: 100px; height: 100px; }
    .footer { text-align: center; font-size: 7pt; color: #888; margin-top: 4px; }
  </style>
</head>
<body>
  <div class="center bold">${this.storeName}</div>
  ${headerText ? `<div class="center" style="font-size:7pt">${headerText}</div>` : ''}
  <div class="sep">${sep}</div>
  <div class="center bold" style="font-size:11pt">ใบรับฝากเหล้า</div>
  <div class="sep">${sep}</div>

  <div class="code">${payload.deposit_code}</div>
  <div class="sep">${sep}</div>

  ${this._row('ลูกค้า', payload.customer_name)}
  ${payload.customer_phone ? this._row('โทร', payload.customer_phone) : ''}
  ${payload.table_number ? this._row('โต๊ะ', payload.table_number) : ''}
  <div class="sep">${sep}</div>

  ${this._row('สินค้า', payload.product_name)}
  ${payload.category ? this._row('ประเภท', payload.category) : ''}
  ${this._row('จำนวน', `${payload.remaining_qty}/${payload.quantity} ขวด`)}
  <div class="sep">${sep}</div>

  ${this._row('วันที่ฝาก', this._formatDate(payload.created_at))}
  ${payload.expiry_date ? this._row('หมดอายุ', this._formatDate(payload.expiry_date)) : ''}
  ${payload.received_by_name ? this._row('รับโดย', payload.received_by_name) : ''}
  <div class="sep">${sep}</div>

  ${showQr ? `
  <div class="qr">
    <img src="${this.settings.qr_code_image_url}" alt="QR" />
    <div style="font-size:7pt">Scan เพื่อเพิ่มเพื่อน LINE</div>
    ${lineOaId ? `<div style="font-size:8pt;font-weight:bold">LINE: ${lineOaId}</div>` : ''}
    <div style="font-size:6pt;color:#888">พิมพ์รหัสฝากในแชทเพื่อเช็คสต๊อก</div>
  </div>
  ` : ''}

  ${footerText ? `<div class="footer">${footerText}</div>` : ''}
  <div class="footer">Powered by StockManager</div>
</body>
</html>`;
  }

  /**
   * สร้าง HTML ใบแปะขวด (label)
   */
  renderLabel(payload, copyNumber = 1, totalCopies = 1) {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @page { size: 70mm 40mm; margin: 0; }
    @media print { body { margin: 0; padding: 0; } }
    body {
      font-family: 'Tahoma', 'TH Sarabun New', sans-serif;
      width: 66mm;
      margin: 0 auto;
      padding: 1mm 2mm;
      color: #000;
    }
    .header { text-align: center; font-size: 7pt; color: #555; }
    .code {
      text-align: center;
      font-size: 16pt;
      font-weight: 700;
      font-family: 'Courier New', monospace;
      padding: 1mm 0;
    }
    .divider { border-top: 0.5px dashed #999; margin: 1mm 0; }
    .row { display: flex; justify-content: space-between; font-size: 8pt; padding: 0.5px 0; }
    .row .label { color: #555; }
    .copy-info { text-align: center; font-size: 6pt; color: #999; margin-top: 1mm; }
  </style>
</head>
<body>
  <div class="header">${this.storeName}</div>
  <div class="code">${payload.deposit_code}</div>
  <div class="divider"></div>
  ${this._labelRow('ลูกค้า', payload.customer_name)}
  ${this._labelRow('สินค้า', payload.product_name)}
  ${payload.expiry_date ? this._labelRow('หมดอายุ', this._formatDate(payload.expiry_date)) : ''}
  ${this._labelRow('วันที่ฝาก', this._formatDate(payload.created_at))}
  ${totalCopies > 1 ? `<div class="copy-info">ขวดที่ ${copyNumber}/${totalCopies}</div>` : ''}
</body>
</html>`;
  }

  /**
   * สร้าง HTML ที่พร้อมพิมพ์ (รวม copies)
   */
  renderForPrint(job) {
    const payload = job.payload;
    const copies = job.copies || 1;

    if (job.job_type === 'receipt') {
      // ใบเสร็จ — 1 ชุด
      return this.renderReceipt(payload);
    }

    if (job.job_type === 'label') {
      // ใบแปะขวด — หลายใบ (ตามจำนวน copies)
      if (copies <= 1) {
        return this.renderLabel(payload, 1, 1);
      }

      // รวมหลาย labels เป็น multi-page HTML
      const pages = [];
      for (let i = 1; i <= copies; i++) {
        pages.push(this.renderLabel(payload, i, copies)
          .replace(/<\/?html>/g, '')
          .replace(/<\/?head>[\s\S]*?<\/head>/g, '')
          .replace(/<body[^>]*>/g, '<div class="page">')
          .replace(/<\/body>/g, '</div>'));
      }

      return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @page { size: 70mm 40mm; margin: 0; }
    .page { page-break-after: always; }
    .page:last-child { page-break-after: auto; }
    body { margin: 0; padding: 0; font-family: 'Tahoma', sans-serif; }
    .header { text-align: center; font-size: 7pt; color: #555; }
    .code { text-align: center; font-size: 16pt; font-weight: 700; font-family: 'Courier New', monospace; padding: 1mm 0; }
    .divider { border-top: 0.5px dashed #999; margin: 1mm 0; }
    .row { display: flex; justify-content: space-between; font-size: 8pt; padding: 0.5px 0; }
    .row .label { color: #555; }
    .copy-info { text-align: center; font-size: 6pt; color: #999; margin-top: 1mm; }
  </style>
</head>
<body>
${pages.map((page, i) => `
  <div class="page" style="width:66mm;margin:0 auto;padding:1mm 2mm;">
    <div class="header">${this.storeName}</div>
    <div class="code">${payload.deposit_code}</div>
    <div class="divider"></div>
    ${this._labelRow('ลูกค้า', payload.customer_name)}
    ${this._labelRow('สินค้า', payload.product_name)}
    ${payload.expiry_date ? this._labelRow('หมดอายุ', this._formatDate(payload.expiry_date)) : ''}
    ${this._labelRow('วันที่ฝาก', this._formatDate(payload.created_at))}
    <div class="copy-info">ขวดที่ ${i + 1}/${copies}</div>
  </div>
`).join('\n')}
</body>
</html>`;
    }

    // Default fallback
    return this.renderReceipt(payload);
  }

  // --- Helpers ---

  _row(label, value) {
    return `<div class="row"><span class="label">${label}:</span><span class="value">${value || '-'}</span></div>`;
  }

  _labelRow(label, value) {
    return `<div class="row"><span class="label">${label}:</span><span>${value || '-'}</span></div>`;
  }

  _formatDate(dateStr) {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
      const day = d.getDate();
      const month = months[d.getMonth()];
      const year = d.getFullYear() + 543; // พ.ศ.
      return `${day} ${month} ${year}`;
    } catch {
      return dateStr;
    }
  }
}

module.exports = HtmlRenderer;
