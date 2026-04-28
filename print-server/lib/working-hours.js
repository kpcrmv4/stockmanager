/**
 * Working Hours Guard
 * ตรวจสอบว่าอยู่ในช่วงเวลาทำงานหรือไม่
 */

class WorkingHoursGuard {
  constructor(config) {
    this.update(config);
  }

  /**
   * Swap the schedule at runtime. Called from the heartbeat loop
   * after a fresh `print_server_working_hours` JSON arrives from
   * Supabase, so the operator doesn't need to redownload config.json
   * after editing hours in the web app.
   */
  update(config) {
    if (!config) return;
    this.enabled = config.enabled;
    this.startHour = config.startHour;
    this.startMinute = config.startMinute;
    this.endHour = config.endHour;
    this.endMinute = config.endMinute;
  }

  /**
   * True when the current schedule matches the one we'd get from
   * `update(other)` — used by the heartbeat to skip noisy "hours
   * unchanged" log lines.
   */
  matches(other) {
    if (!other) return false;
    return this.enabled === other.enabled
      && this.startHour === other.startHour
      && this.startMinute === other.startMinute
      && this.endHour === other.endHour
      && this.endMinute === other.endMinute;
  }

  isWithinWorkingHours() {
    if (!this.enabled) return true;

    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    const startTime = this.startHour * 60 + this.startMinute;
    const endTime = this.endHour * 60 + this.endMinute;

    // กรณีข้ามวัน เช่น 12:00 - 06:00
    if (startTime > endTime) {
      return currentTime >= startTime || currentTime < endTime;
    }

    // กรณีปกติ เช่น 09:00 - 17:00
    return currentTime >= startTime && currentTime < endTime;
  }

  getStatusText() {
    if (!this.enabled) return '24/7 (always on)';
    const fmt = (h, m) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    return `${fmt(this.startHour, this.startMinute)} - ${fmt(this.endHour, this.endMinute)}`;
  }
}

module.exports = WorkingHoursGuard;
