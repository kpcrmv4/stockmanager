/**
 * Job Processor
 * Puppeteer → PDF → SumatraPDF / Windows Print
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

class JobProcessor {
  constructor(config) {
    this.printerName = config.PRINTER_NAME;
    this.paperWidth = config.PAPER_WIDTH || 80;
    this.tempDir = path.join(__dirname, '..', 'temp');
    this.browser = null;
    this.jobsToday = 0;
    this.lastResetDate = new Date().toDateString();

    // สร้าง temp folder
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Pre-launch Puppeteer browser (reuse across jobs)
   */
  async init() {
    const puppeteer = require('puppeteer');
    this.browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    });
    console.log('  [OK] Puppeteer browser launched');
  }

  /**
   * พิมพ์ job: HTML → PDF → Printer
   */
  async processJob(html, jobId, jobType) {
    // Reset daily counter
    const today = new Date().toDateString();
    if (today !== this.lastResetDate) {
      this.jobsToday = 0;
      this.lastResetDate = today;
    }

    const docType = jobType === 'receipt' ? 'ใบฝากเหล้า' : 'ใบแปะขวด';
    console.log(`  [*] ${docType} (${jobId.slice(0, 8)}...)`);

    const htmlFile = path.join(this.tempDir, `print_${jobId}.html`);
    const pdfFile = path.join(this.tempDir, `print_${jobId}.pdf`);

    try {
      // 1. Save HTML
      fs.writeFileSync(htmlFile, html, 'utf8');

      // 2. Render PDF via Puppeteer
      if (!this.browser || !this.browser.connected) {
        await this.init();
      }

      const page = await this.browser.newPage();
      const absolutePath = path.resolve(htmlFile).replace(/\\/g, '/');
      await page.goto(`file:///${absolutePath}`, { waitUntil: 'networkidle0', timeout: 15000 });

      // Label + Receipt both use same paper width (80mm thermal)
      // Height: auto for receipt (long), shorter for label
      const pdfOptions = {
        path: pdfFile,
        width: `${this.paperWidth}mm`,
        height: jobType === 'label' ? '120mm' : '297mm',
        printBackground: true,
        margin: { top: '0', bottom: '0', left: '0', right: '0' },
      };

      await page.pdf(pdfOptions);
      await page.close();
      console.log('  [2] PDF created');

      // 3. Print via SumatraPDF or Windows
      await this._sendToPrinter(pdfFile);
      this.jobsToday++;

      console.log(`  [OK] Printed! (total today: ${this.jobsToday})`);
    } finally {
      // Cleanup temp files
      setTimeout(() => {
        try { fs.unlinkSync(htmlFile); } catch {}
        try { fs.unlinkSync(pdfFile); } catch {}
      }, 5000);
    }
  }

  /**
   * ส่ง PDF ไปเครื่องพิมพ์
   */
  async _sendToPrinter(pdfPath) {
    const sumatra = this._findSumatraPDF();

    if (sumatra) {
      console.log('  [3] Printing via SumatraPDF');
      await this._execCommand(`"${sumatra}" -print-to "${this.printerName}" -silent "${pdfPath}"`);
    } else {
      console.log('  [3] Printing via Windows handler');
      const psCmd = `Start-Process -FilePath "${pdfPath}" -Verb Print -PassThru | ForEach-Object { Start-Sleep -Seconds 5; Stop-Process -Id $_.Id -ErrorAction SilentlyContinue }`;
      await this._execCommand(`powershell -Command "${psCmd}"`);
    }
  }

  /**
   * หา SumatraPDF
   */
  _findSumatraPDF() {
    const paths = [
      'C:\\Program Files\\SumatraPDF\\SumatraPDF.exe',
      'C:\\Program Files (x86)\\SumatraPDF\\SumatraPDF.exe',
      (process.env.LOCALAPPDATA || '') + '\\SumatraPDF\\SumatraPDF.exe',
    ];
    return paths.find((p) => p && fs.existsSync(p)) || null;
  }

  /**
   * Execute command with timeout
   */
  _execCommand(cmd, timeout = 30000) {
    return new Promise((resolve, reject) => {
      exec(cmd, { timeout }, (err, stdout, stderr) => {
        if (err) reject(err);
        else resolve(stdout);
      });
    });
  }

  /**
   * Cleanup browser
   */
  async shutdown() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  getJobsToday() {
    return this.jobsToday;
  }
}

module.exports = JobProcessor;
