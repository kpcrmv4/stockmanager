/**
 * Supabase Connector
 * จัดการ auth, Realtime subscription, REST fallback
 */

const { createClient } = require('@supabase/supabase-js');

class SupabaseConnector {
  constructor(config) {
    this.config = config;
    this.client = null;
    this.channel = null;
    this.isConnected = false;
    this.onJobCallback = null;
    this.fallbackTimer = null;
    this.reconnectTimer = null;
    this.lastDisconnect = null;
  }

  /**
   * เชื่อมต่อ Supabase + Auth
   */
  async connect() {
    this.client = createClient(this.config.SUPABASE_URL, this.config.SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: true,
        persistSession: false,
      },
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    });

    // Sign in with print-server account
    console.log('  [*] Authenticating...');
    const { data, error } = await this.client.auth.signInWithPassword({
      email: this.config.PRINT_ACCOUNT_EMAIL,
      password: this.config.PRINT_ACCOUNT_PASSWORD,
    });

    if (error) {
      throw new Error(`Auth failed: ${error.message}`);
    }

    console.log('  [OK] Authenticated as:', data.user.email);
    return this.client;
  }

  /**
   * Subscribe Realtime สำหรับ print_queue INSERT
   */
  subscribeToJobs(onJob) {
    this.onJobCallback = onJob;

    this.channel = this.client
      .channel(`print-server-${this.config.STORE_ID}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'print_queue',
          filter: `store_id=eq.${this.config.STORE_ID}`,
        },
        (payload) => {
          console.log(`  [RT] New print job received: ${payload.new.id}`);
          if (onJob) onJob(payload.new);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('  [OK] Realtime subscribed to print_queue');
          this.isConnected = true;
          this.lastDisconnect = null;
          this.stopFallbackPolling();
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          console.log(`  [!] Realtime ${status} — activating fallback polling`);
          this.isConnected = false;
          this.lastDisconnect = Date.now();
          this.startFallbackPolling();
          this.scheduleReconnect();
        }
      });
  }

  /**
   * Fallback: REST poll เมื่อ Realtime หลุด
   */
  startFallbackPolling() {
    if (this.fallbackTimer) return;
    console.log('  [*] Fallback polling started (every 10s)');

    this.fallbackTimer = setInterval(async () => {
      try {
        const jobs = await this.fetchPendingJobs();
        for (const job of jobs) {
          if (this.onJobCallback) this.onJobCallback(job);
        }
      } catch (err) {
        console.error('  [!] Fallback poll error:', err.message);
      }
    }, this.config.POLL_INTERVAL || 10000);
  }

  stopFallbackPolling() {
    if (this.fallbackTimer) {
      clearInterval(this.fallbackTimer);
      this.fallbackTimer = null;
      console.log('  [*] Fallback polling stopped (Realtime reconnected)');
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      console.log('  [*] Attempting Realtime reconnect...');
      if (this.channel) {
        this.client.removeChannel(this.channel);
      }
      this.subscribeToJobs(this.onJobCallback);
    }, 15000);
  }

  /**
   * ดึง pending jobs ผ่าน REST API
   */
  async fetchPendingJobs() {
    const { data, error } = await this.client
      .from('print_queue')
      .select('*')
      .eq('store_id', this.config.STORE_ID)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(10);

    if (error) throw error;
    return data || [];
  }

  /**
   * อัพเดทสถานะ job
   */
  async updateJobStatus(jobId, status, extra = {}) {
    const updateData = { status, ...extra };
    if (status === 'completed') {
      updateData.printed_at = new Date().toISOString();
    }

    const { error } = await this.client
      .from('print_queue')
      .update(updateData)
      .eq('id', jobId);

    if (error) {
      console.error(`  [!] Failed to update job ${jobId}:`, error.message);
    }
  }

  /**
   * ดึง receipt settings ของ store
   */
  async fetchReceiptSettings() {
    const { data, error } = await this.client
      .from('store_settings')
      .select('receipt_settings')
      .eq('store_id', this.config.STORE_ID)
      .single();

    if (error) {
      console.warn('  [!] Cannot fetch receipt settings:', error.message);
      return null;
    }

    return data?.receipt_settings || null;
  }

  /**
   * ส่ง heartbeat
   */
  async sendHeartbeat(printerInfo = {}) {
    const { error } = await this.client.from('print_server_status').upsert(
      {
        store_id: this.config.STORE_ID,
        is_online: true,
        last_heartbeat: new Date().toISOString(),
        server_version: '2.0.0',
        printer_name: this.config.PRINTER_NAME,
        printer_status: printerInfo.status || 'ready',
        hostname: require('os').hostname(),
        error_message: printerInfo.error || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'store_id' }
    );

    if (error) {
      console.error('  [!] Heartbeat error:', error.message);
    }
  }

  /**
   * ส่ง offline status ตอนปิด
   */
  async sendOffline() {
    try {
      await this.client.from('print_server_status').upsert(
        {
          store_id: this.config.STORE_ID,
          is_online: false,
          last_heartbeat: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'store_id' }
      );
    } catch (err) {
      // Ignore — shutting down
    }
  }

  /**
   * ปิดการเชื่อมต่อ
   */
  async disconnect() {
    this.stopFallbackPolling();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    await this.sendOffline();
    if (this.channel) {
      this.client.removeChannel(this.channel);
    }
  }
}

module.exports = SupabaseConnector;
