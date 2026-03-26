'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * Shared AudioContext — สร้างครั้งเดียว, resume จาก user gesture
 *
 * Mobile browsers (iOS Safari, Android Chrome) จะ suspend AudioContext
 * ที่ถูกสร้างโดยไม่มี user gesture ดังนั้นต้อง:
 * 1. สร้าง AudioContext ตอน mount
 * 2. resume() เมื่อ user แตะหน้าจอครั้งแรก (unlock)
 * 3. ตรวจ state ก่อนเล่นเสียงทุกครั้ง
 */
let sharedCtx: AudioContext | null = null;
let unlocked = false;

function getOrCreateContext(): AudioContext {
  if (!sharedCtx) {
    sharedCtx = new AudioContext();
  }
  return sharedCtx;
}

/**
 * Unlock AudioContext ด้วย user gesture (click/touch/keydown)
 * เรียกครั้งเดียว แล้วถอด listener ออก
 */
function unlockAudio() {
  if (unlocked) return;
  const ctx = getOrCreateContext();
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
  // เล่น silent buffer เพื่อ unlock บน iOS
  const buffer = ctx.createBuffer(1, 1, 22050);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start(0);
  unlocked = true;
  // ถอด listeners หลัง unlock สำเร็จ
  for (const evt of ['touchstart', 'touchend', 'click', 'keydown'] as const) {
    document.removeEventListener(evt, unlockAudio, true);
  }
}

/**
 * Hook สำหรับเล่นเสียงแจ้งเตือนแชท
 * ใช้ Web Audio API สร้างเสียงเอง (ไม่ต้องโหลดไฟล์)
 *
 * เรียก useEffect เพื่อ listen user gesture → unlock AudioContext บนมือถือ
 */
export function useChatSound() {
  const ctxRef = useRef<AudioContext | null>(null);

  // Mount: สร้าง AudioContext + listen สำหรับ user gesture unlock
  useEffect(() => {
    ctxRef.current = getOrCreateContext();

    if (!unlocked) {
      for (const evt of ['touchstart', 'touchend', 'click', 'keydown'] as const) {
        document.addEventListener(evt, unlockAudio, true);
      }
    }

    return () => {
      // ไม่ปิด sharedCtx เพราะอาจถูกใช้จาก component อื่น
    };
  }, []);

  /** เตรียม AudioContext ก่อนเล่น — resume ถ้า suspended */
  const readyCtx = useCallback((): AudioContext | null => {
    const ctx = ctxRef.current ?? getOrCreateContext();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    // ถ้ายังเป็น suspended (ยังไม่เคยมี gesture) ก็ปล่อยไป — browser จะ buffer ไว้
    return ctx;
  }, []);

  /** เสียงแจ้งเตือนข้อความใหม่ (สั้นๆ 2 โน้ต) */
  const playMessageSound = useCallback(() => {
    try {
      const ctx = readyCtx();
      if (!ctx) return;
      const now = ctx.currentTime;

      // Note 1 — A5
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.value = 880;
      gain1.gain.setValueAtTime(0.15, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.15);

      // Note 2 — D6
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.value = 1175;
      gain2.gain.setValueAtTime(0.15, now + 0.1);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.1);
      osc2.stop(now + 0.25);
    } catch {
      // Audio not available
    }
  }, [readyCtx]);

  /** เสียงแจ้งเตือน @mention (ดังกว่า 3 โน้ต) */
  const playMentionSound = useCallback(() => {
    try {
      const ctx = readyCtx();
      if (!ctx) return;
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
  }, [readyCtx]);

  /** เสียงแจ้งเตือน action card / งานใหม่ (โน้ตต่ำกว่า + สั่น) */
  const playTaskSound = useCallback(() => {
    try {
      const ctx = readyCtx();
      if (!ctx) return;
      const now = ctx.currentTime;

      // Two low-pitched triangle notes — distinct from chat message sound
      const notes = [523, 659]; // C5, E5
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
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

    // Vibrate on mobile (Android only — iOS ไม่ support Vibration API)
    vibrate([100, 50, 200]);
  }, [readyCtx]);

  return { playMessageSound, playMentionSound, playTaskSound };
}

/**
 * เรียก Vibration API (Android Chrome only, no-op on iOS/desktop)
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
