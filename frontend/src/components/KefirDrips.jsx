import { isKefir } from "../utils/kefir.js";
import { useAuth } from "../auth/AuthContext.jsx";

// Неровный край лужи: неподвижные шматки, которые gooey-фильтр сплавляет
// с верхней полосой в один густой натёк.
const BLOBS = [
  { cx: "3%", cy: 30, r: 22 },
  { cx: "11%", cy: 44, r: 27 },
  { cx: "19%", cy: 26, r: 19 },
  { cx: "27%", cy: 38, r: 24 },
  { cx: "36%", cy: 48, r: 29 },
  { cx: "45%", cy: 28, r: 20 },
  { cx: "54%", cy: 41, r: 26 },
  { cx: "63%", cy: 25, r: 18 },
  { cx: "71%", cy: 46, r: 28 },
  { cx: "80%", cy: 33, r: 22 },
  { cx: "89%", cy: 45, r: 27 },
  { cx: "97%", cy: 29, r: 21 },
];

// Языки, которые свисают с края и медленно дышат: между падениями натёк
// всё равно живой.
const TONGUES = [
  { cx: "19%", r: 15, dur: 6.5, delay: 0 },
  { cx: "45%", r: 16, dur: 8, delay: 2.4 },
  { cx: "63%", r: 14, dur: 7.2, delay: 1.1 },
  { cx: "80%", r: 15, dur: 9, delay: 4.3 },
];

// Дорожки капель. Одна дорожка = один цикл «набухла → оторвалась → упала →
// разбилась», поэтому их немного и с разным ритмом: в воздухе почти всегда
// одна-две капли, а не ливень. dur — весь цикл, само падение занимает ~1 с
// (12% цикла), поэтому чем длиннее dur, тем дольше капля копится наверху.
const LANES = [
  { cx: "11%", r: 17, dur: 8, delay: 0 },
  { cx: "27%", r: 14, dur: 11, delay: 5.2 },
  { cx: "36%", r: 19, dur: 9.5, delay: 3.4 },
  { cx: "54%", r: 15, dur: 12.5, delay: 8.1 },
  { cx: "71%", r: 18, dur: 10.5, delay: 1.8 },
  { cx: "89%", r: 16, dur: 9.2, delay: 6.6 },
];

const cycle = (l) => ({ animationDuration: `${l.dur}s`, animationDelay: `-${l.delay}s` });

// Силуэт капли: острый кончик сверху, налитый шар снизу. Рисуем от кончика
// двумя зеркальными кривыми к экватору шара и замыкаем дугой. Начало
// координат — центр шара, поэтому кончик уходит в минус по Y.
function teardrop(r) {
  const h = r * 2.2;
  const n = (v) => Number(v.toFixed(1));
  return [
    `M0 ${-n(h)}`,
    `C ${n(r * 0.58)} ${-n(h * 0.55)} ${r} ${-n(r * 0.72)} ${r} 0`,
    `A ${r} ${r} 0 1 1 ${-r} 0`,
    `C ${-r} ${-n(r * 0.72)} ${-n(r * 0.58)} ${-n(h * 0.55)} 0 ${-n(h)}`,
    "Z",
  ].join(" ");
}

// Натёк и летящие капли — внутри gooey-фильтра, чтобы капля отрывалась от
// массы с тянущейся ниткой, а не просто уезжала вниз.
function Kefir() {
  return (
    <>
      <rect x="0" y="-40" width="100%" height="66" />
      {BLOBS.map((b, i) => (
        <circle key={`b${i}`} cx={b.cx} cy={b.cy} r={b.r} />
      ))}
      {TONGUES.map((t, i) => (
        <circle key={`t${i}`} className="kefir-tongue" cx={t.cx} cy="46" r={t.r} style={cycle(t)} />
      ))}
      {LANES.map((l, i) => (
        <g key={`d${i}`} className="kefir-lane" style={{ "--x": l.cx }}>
          <path className="kefir-drop" d={teardrop(l.r)} style={cycle(l)} />
        </g>
      ))}
    </>
  );
}

// Удар о низ экрана живёт отдельно от фильтра: gooey режет альфу ступенькой,
// внутри него лужица не смогла бы плавно раствориться — только моргнуть.
function Splashes() {
  return (
    <>
      {LANES.map((l, i) => (
        <g key={`s${i}`}>
          <ellipse
            className="kefir-splat"
            cx={l.cx}
            cy="100%"
            rx={l.r}
            ry={l.r * 0.55}
            style={cycle(l)}
          />
          {[-1, 1].map((dir) => (
            <circle
              key={dir}
              className="kefir-bit"
              cx={l.cx}
              cy="100%"
              r={l.r * 0.26}
              style={{ ...cycle(l), "--dx": `${dir * (l.r * 1.7)}px` }}
            />
          ))}
        </g>
      ))}
    </>
  );
}

export default function KefirDrips() {
  const { auth } = useAuth();
  if (!isKefir(auth)) return null;

  return (
    <div className="kefir" aria-hidden="true">
      <svg xmlns="http://www.w3.org/2000/svg">
        <defs>
          {/* Классический gooey: размыть → задрать альфу ступенькой → вернуть
              резкий контур. Соседние круги слипаются в тягучую массу, а
              оторвавшаяся капля тянет за собой нитку. */}
          <filter id="kefir-goo">
            <feGaussianBlur in="SourceGraphic" stdDeviation="11" result="blur" />
            <feColorMatrix
              in="blur"
              type="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 26 -12"
              result="goo"
            />
            <feComposite in="SourceGraphic" in2="goo" operator="atop" />
          </filter>
        </defs>

        {/* Каждый слой рисуется дважды: сначала подложкой-тенью со сдвигом
            вниз, потом белым. Без тени белый кефир на светлой теме сливается
            с фоном. Прозрачность — на группе: внутри фильтра заливка должна
            быть плотной, иначе ступенька альфы съест капли целиком. */}
        <g className="kefir-shadow" filter="url(#kefir-goo)">
          <Kefir />
        </g>
        <g className="kefir-body" filter="url(#kefir-goo)">
          <Kefir />
        </g>
        <g className="kefir-shadow">
          <Splashes />
        </g>
        <g className="kefir-body">
          <Splashes />
        </g>
      </svg>
    </div>
  );
}
