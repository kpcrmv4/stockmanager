/**
 * Deposit Print Server v2.0 — Supabase Edition
 *
 * Silent printing สำหรับ Thermal Printer 80mm/58mm
 * ใช้ Supabase Realtime + Puppeteer + SumatraPDF
 *
 * Setup:
 *   1. ดาวน์โหลด config.json จากหน้า Settings ในแอป
 *   2. รัน SETUP.bat (ติดตั้ง Node.js, npm, SumatraPDF)
 *   3. รัน START-PrintServer.bat
 */

const fs = require('fs');
const path = require('path');
const SupabaseConnector = require('./lib/supabase-connector');
const HtmlRenderer = require('./lib/html-renderer');
const JobProcessor = require('./lib/job-processor');
const WorkingHoursGuard = require('./lib/working-hours');

// ==========================================
// LOAD CONFIG
// ==========================================

const configPath = path.join(__dirname, 'config.json');
if (!fs.existsSync(configPath)) {
  console.error('');
  console.error('  [ERROR] config.json not found!');
  console.error('  ดาวน์โหลดจากหน้า Settings > Print Server ในแอป');
  console.error('  แล้ววางไฟล์ config.json ไว้ในโฟลเดอร์นี้');
  console.error('');
  process.exit(1);
}

const CONFIG = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Validate required fields
const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'STORE_ID', 'PRINT_ACCOUNT_EMAIL', 'PRINT_ACCOUNT_PASSWORD'];
for (const key of required) {
  if (!CONFIG[key]) {
    console.error(`  [ERROR] Missing ${key} in config.json`);
    process.exit(1);
  }
}

// ==========================================
// INITIALIZE
// ==========================================

const workingHours = new WorkingHoursGuard(CONFIG.WORKING_HOURS || { enabled: false });
const connector = new SupabaseConnector(CONFIG);
const renderer = new HtmlRenderer(null, CONFIG.STORE_NAME || 'Store', CONFIG.PAPER_WIDTH);
const processor = new JobProcessor(CONFIG);

// Queue management
let isProcessing = false;
const jobQueue = [];

console.log('');
console.log('==========================================');
console.log('  DEPOSIT PRINT SERVER v2.0');
console.log('  Supabase Realtime Edition');
console.log('==========================================');
console.log(`  Store:    ${CONFIG.STORE_NAME || CONFIG.STORE_ID}`);
console.log(`  Printer:  ${CONFIG.PRINTER_NAME}`);
console.log(`  Paper:    ${CONFIG.PAPER_WIDTH || 80}mm`);
console.log(`  Hours:    ${workingHours.getStatusText()}`);
console.log('==========================================');
console.log('');

// ==========================================
// MAIN
// ==========================================

async function main() {
  try {
    // 1. Connect to Supabase
    console.log('[1/4] Connecting to Supabase...');
    await connector.connect();

    // 2. Load receipt settings
    console.log('[2/4] Loading receipt settings...');
    const settings = await connector.fetchReceiptSettings();
    if (settings) {
      renderer.updateSettings(settings);
      console.log('  [OK] Receipt settings loaded');
    } else {
      console.log('  [!] Using default settings');
    }

    // 3. Initialize Puppeteer
    console.log('[3/4] Initializing Puppeteer...');
    await processor.init();

    // 4. Subscribe to print queue
    console.log('[4/4] Subscribing to print queue...');
    connector.subscribeToJobs(onNewJob);

    // 5. Check for existing pending jobs (catch-up)
    await catchUpPendingJobs();

    // 6. Start heartbeat
    startHeartbeat();

    // 7. Start working hours check
    startWorkingHoursMonitor();

    console.log('');
    console.log('==========================================');
    console.log('  Print Server is running!');
    console.log('  Press Ctrl+C to stop');
    console.log('==========================================');
    console.log('');

  } catch (error) {
    console.error('[FATAL]', error.message);
    process.exit(1);
  }
}

// ==========================================
// JOB HANDLING
// ==========================================

function onNewJob(job) {
  if (job.status !== 'pending') return;

  if (!workingHours.isWithinWorkingHours()) {
    console.log(`  [SKIP] Outside working hours — job ${job.id.slice(0, 8)} queued`);
    return;
  }

  jobQueue.push(job);
  processQueue();
}

async function processQueue() {
  if (isProcessing || jobQueue.length === 0) return;
  isProcessing = true;

  while (jobQueue.length > 0) {
    const job = jobQueue.shift();
    await processJob(job);
  }

  isProcessing = false;
}

async function processJob(job) {
  const time = new Date().toLocaleTimeString('th-TH');
  const type = job.job_type === 'receipt' ? 'ใบฝาก' : 'แปะขวด';
  const code = job.payload?.deposit_code || 'N/A';

  console.log(`[${time}] Processing: ${type} ${code} (${job.id.slice(0, 8)}...)`);

  try {
    // Mark as printing
    await connector.updateJobStatus(job.id, 'printing');

    // Render HTML
    const html = renderer.renderForPrint(job);

    // Print
    await processor.processJob(html, job.id, job.job_type);

    // Mark completed
    await connector.updateJobStatus(job.id, 'completed');
    console.log(`[${time}] [OK] Completed: ${type} ${code}`);

  } catch (error) {
    console.error(`[${time}] [FAIL] ${type} ${code}:`, error.message);
    await connector.updateJobStatus(job.id, 'failed', { error_message: error.message });
  }
}

async function catchUpPendingJobs() {
  try {
    const pending = await connector.fetchPendingJobs();
    if (pending.length > 0) {
      console.log(`  [*] Found ${pending.length} pending job(s) — processing...`);
      for (const job of pending) {
        jobQueue.push(job);
      }
      processQueue();
    } else {
      console.log('  [OK] No pending jobs');
    }
  } catch (error) {
    console.warn('  [!] Catch-up error:', error.message);
  }
}

// ==========================================
// HEARTBEAT
// ==========================================

function startHeartbeat() {
  const interval = CONFIG.HEARTBEAT_INTERVAL || 60000;

  const send = async () => {
    if (!workingHours.isWithinWorkingHours()) return;
    await connector.sendHeartbeat({
      status: 'ready',
      jobsToday: processor.getJobsToday(),
    });
  };

  // Send immediately
  send();

  // Then every interval
  setInterval(send, interval);
}

// ==========================================
// WORKING HOURS MONITOR
// ==========================================

let lastWorkingState = null;

function startWorkingHoursMonitor() {
  setInterval(() => {
    const isWorking = workingHours.isWithinWorkingHours();

    if (lastWorkingState !== isWorking) {
      const time = new Date().toLocaleTimeString('th-TH');
      if (isWorking) {
        console.log(`[${time}] *** ACTIVE — Within working hours ***`);
        // Process any queued jobs
        catchUpPendingJobs();
      } else {
        console.log(`[${time}] *** IDLE — Outside working hours ***`);
      }
      lastWorkingState = isWorking;
    }
  }, 30000); // Check every 30 seconds
}

// ==========================================
// GRACEFUL SHUTDOWN
// ==========================================

async function shutdown(signal) {
  console.log(`\n[*] ${signal} received — shutting down...`);
  await connector.disconnect();
  await processor.shutdown();
  console.log('[OK] Goodbye!');
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err.message);
  // Don't exit — try to keep running
});
process.on('unhandledRejection', (err) => {
  console.error('[WARN] Unhandled rejection:', err);
});

// ==========================================
// START
// ==========================================

main();
