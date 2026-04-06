/**
 * HTML Renderer
 * สร้าง HTML receipt/label จาก PrintPayload + ReceiptSettings
 * รูปแบบเหมือนระบบ GAS เดิมทุกประการ
 *
 * Receipt: Puppeteer PDF width=80mm, height=auto
 * Label:   Puppeteer PDF width=80mm, height=auto (portrait, cut short)
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
   * ใบรับฝากเหล้า (Deposit Receipt)
   * เหมือน GAS: inline style, width:70mm, Tahoma 11pt
   */
  renderReceipt(payload) {
    const showQr = this.settings.show_qr && this.settings.qr_code_image_url;
    const lineOaId = this.settings.line_oa_id || '';

    // GAS exact format: inline styles, no <head> CSS
    return `<html><head><meta charset="UTF-8"></head>` +
      `<body style="font-family:Tahoma,sans-serif;font-size:11pt;width:70mm;margin:0 auto;padding:3mm;">` +
      `<center style="font-size:10pt;">${this.storeName}</center>` +
      `<center><b style="font-size:14pt;">DEPOSIT RECEIPT</b></center>` +
      `<hr>` +
      `<center><b style="font-size:16pt;">${payload.deposit_code}</b></center>` +
      `<hr>` +
      `<table style="width:100%;font-size:11pt;">` +
      `<tr><td>Customer:</td><td><b>${payload.customer_name || '-'}</b></td></tr>` +
      (payload.customer_phone ? `<tr><td>Phone:</td><td>${payload.customer_phone}</td></tr>` : '') +
      `<tr><td>Product:</td><td>${payload.product_name || '-'}</td></tr>` +
      `<tr><td>Qty:</td><td>${payload.remaining_qty || payload.quantity || '-'}</td></tr>` +
      (payload.table_number ? `<tr><td>Note:</td><td>${payload.table_number}</td></tr>` : '') +
      `</table>` +
      `<hr>` +
      `<table style="width:100%;font-size:11pt;">` +
      `<tr><td>Deposit:</td><td>${this._formatDateShort(payload.created_at)}</td></tr>` +
      (payload.expiry_date ? `<tr><td>Expiry:</td><td><b>${this._formatDateShort(payload.expiry_date)}</b></td></tr>` : '') +
      `</table>` +
      `<hr>` +
      (showQr
        ? `<center><img src="${this.settings.qr_code_image_url}" width="120" height="120"></center>` +
          (lineOaId ? `<center>LINE: ${lineOaId}</center>` : '') +
          `<hr>` +
          `<center style="font-size:10pt;">Please scan this QRcode</center>` +
          `<center style="font-size:10pt;">Send receipt in Line</center>` +
          `<center style="font-size:10pt;">Type <b>${payload.deposit_code}</b> in chat</center>`
        : '') +
      `</body></html>`;
  }

  /**
   * ใบแปะขวด (Bottle Label) — single
   * เหมือน GAS: table with border, สองภาษา, deposit code ด้านล่าง
   * ใช้ width:70mm เหมือน receipt (portrait, ไม่หมุน)
   */
  renderLabel(payload, copyNumber = 1, totalCopies = 1) {
    return `<html><head><meta charset="UTF-8"></head>` +
      `<body style="font-family:Tahoma,sans-serif;font-size:8pt;width:70mm;margin:0 auto;padding:2mm;">` +
      `<div style="text-align:center;font-size:9pt;font-weight:bold;padding:1mm 0;">${this.storeName} : Deposit</div>` +
      `<table style="width:100%;border-collapse:collapse;">` +
      this._labelRow('Customer Name', payload.customer_name || '-') +
      this._labelRow('Table', payload.table_number || '-') +
      this._labelRow('Alcohol Type', payload.product_name || '-') +
      this._labelRow('Remaining', (payload.remaining_qty || payload.quantity || '-') + ' bottles') +
      this._labelRow('Bottle', `<b>${copyNumber}/${totalCopies}</b>`) +
      this._labelRow('Staff', payload.received_by_name || '-') +
      this._labelRow('Deposit Date', this._formatDateShort(payload.created_at)) +
      this._labelRow('Expiry Date', `<b>${payload.expiry_date ? this._formatDateShort(payload.expiry_date) : '-'}</b>`) +
      this._labelRow('Return HQ', '________') +
      `</table>` +
      `<div style="text-align:center;font-size:12pt;font-weight:bold;font-family:'Courier New',monospace;padding:2mm 0;">${payload.deposit_code}</div>` +
      `</body></html>`;
  }

  /**
   * สร้าง HTML พร้อมพิมพ์ (รวม copies)
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

      // Multi-page: each label is a page, same width as receipt
      let html = `<html><head><meta charset="UTF-8">` +
        `<style>@page{size:${this.paperWidth}mm auto;margin:0;} .page{page-break-after:always;} .page:last-child{page-break-after:auto;}</style>` +
        `</head><body style="font-family:Tahoma,sans-serif;font-size:8pt;margin:0;padding:0;">`;

      for (let i = 1; i <= copies; i++) {
        html += `<div class="page" style="width:70mm;margin:0 auto;padding:2mm;">` +
          `<div style="text-align:center;font-size:9pt;font-weight:bold;padding:1mm 0;">${this.storeName} : Deposit</div>` +
          `<table style="width:100%;border-collapse:collapse;">` +
          this._labelRow('Customer Name', payload.customer_name || '-') +
          this._labelRow('Table', payload.table_number || '-') +
          this._labelRow('Alcohol Type', payload.product_name || '-') +
          this._labelRow('Remaining', (payload.remaining_qty || payload.quantity || '-') + ' bottles') +
          this._labelRow('Bottle', `<b>${i}/${copies}</b>`) +
          this._labelRow('Staff', payload.received_by_name || '-') +
          this._labelRow('Deposit Date', this._formatDateShort(payload.created_at)) +
          this._labelRow('Expiry Date', `<b>${payload.expiry_date ? this._formatDateShort(payload.expiry_date) : '-'}</b>`) +
          this._labelRow('Return HQ', '________') +
          `</table>` +
          `<div style="text-align:center;font-size:12pt;font-weight:bold;font-family:'Courier New',monospace;padding:2mm 0;">${payload.deposit_code}</div>` +
          `</div>`;
      }

      html += `</body></html>`;
      return html;
    }

    if (job.job_type === 'transfer') {
      return this.renderTransfer(payload);
    }

    return this.renderReceipt(payload);
  }

  /**
   * ใบนำส่งเหล้าคลังกลาง (Transfer Receipt)
   */
  renderTransfer(payload) {
    const items = payload.items || [];
    const totalQty = items.reduce((sum, item) => sum + (item.quantity || 0), 0);
    const dashed = '--------------------------------';

    let itemsHtml = '';
    items.forEach((item, idx) => {
      itemsHtml += `<div style="margin-bottom:3px;padding-bottom:3px;${idx < items.length - 1 ? 'border-bottom:1px dotted #ccc;' : ''}">` +
        `<div style="font-weight:bold;">${idx + 1}. ${item.product_name || '-'}</div>` +
        `<div style="display:flex;justify-content:space-between;font-size:10pt;">` +
        `<span>${item.customer_name || '-'}</span>` +
        `<span>${item.deposit_code || ''}</span>` +
        `</div>` +
        `<div style="display:flex;justify-content:space-between;font-size:10pt;">` +
        `<span>จำนวน: ${item.quantity || '-'}</span>` +
        (item.category ? `<span>(${item.category})</span>` : '') +
        `</div>` +
        `</div>`;
    });

    return `<html><head><meta charset="UTF-8"></head>` +
      `<body style="font-family:Tahoma,sans-serif;font-size:11pt;width:70mm;margin:0 auto;padding:3mm;">` +
      `<center style="font-size:10pt;">${this.storeName}</center>` +
      `<center><b style="font-size:12pt;">ใบนำส่งเหล้าคลังกลาง</b></center>` +
      `<center><b style="font-size:16pt;">${payload.transfer_code || '-'}</b></center>` +
      `<hr>` +
      `<table style="width:100%;font-size:11pt;">` +
      `<tr><td>วันที่:</td><td>${this._formatDateShort(payload.created_at)}</td></tr>` +
      `<tr><td>สาขา:</td><td><b>${this.storeName}</b></td></tr>` +
      `<tr><td>จำนวนรวม:</td><td><b>${totalQty} รายการ (${items.length} ขวด)</b></td></tr>` +
      `</table>` +
      `<hr>` +
      itemsHtml +
      `<hr>` +
      (payload.notes ? `<div style="font-size:10pt;">หมายเหตุ: ${payload.notes}</div><hr>` : '') +
      `<table style="width:100%;font-size:11pt;margin-top:8px;">` +
      `<tr><td>ผู้นำส่ง:</td><td><b>${payload.submitted_by_name || '-'}</b></td></tr>` +
      `<tr><td>ลงชื่อ:</td><td style="border-bottom:1px solid #000;width:50%;">&nbsp;</td></tr>` +
      `<tr><td colspan="2">&nbsp;</td></tr>` +
      `<tr><td>ผู้รับ (HQ):</td><td>_______________</td></tr>` +
      `<tr><td>ลงชื่อ:</td><td style="border-bottom:1px solid #000;width:50%;">&nbsp;</td></tr>` +
      `</table>` +
      `<hr>` +
      `<center style="font-size:9pt;">เอกสารนี้ใช้เป็นหลักฐานการนำส่งเหล้า</center>` +
      `</body></html>`;
  }

  // --- Helpers ---

  _labelRow(label, value) {
    return `<tr>` +
      `<td style="border:1px solid #999;padding:2px 4px;font-size:7pt;width:35%;vertical-align:top;">${label}</td>` +
      `<td style="border:1px solid #999;padding:2px 4px;font-size:8pt;width:65%;">${value}</td>` +
      `</tr>`;
  }

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
