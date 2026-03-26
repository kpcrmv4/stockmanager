'use client';

import { useCallback, useRef } from 'react';

/**
 * Hook สำหรับเล่นเสียงแจ้งเตือนแชท
 * ใช้ Web Audio API สร้างเสียงเอง (ไม่ต้องโหลดไฟล์)
 */
export function useChatSound() {
  const audioCtxRef = useRef<AudioContext | null>(null);

  const getAudioContext = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    return audioCtxRef.current;
  }, []);

  /** เสียงแจ้งเตือนข้อความใหม่ (สั้นๆ 2 โน้ต) */
  const playMessageSound = useCallback(() => {
    try {
      const ctx = getAudioContext();
      const now = ctx.currentTime;

      // Note 1
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.value = 880; // A5
      gain1.gain.setValueAtTime(0.15, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.15);

      // Note 2 (higher)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.value = 1175; // D6
      gain2.gain.setValueAtTime(0.15, now + 0.1);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.1);
      osc2.stop(now + 0.25);
    } catch {
      // Audio not available
    }
  }, [getAudioContext]);

  /** เสียงแจ้งเตือน @mention (ดังกว่า 3 โน้ต) */
  const playMentionSound = useCallback(() => {
    try {
      const ctx = getAudioContext();
      const now = ctx.currentTime;

      const notes = [880, 1175, 1397]; // A5, D6, F6
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const start = now + i * 0.1;
        gain.gain.setValueAtTime(0.2, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.2);
      });
    } catch {
      // Audio not available
    }
  }, [getAudioContext]);

  /** เสียงแจ้งเตือน action card / งานใหม่ (โน้ตต่ำกว่า + สั่น) */
  const playTaskSound = useCallback(() => {
    try {
      const ctx = getAudioContext();
      const now = ctx.currentTime;

      // Two low-pitched notes — distinct from chat message sound
      const notes = [523, 659]; // C5, E5 (lower, more "alert" tone)
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle'; // softer waveform, feels different from sine
        osc.frequency.value = freq;
        const start = now + i * 0.15;
        gain.gain.setValueAtTime(0.2, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.25);
      });
    } catch {
      // Audio not available
    }

    // Vibrate on mobile — short-long pattern so staff can feel it's a task
    vibrate([100, 50, 200]);
  }, [getAudioContext]);

  return { playMessageSound, playMentionSound, playTaskSound };
}

/**
 * เรียก Vibration API (mobile only, no-op on desktop)
 * Pattern: array of [vibrate, pause, vibrate, ...] in ms
 */
function vibrate(pattern: number | number[]) {
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  } catch {
    // Vibration not supported
  }
}
