import { useEffect, useRef } from "react";
import { FLAKES, isWinter, setSnow, useSnow } from "../utils/season.js";

// Снегопад на фоне: за карточками, поверх бумаги. Белый снег на светлой
// бумаге не виден, поэтому снег «карандашный» — серые точки и изредка
// нарисованные снежинки, как остальные рисунки сайта.
export function Snowfall() {
  const on = useSnow();
  const ref = useRef(null);

  useEffect(() => {
    if (!on || !isWinter()) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const canvas = ref.current;
    const ctx = canvas.getContext("2d");
    const sprites = FLAKES.map((src) => {
      const img = new Image();
      img.src = src;
      return img;
    });
    let w = 0;
    let h = 0;
    let dpr = 1;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const count = w < 700 ? 34 : 70;
    const make = (top) => {
      const flake = Math.random() < 0.16;
      return {
        x: Math.random() * w,
        y: top ? -20 : Math.random() * h,
        r: flake ? 9 + Math.random() * 9 : 1 + Math.random() * 1.9,
        vy: flake ? 0.35 + Math.random() * 0.35 : 0.4 + Math.random() * 0.8,
        sway: Math.random() * Math.PI * 2,
        swaySpeed: 0.004 + Math.random() * 0.01,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.01,
        sprite: flake ? sprites[Math.floor(Math.random() * sprites.length)] : null,
        alpha: flake ? 0.38 + Math.random() * 0.25 : 0.12 + Math.random() * 0.16,
      };
    };
    const parts = Array.from({ length: count }, () => make(false));

    let raf = 0;
    const frame = () => {
      ctx.clearRect(0, 0, w, h);
      for (const p of parts) {
        p.sway += p.swaySpeed;
        p.y += p.vy;
        p.x += Math.sin(p.sway) * 0.35;
        p.rot += p.vr;
        if (p.y > h + 20) Object.assign(p, make(true));
        ctx.globalAlpha = p.alpha;
        if (p.sprite) {
          if (!p.sprite.complete) continue;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.drawImage(p.sprite, -p.r, -p.r, p.r * 2, p.r * 2);
          ctx.restore();
        } else {
          ctx.fillStyle = "#151515";
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    };
    const onVis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVis);
      ctx.clearRect(0, 0, w, h);
    };
  }, [on]);

  if (!on || !isWinter()) return null;
  return <canvas ref={ref} className="snowfall" aria-hidden />;
}

// Ночное небо над панорамой в подвале: луна и пролетающий Санта.
export function WinterSky() {
  if (!isWinter()) return null;
  return (
    <div className="winter-sky" aria-hidden>
      <img src="/img/winter/moon.webp" alt="" className="ws-moon" />
      <img src="/img/winter/sleigh.webp" alt="" className="ws-sleigh" />
    </div>
  );
}

// Колпак Санты на логотипе.
export function SantaHat() {
  if (!isWinter()) return null;
  return (
    <svg className="santa-hat" viewBox="0 0 40 32" aria-hidden>
      <path
        d="M5 25 C 9 13, 17 4, 29 6 C 33 7, 35 11, 36 16 C 33 13, 29 12, 27 14 C 31 17, 33 21, 34 25 Z"
        fill="var(--accent)"
        stroke="var(--ink)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M3 24.5 C 12 21.5, 25 21.5, 36 24.5 L 35.5 29.5 C 25 27, 13 27, 3.5 29.5 Z" fill="#fff" stroke="var(--ink)" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="36" cy="17" r="3.6" fill="#fff" stroke="var(--ink)" strokeWidth="1.6" />
    </svg>
  );
}

// Переключатель снега в подвале.
export function SnowToggle() {
  const on = useSnow();
  if (!isWinter()) return null;
  return (
    <button type="button" className="snow-toggle mono" onClick={() => setSnow(!on)} aria-pressed={on}>
      <img src={FLAKES[0]} alt="" />
      снег: {on ? "вкл" : "выкл"}
    </button>
  );
}

// Снежинки на полях широкого экрана — вместо тактических пометок.
export function WinterNotes() {
  return (
    <>
      <img src={FLAKES[0]} alt="" className="fn fn-1 fn-flake" />
      <img src={FLAKES[2]} alt="" className="fn fn-2 fn-flake" />
      <img src={FLAKES[4]} alt="" className="fn fn-3 fn-flake" />
      <img src={FLAKES[1]} alt="" className="fn fn-4 fn-flake" />
    </>
  );
}

// Баннер зимнего турнира: снежная шапка по верхнему краю, снежинки поверх
// обложки и редкий снег внутри карточки.
const BANNER_FLAKES = [
  { src: 0, top: "12%", right: "34%", size: 44, delay: 0 },
  { src: 2, top: "58%", right: "44%", size: 30, delay: 1.4 },
  { src: 4, top: "22%", right: "8%", size: 52, delay: 0.7 },
  { src: 1, top: "70%", right: "18%", size: 36, delay: 2.1 },
  { src: 5, top: "40%", right: "27%", size: 26, delay: 3 },
  { src: 3, top: "8%", right: "58%", size: 24, delay: 1.9 },
];

export function WinterBanner() {
  return (
    <div className="winter-banner" aria-hidden>
      <svg className="wb-cap" viewBox="0 0 400 24" preserveAspectRatio="none">
        <path
          d="M0 0 H400 V10 C 390 14, 382 9, 372 13 C 362 20, 352 12, 342 14 C 330 16, 322 10, 310 13 C 300 22, 290 13, 278 12 C 266 11, 258 17, 246 14 C 236 11, 226 19, 214 15 C 204 12, 194 10, 182 14 C 172 21, 162 12, 150 13 C 138 14, 130 9, 118 13 C 108 19, 98 12, 86 13 C 74 14, 66 10, 54 14 C 44 20, 34 11, 22 13 C 12 15, 6 10, 0 12 Z"
          fill="#fff"
          stroke="var(--ink)"
          strokeWidth="1.4"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {BANNER_FLAKES.map((f, i) => (
        <img
          key={i}
          src={FLAKES[f.src]}
          alt=""
          className="wb-flake"
          style={{ top: f.top, right: f.right, width: f.size, animationDelay: `${f.delay}s` }}
        />
      ))}
      {Array.from({ length: 18 }, (_, i) => (
        <i
          key={i}
          className="wb-snow"
          style={{
            left: `${(i * 37) % 100}%`,
            animationDelay: `${(i * 0.9) % 7}s`,
            animationDuration: `${6 + (i % 5)}s`,
          }}
        />
      ))}
    </div>
  );
}
