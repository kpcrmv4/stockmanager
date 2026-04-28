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
   * Always one page. When payload.bottles[] carries more than one
   * bottle we list each bottle's remaining_percent in a small table
   * below the qty row so the customer can see at a glance which
   * bottle is full vs partly drunk. Single-bottle / legacy payloads
   * just show one Remaining row.
   */
  renderReceipt(payload) {
    const bottles = Array.isArray(payload.bottles) && payload.bottles.length > 0
      ? payload.bottles
      : null;
    const totalBottles = payload.quantity || (bottles ? bottles.length : 1);

    return `<html><head><meta charset="UTF-8"></head>` +
      `<body style="font-family:Tahoma,sans-serif;font-size:11pt;width:70mm;margin:0 auto;padding:3mm;">` +
      this._receiptBody(payload, { bottles, totalBottles }) +
      `</body></html>`;
  }

  _receiptBody(payload, { bottles, totalBottles }) {
    const showQr = this.settings.show_qr && this.settings.qr_code_image_url;
    const lineOaId = this.settings.line_oa_id || '';

    // Three render shapes for the bottle/% block:
    //   - 0 bottles[] entries: skip the rows
    //   - 1 bottle: single "Remaining" row
    //   - N bottles: per-bottle list under the qty row
    let bottleBlock = '';
    if (bottles && bottles.length === 1) {
      const b = bottles[0];
      if (b.remaining_percent !== null && b.remaining_percent !== undefined) {
        bottleBlock = `<tr><td>Remaining:</td><td><b>${b.remaining_percent}%</b></td></tr>`;
      }
    } else if (bottles && bottles.length > 1) {
      const rows = bottles
        .slice()
        .sort((a, b) => (a.bottle_no || 0) - (b.bottle_no || 0))
        .map((b) => `<tr><td style="padding-left:8px;">- Bottle ${b.bottle_no}/${totalBottles}:</td><td><b>${b.remaining_percent}%</b></td></tr>`)
        .join('');
      bottleBlock = `<tr><td colspan="2" style="padding-top:2px;">Per Bottle:</td></tr>${rows}`;
    }

    return `<center style="font-size:10pt;">${this.storeName}</center>` +
      `<center><b style="font-size:14pt;">DEPOSIT RECEIPT</b></center>` +
      `<hr>` +
      `<center><b style="font-size:16pt;">${payload.deposit_code}</b></center>` +
      `<hr>` +
      `<table style="width:100%;font-size:11pt;">` +
      `<tr><td>Customer:</td><td><b>${payload.customer_name || '-'}</b></td></tr>` +
      (payload.customer_phone ? `<tr><td>Phone:</td><td>${payload.customer_phone}</td></tr>` : '') +
      `<tr><td>Product:</td><td>${payload.product_name || '-'}</td></tr>` +
      `<tr><td>Qty:</td><td>${payload.remaining_qty || payload.quantity || '-'}</td></tr>` +
      bottleBlock +
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
        : '');
  }

  /**
   * ใบแปะขวด (Bottle Label) — single
   * เหมือน GAS: table with border, สองภาษา, deposit code ด้านล่าง
   * ใช้ width:70mm เหมือน receipt (portrait, ไม่หมุน)
   */
  renderLabel(payload, copyNumber = 1, totalCopies = 1) {
    const bottlePct = payload._bottle?.remaining_percent ?? payload.remaining_percent ?? null;
    return `<html><head><meta charset="UTF-8"></head>` +
      `<body style="font-family:Tahoma,sans-serif;font-size:8pt;width:70mm;margin:0 auto;padding:2mm;">` +
      `<div style="text-align:center;font-size:9pt;font-weight:bold;padding:1mm 0;">${this.storeName} : Deposit</div>` +
      `<table style="width:100%;border-collapse:collapse;">` +
      this._labelRow('Customer Name', payload.customer_name || '-') +
      this._labelRow('Table', payload.table_number || '-') +
      this._labelRow('Alcohol Type', payload.product_name || '-') +
      this._labelRow('Remaining', (payload.remaining_qty || payload.quantity || '-') + ' bottles') +
      this._labelRow('Bottle', `<b>${copyNumber}/${totalCopies}</b>`) +
      (bottlePct !== null ? this._labelRow('Bottle Remaining', `<b>${bottlePct}%</b>`) : '') +
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
      // Per-bottle data — drives bottle_no + remaining_percent on each copy.
      // Falls back to a synthesized 1..copies array for legacy payloads
      // that don't include bottles[].
      const bottles = Array.isArray(payload.bottles) && payload.bottles.length > 0
        ? payload.bottles
        : Array.from({ length: copies }, (_, i) => ({
            bottle_no: i + 1,
            remaining_percent: payload.remaining_percent ?? 100,
          }));
      const totalBottles = payload.quantity || bottles.length;

      if (bottles.length <= 1) {
        const b = bottles[0] || { bottle_no: 1, remaining_percent: 100 };
        return this.renderLabel(
          { ...payload, _bottle: b, _total_bottles: totalBottles },
          b.bottle_no,
          totalBottles,
        );
      }

      // Multi-page: each label is a page, same width as receipt
      let html = `<html><head><meta charset="UTF-8">` +
        `<style>@page{size:${this.paperWidth}mm auto;margin:0;} .page{page-break-after:always;} .page:last-child{page-break-after:auto;}</style>` +
        `</head><body style="font-family:Tahoma,sans-serif;font-size:8pt;margin:0;padding:0;">`;

      for (const b of bottles) {
        html += `<div class="page" style="width:70mm;margin:0 auto;padding:2mm;">` +
          `<div style="text-align:center;font-size:9pt;font-weight:bold;padding:1mm 0;">${this.storeName} : Deposit</div>` +
          `<table style="width:100%;border-collapse:collapse;">` +
          this._labelRow('Customer Name', payload.customer_name || '-') +
          this._labelRow('Table', payload.table_number || '-') +
          this._labelRow('Alcohol Type', payload.product_name || '-') +
          this._labelRow('Remaining', (payload.remaining_qty || payload.quantity || '-') + ' bottles') +
          this._labelRow('Bottle', `<b>${b.bottle_no}/${totalBottles}</b>`) +
          this._labelRow('Bottle Remaining', `<b>${b.remaining_percent}%</b>`) +
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
      const pct = (item.remaining_percent !== null && item.remaining_percent !== undefined)
        ? `<span style="font-weight:bold;color:#000;">คงเหลือ: ${item.remaining_percent}%</span>`
        : '';
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
        (pct ? `<div style="font-size:10pt;text-align:right;">${pct}</div>` : '') +
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
