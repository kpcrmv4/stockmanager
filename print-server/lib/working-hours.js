/**
 * Working Hours Guard
 * ตรวจสอบว่าอยู่ในช่วงเวลาทำงานหรือไม่
 */

class WorkingHoursGuard {
  constructor(config) {
    this.enabled = config.enabled;
    this.startHour = config.startHour;
    this.startMinute = config.startMinute;
    this.endHour = config.endHour;
    this.endMinute = config.endMinute;
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
