/**
 * Data Migration Script: Google Sheets → Supabase
 *
 * Usage:
 *   npx tsx scripts/migrate-data.ts
 *
 * Prerequisites:
 *   1. Set environment variables in .env.local
 *   2. Run Supabase migrations first (supabase/migrations/00001_initial_schema.sql)
 *   3. Place Google Sheets service account key at scripts/google-credentials.json
 *
 * Migration Order (following dependency order):
 *   1. app_settings (from Master_Settings)
 *   2. stores + store_settings (from Stores)
 *   3. auth.users + profiles + user_stores (from Users)
 *   4. Per-Store Data:
 *      a. products
 *      b. manual_counts
 *      c. ocr_logs + ocr_items
 *      d. comparisons
 *      e. deposits
 *      f. withdrawals
 *      g. deposit_requests
 *      h. penalties
 *      i. audit_logs
 */

import { createClient } from '@supabase/supabase-js';
// import { google } from 'googleapis';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ============================================================
// Configuration — Update these with your Google Sheets details
// ============================================================
const MASTER_SHEET_ID = 'YOUR_MASTER_SHEET_ID'; // Master settings sheet
const STORE_CONFIGS = [
  {
    storeCode: 'STORE-01',
    storeName: 'ร้านสาขา 1',
    sheetId: 'YOUR_STORE1_SHEET_ID',
    lineToken: '',
    lineGroupId: '',
    isCentral: false,
  },
  // Add more stores as needed
];

// ============================================================
// Helpers
// ============================================================

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function generateUUID(): string {
  return crypto.randomUUID();
}

function sanitizeEmail(username: string): string {
  return `${username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_')}@stockmanager.app`;
}

// ============================================================
// Migration Steps
// ============================================================

async function migrateAppSettings() {
  log('--- Migrating App Settings ---');
  // Example settings - customize based on your Master_Settings sheet
  const settings = [
    { key: 'app_name', value: 'StockManager', type: 'string', description: 'ชื่อแอป' },
    { key: 'version', value: '2.0.0', type: 'string', description: 'เวอร์ชัน' },
    { key: 'default_expiry_days', value: '90', type: 'number', description: 'จำนวนวันเริ่มต้นก่อนหมดอายุ' },
  ];

  for (const s of settings) {
    const { error } = await supabase.from('app_settings').upsert(s, { onConflict: 'key' });
    if (error) log(`  Error: ${error.message}`);
  }
  log(`  Migrated ${settings.length} settings`);
}

async function migrateStores(): Promise<Map<string, string>> {
  log('--- Migrating Stores ---');
  const storeIdMap = new Map<string, string>();

  for (const config of STORE_CONFIGS) {
    const id = generateUUID();
    const { error } = await supabase.from('stores').insert({
      id,
      store_code: config.storeCode,
      store_name: config.storeName,
      line_token: config.lineToken || null,
      line_group_id: config.lineGroupId || null,
      is_central: config.isCentral,
      active: true,
    });

    if (error) {
      log(`  Error creating store ${config.storeCode}: ${error.message}`);
    } else {
      storeIdMap.set(config.storeCode, id);
      log(`  Created store: ${config.storeName} (${id})`);

      // Create default store settings
      await supabase.from('store_settings').insert({
        store_id: id,
        notify_time_daily: '09:00',
        notify_days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        diff_tolerance: 5,
        customer_notify_expiry_enabled: true,
        customer_notify_expiry_days: 7,
        customer_notify_withdrawal_enabled: true,
        customer_notify_deposit_enabled: true,
        customer_notify_promotion_enabled: true,
        customer_notify_channels: ['pwa', 'line'],
      });
    }
  }

  return storeIdMap;
}

interface UserMigrationData {
  username: string;
  role: string;
  storeCode: string;
  displayName?: string;
  lineUserId?: string;
}

async function migrateUsers(
  storeIdMap: Map<string, string>,
  users: UserMigrationData[]
): Promise<Map<string, string>> {
  log('--- Migrating Users ---');
  const userIdMap = new Map<string, string>();

  for (const u of users) {
    const email = sanitizeEmail(u.username);
    const tempPassword = `temp_${u.username}_${Date.now()}`;

    // Create auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { username: u.username, role: u.role },
    });

    if (authError) {
      log(`  Error creating user ${u.username}: ${authError.message}`);
      continue;
    }

    const userId = authData.user.id;
    userIdMap.set(u.username, userId);

    // Update profile
    await supabase.from('profiles').update({
      username: u.username.toLowerCase(),
      role: u.role,
      display_name: u.displayName || u.username,
      line_user_id: u.lineUserId || null,
      active: true,
    }).eq('id', userId);

    // Assign store
    const storeId = storeIdMap.get(u.storeCode);
    if (storeId) {
      await supabase.from('user_stores').insert({
        user_id: userId,
        store_id: storeId,
      });
    }

    log(`  Created user: ${u.username} (${u.role})`);
  }

  return userIdMap;
}

