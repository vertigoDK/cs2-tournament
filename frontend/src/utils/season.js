// Зимнее оформление: снег, луна, Санта с оленями, снежинки, колпак на логотипе.
// Включается само с ноября по февраль. Снег можно выключить в подвале —
// выбор запоминается в браузере.
import { useSyncExternalStore } from "react";

export function isWinter(d = new Date()) {
  const m = d.getMonth();
  return m >= 10 || m <= 1;
}

export const isWinterTournament = (name) => /зим/i.test(name || "");

const KEY = "snow";
const listeners = new Set();

function readSnow() {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSnow(on) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* приватный режим — просто не запомним */
  }
  listeners.forEach((fn) => fn());
}

export function useSnow() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    readSnow,
    () => true
  );
}

export const FLAKES = [1, 2, 3, 4, 5, 6].map((n) => `/img/winter/flake-${n}.webp`);
