/**
 * HTML Renderer
 * สร้าง HTML receipt/label จาก PrintPayload + ReceiptSettings
 * รูปแบบเดียวกับระบบ GAS เดิม (สองภาษา Eng/Thai, table layout)
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
   * สร้าง HTML ใบเสร็จฝากเหล้า (Deposit Receipt)
   * รูปแบบเดียวกับ GAS: ภาษาอังกฤษ, table layout, <hr> divider
   */
  renderReceipt(payload) {
    const width = this.paperWidth === 58 ? '48mm' : '70mm';
    const fontSize = this.paperWidth === 58 ? '9pt' : '11pt';
    const codeSize = this.paperWidth === 58 ? '14pt' : '16pt';

    const showQr = this.settings.show_qr && this.settings.qr_code_image_url;
    const lineOaId = this.settings.line_oa_id || '';
    const headerText = this.settings.header_text || '';
    const footerText = this.settings.footer_text || '';

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @page { size: ${this.paperWidth}mm auto; margin: 0; }
    @media print { body { margin: 0; padding: 0; } }
    body {
      font-family: Tahoma, sans-serif;
      font-size: ${fontSize};
      width: ${width};
      margin: 0 auto;
      padding: 3mm;
      color: #000;
    }
    table { width: 100%; font-size: ${fontSize}; }
    td { padding: 1px 2px; vertical-align: top; }
    hr { border: none; border-top: 1px solid #000; margin: 4px 0; }
    center { text-align: center; }
    b { font-weight: bold; }
  </style>
</head>
<body>
  ${headerText ? `<center style="font-size:9pt;">${headerText}</center>` : ''}
  <center><b style="font-size:14pt;">DEPOSIT RECEIPT</b></center>
  <hr>
  <center><b style="font-size:${codeSize};">${payload.deposit_code}</b></center>
  <hr>
  <table>
    <tr><td>Customer:</td><td><b>${payload.customer_name || '-'}</b></td></tr>
    ${payload.customer_phone ? `<tr><td>Phone:</td><td>${payload.customer_phone}</td></tr>` : ''}
    <tr><td>Product:</td><td>${payload.product_name || '-'}</td></tr>
    <tr><td>Qty:</td><td>${payload.remaining_qty || payload.quantity || '-'}</td></tr>
    ${payload.table_number ? `<tr><td>Table:</td><td>${payload.table_number}</td></tr>` : ''}
    ${payload.received_by_name ? `<tr><td>Staff:</td><td>${payload.received_by_name}</td></tr>` : ''}
  </table>
  <hr>
  <table>
    <tr><td>Deposit:</td><td>${this._formatDateShort(payload.created_at)}</td></tr>
    ${payload.expiry_date ? `<tr><td>Expiry:</td><td><b>${this._formatDateShort(payload.expiry_date)}</b></td></tr>` : ''}
  </table>
  <hr>
  ${showQr ? `
  <center><img src="${this.settings.qr_code_image_url}" width="120" height="120"></center>
  ${lineOaId ? `<center>LINE: ${lineOaId}</center>` : ''}
  <hr>
  <center style="font-size:10pt;">Please scan this QRcode</center>
  <center style="font-size:10pt;">Send receipt in Line</center>
  ` : ''}
  ${footerText ? `<center style="font-size:9pt;color:#666;">${footerText}</center>` : ''}
</body>
</html>`;
  }

  /**
   * สร้าง HTML ใบแปะขวด (Bottle Label)
   * รูปแบบเดียวกับ GAS: สองภาษา Eng/Thai, table layout, มีฟิลด์ครบ
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
      font-family: Tahoma, sans-serif;
      font-size: 8pt;
      width: 66mm;
      margin: 0 auto;
      padding: 1mm 2mm;
      color: #000;
    }
    .title {
      text-align: center;
      font-size: 8pt;
      font-weight: bold;
      padding: 1mm 0;
    }
    table { width: 100%; border-collapse: collapse; }
    td {
      border: 0.5px solid #999;
      padding: 1px 3px;
      font-size: 7pt;
      vertical-align: top;
    }
    td.lbl {
      width: 40%;
      color: #333;
      font-size: 6.5pt;
    }
    td.val {
      width: 60%;
      font-weight: 500;
    }
    .code {
      text-align: center;
      font-size: 11pt;
      font-weight: 700;
      font-family: 'Courier New', monospace;
      padding: 1mm 0;
    }
    .copy-info {
      text-align: center;
      font-size: 5pt;
      color: #999;
    }
  </style>
</head>
<body>
  <div class="title">${this.storeName} : Deposit</div>
  <table>
    <tr>
      <td class="lbl">Customer Name<br><span style="font-size:5.5pt;color:#666;">ชื่อลูกค้า</span></td>
      <td class="val">${payload.customer_name || '-'}</td>
    </tr>
    <tr>
      <td class="lbl">Table<br><span style="font-size:5.5pt;color:#666;">โต๊ะ</span></td>
      <td class="val">${payload.table_number || '-'}</td>
    </tr>
    <tr>
      <td class="lbl">Alcohol Type<br><span style="font-size:5.5pt;color:#666;">ประเภทเครื่องดื่ม</span></td>
      <td class="val">${payload.product_name || '-'}</td>
    </tr>
    <tr>
      <td class="lbl">Remaining<br><span style="font-size:5.5pt;color:#666;">คงเหลือ</span></td>
      <td class="val">${payload.remaining_qty || payload.quantity || '-'} ขวด</td>
    </tr>
    <tr>
      <td class="lbl">Bottle<br><span style="font-size:5.5pt;color:#666;">ขวดที่</span></td>
      <td class="val" style="font-weight:bold;">${copyNumber}/${totalCopies}</td>
    </tr>
    <tr>
      <td class="lbl">Staff<br><span style="font-size:5.5pt;color:#666;">พนักงาน</span></td>
      <td class="val">${payload.received_by_name || '-'}</td>
    </tr>
    <tr>
      <td class="lbl">Deposit Date<br><span style="font-size:5.5pt;color:#666;">วันฝาก</span></td>
      <td class="val">${this._formatDateShort(payload.created_at)}</td>
    </tr>
    <tr>
      <td class="lbl">Expiry Date<br><span style="font-size:5.5pt;color:#666;">วันหมดอายุ</span></td>
      <td class="val" style="font-weight:bold;">${payload.expiry_date ? this._formatDateShort(payload.expiry_date) : '-'}</td>
    </tr>
    <tr>
      <td class="lbl">Return HQ<br><span style="font-size:5.5pt;color:#666;">บาร์ส่งคืน</span></td>
      <td class="val">________</td>
    </tr>
  </table>
  <div class="code">${payload.deposit_code}</div>
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
      return this.renderReceipt(payload);
    }

    if (job.job_type === 'label') {
      if (copies <= 1) {
        return this.renderLabel(payload, 1, 1);
      }

      // รวมหลาย labels เป็น multi-page HTML
      const labelPages = [];
      for (let i = 1; i <= copies; i++) {
        labelPages.push(`
  <div class="page">
    <div class="title">${this.storeName} : Deposit</div>
    <table>
      <tr>
        <td class="lbl">Customer Name<br><span style="font-size:5.5pt;color:#666;">ชื่อลูกค้า</span></td>
        <td class="val">${payload.customer_name || '-'}</td>
      </tr>
      <tr>
        <td class="lbl">Table<br><span style="font-size:5.5pt;color:#666;">โต๊ะ</span></td>
        <td class="val">${payload.table_number || '-'}</td>
      </tr>
      <tr>
        <td class="lbl">Alcohol Type<br><span style="font-size:5.5pt;color:#666;">ประเภทเครื่องดื่ม</span></td>
        <td class="val">${payload.product_name || '-'}</td>
      </tr>
      <tr>
        <td class="lbl">Remaining<br><span style="font-size:5.5pt;color:#666;">คงเหลือ</span></td>
        <td class="val">${payload.remaining_qty || payload.quantity || '-'} ขวด</td>
      </tr>
      <tr>
        <td class="lbl">Bottle<br><span style="font-size:5.5pt;color:#666;">ขวดที่</span></td>
        <td class="val" style="font-weight:bold;">${i}/${copies}</td>
      </tr>
      <tr>
        <td class="lbl">Staff<br><span style="font-size:5.5pt;color:#666;">พนักงาน</span></td>
        <td class="val">${payload.received_by_name || '-'}</td>
      </tr>
      <tr>
        <td class="lbl">Deposit Date<br><span style="font-size:5.5pt;color:#666;">วันฝาก</span></td>
        <td class="val">${this._formatDateShort(payload.created_at)}</td>
      </tr>
      <tr>
        <td class="lbl">Expiry Date<br><span style="font-size:5.5pt;color:#666;">วันหมดอายุ</span></td>
        <td class="val" style="font-weight:bold;">${payload.expiry_date ? this._formatDateShort(payload.expiry_date) : '-'}</td>
      </tr>
      <tr>
        <td class="lbl">Return HQ<br><span style="font-size:5.5pt;color:#666;">บาร์ส่งคืน</span></td>
        <td class="val">________</td>
      </tr>
    </table>
    <div class="code">${payload.deposit_code}</div>
  </div>`);
      }

      return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @page { size: 70mm 40mm; margin: 0; }
    body { font-family: Tahoma, sans-serif; font-size: 8pt; margin: 0; padding: 0; color: #000; }
    .page { width: 66mm; margin: 0 auto; padding: 1mm 2mm; page-break-after: always; }
    .page:last-child { page-break-after: auto; }
    .title { text-align: center; font-size: 8pt; font-weight: bold; padding: 1mm 0; }
    table { width: 100%; border-collapse: collapse; }
    td { border: 0.5px solid #999; padding: 1px 3px; font-size: 7pt; vertical-align: top; }
    td.lbl { width: 40%; color: #333; font-size: 6.5pt; }
    td.val { width: 60%; font-weight: 500; }
    .code { text-align: center; font-size: 11pt; font-weight: 700; font-family: 'Courier New', monospace; padding: 1mm 0; }
  </style>
</head>
<body>
${labelPages.join('\n')}
</body>
</html>`;
    }

    // Default fallback
    return this.renderReceipt(payload);
  }

  // --- Helpers ---

  /**
   * Format date as DD/MM/YY (รูปแบบ GAS เดิม)
   */
  _formatDateShort(dateStr) {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yy = String(d.getFullYear()).slice(-2);
      return `${dd}/${mm}/${yy}`;
    } catch {
      return dateStr;
    }
  }
}

module.exports = HtmlRenderer;