async function migrateProducts(storeId: string, products: Array<{
  product_code: string;
  product_name: string;
  category?: string;
  size?: string;
  unit?: string;
  price?: number;
}>) {
  log(`  Migrating ${products.length} products...`);

  const batch = products.map((p) => ({
    store_id: storeId,
    product_code: p.product_code,
    product_name: p.product_name,
    category: p.category || null,
    size: p.size || null,
    unit: p.unit || null,
    price: p.price || null,
    active: true,
  }));

  const { error } = await supabase.from('products').insert(batch);
  if (error) log(`    Error: ${error.message}`);
  else log(`    Done: ${batch.length} products`);
}

async function migrateDeposits(storeId: string, deposits: Array<{
  deposit_code: string;
  line_user_id?: string;
  customer_name: string;
  customer_phone?: string;
  product_name: string;
  category?: string;
  quantity: number;
  remaining_qty: number;
  remaining_percent?: number;
  table_number?: string;
  status: string;
  expiry_date?: string;
  notes?: string;
  photo_url?: string;
  created_date: string;
}>, userIdMap: Map<string, string>) {
  log(`  Migrating ${deposits.length} deposits...`);

  for (const d of deposits) {
    // Map status
    let status = d.status;
    const statusMap: Record<string, string> = {
      'pending': 'pending_confirm',
      'active': 'in_store',
      'in_store': 'in_store',
      'pending_withdrawal': 'pending_withdrawal',
      'withdrawn': 'withdrawn',
      'expired': 'expired',
      'transferred': 'transferred_out',
    };
    status = statusMap[status.toLowerCase()] || 'in_store';

    const { error } = await supabase.from('deposits').insert({
      store_id: storeId,
      deposit_code: d.deposit_code,
      line_user_id: d.line_user_id || null,
      customer_name: d.customer_name,
      customer_phone: d.customer_phone || null,
      product_name: d.product_name,
      category: d.category || null,
      quantity: d.quantity,
      remaining_qty: d.remaining_qty,
      remaining_percent: d.remaining_percent || (d.remaining_qty / d.quantity) * 100,
      table_number: d.table_number || null,
      status,
      expiry_date: d.expiry_date ? new Date(d.expiry_date).toISOString() : null,
      notes: d.notes || null,
      photo_url: d.photo_url || null,
      created_at: new Date(d.created_date).toISOString(),
    });

    if (error) log(`    Error (${d.deposit_code}): ${error.message}`);
  }
  log(`    Done: ${deposits.length} deposits`);
}

async function migrateComparisons(storeId: string, comparisons: Array<{
  comp_date: string;
  product_code: string;
  product_name: string;
  pos_quantity: number;
  manual_quantity: number;
  difference: number;
  diff_percent: number;
  status: string;
  explanation?: string;
  approval_status?: string;
  owner_notes?: string;
}>) {
  log(`  Migrating ${comparisons.length} comparisons...`);

  const batch = comparisons.map((c) => ({
    store_id: storeId,
    comp_date: c.comp_date,
    product_code: c.product_code,
    product_name: c.product_name,
    pos_quantity: c.pos_quantity,
    manual_quantity: c.manual_quantity,
    difference: c.difference,
    diff_percent: c.diff_percent,
    status: c.status || 'pending',
    explanation: c.explanation || null,
    approval_status: c.approval_status || null,
    owner_notes: c.owner_notes || null,
  }));

  const { error } = await supabase.from('comparisons').insert(batch);
  if (error) log(`    Error: ${error.message}`);
  else log(`    Done: ${batch.length} comparisons`);
}

// ============================================================
// Main Migration Function
// ============================================================

async function main() {
  log('=== StockManager Data Migration ===');
  log('From: Google Sheets → Supabase');
  log('');

  // Step 1: App Settings
  await migrateAppSettings();

  // Step 2: Stores
  const storeIdMap = await migrateStores();
  log(`  Total stores: ${storeIdMap.size}`);

  // Step 3: Users
  // TODO: Read from Google Sheets using googleapis
  // For now, example data structure:
  const sampleUsers: UserMigrationData[] = [
    { username: 'admin', role: 'owner', storeCode: 'STORE-01', displayName: 'Admin' },
    // Add users from Google Sheets data
  ];
  const userIdMap = await migrateUsers(storeIdMap, sampleUsers);
  log(`  Total users: ${userIdMap.size}`);

  // Step 4: Per-Store Data
  // TODO: For each store, read from its Google Sheet and migrate:
  // - Products
  // - Manual Counts
  // - OCR Logs + Items
  // - Comparisons
  // - Deposits
  // - Withdrawals
  // - Deposit Requests
  // - Penalties
  // - Audit Logs

  log('');
  log('=== Migration Complete ===');
  log('');
  log('Next Steps:');
  log('  1. Verify data counts match between old and new system');
  log('  2. Spot-check important records');
  log('  3. Send password reset emails to all staff users');
  log('  4. Update LINE webhook URL to Vercel deployment');
  log('  5. Test all flows per role');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
