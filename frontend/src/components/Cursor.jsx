import { useEffect, useRef, useState } from "react";

const INTERACTIVE = 'a, button, [role="button"], select, label, summary, [data-cursor]';
const TEXT = 'input:not([type="radio"]):not([type="checkbox"]):not([type="range"]):not([type="file"]), textarea';

// Курсор-прицел: точка ходит за мышью один в один, а кольцо с небольшой
// задержкой «наводится» на всё кликабельное. На тач-экранах не включается —
// там курсора нет, а пустой прицел висел бы в углу.
export default function Cursor() {
  const [enabled] = useState(() => window.matchMedia("(pointer: fine)").matches);
  const sight = useRef(null);
  const ring = useRef(null);

  useEffect(() => {
    if (!enabled) return;
    const root = document.documentElement;
    root.classList.add("has-cursor", "cursor-hidden");

    const pos = { x: -100, y: -100 };
    const lag = { x: -100, y: -100 };
    let raf = 0;

    const tick = () => {
      lag.x += (pos.x - lag.x) * 0.22;
      lag.y += (pos.y - lag.y) * 0.22;
      if (ring.current) ring.current.style.transform = `translate3d(${lag.x}px, ${lag.y}px, 0)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const setState = (cls, on) => root.classList.toggle(cls, on);

    const onMove = (e) => {
      pos.x = e.clientX;
      pos.y = e.clientY;
      if (sight.current) sight.current.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
      setState("cursor-hidden", false);
    };
    const onOver = (e) => {
      const el = e.target;
      setState("cursor-text", Boolean(el.closest?.(TEXT)));
      setState("cursor-hover", Boolean(el.closest?.(INTERACTIVE)));
    };
    const onDown = () => {
      setState("cursor-down", true);
      ring.current?.classList.remove("ping");
      void ring.current?.offsetWidth; // перезапуск анимации
      ring.current?.classList.add("ping");
    };
    const onUp = () => setState("cursor-down", false);
    const onLeave = () => setState("cursor-hidden", true);

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerover", onOver, { passive: true });
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    document.addEventListener("pointerleave", onLeave);

    return () => {
      cancelAnimationFrame(raf);
      root.classList.remove("has-cursor", "cursor-hover", "cursor-text", "cursor-down", "cursor-hidden");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerover", onOver);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, [enabled]);

  if (!enabled) return null;
  return (
    <>
      <div ref={ring} className="cursor-ring" aria-hidden />
      <div ref={sight} className="cursor-sight" aria-hidden>
        <img src="/img/cursor-64.png" alt="" draggable={false} />
      </div>
    </>
  );
}
