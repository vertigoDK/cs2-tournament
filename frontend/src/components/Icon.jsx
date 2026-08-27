// Единый набор иконок вместо эмодзи: эмодзи выглядят по-разному в каждой ОС
// и не подхватывают цвет текста. Все иконки рисуются линиями в currentColor,
// поэтому наследуют цвет и вес окружающего элемента.

const paths = {
  trophy: (
    <>
      <path d="M6 4h12v5a6 6 0 0 1-12 0V4Z" />
      <path d="M6 6H3.5A2.5 2.5 0 0 0 6 9.5M18 6h2.5A2.5 2.5 0 0 1 18 9.5" />
      <path d="M12 15v3M9 21h6M10 18h4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  map: (
    <>
      <path d="M9 4.5 3.5 6.8v12.7L9 17.2l6 2.3 5.5-2.3V4.5L15 6.8 9 4.5Z" />
      <path d="M9 4.5v12.7M15 6.8v12.7" />
    </>
  ),
  check: <path d="M4.5 12.5 9.5 17.5 19.5 7" />,
  star: <path d="m12 3.8 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 10l5.9-.9L12 3.8Z" />,
  logout: (
    <>
      <path d="M14 20H6.5A1.5 1.5 0 0 1 5 18.5v-13A1.5 1.5 0 0 1 6.5 4H14" />
      <path d="M17 15.5 20.5 12 17 8.5M20 12H9.5" />
    </>
  ),
  play: <path d="M8 5.5v13l11-6.5-11-6.5Z" />,
  warning: (
    <>
      <path d="M12 4.5 2.8 20h18.4L12 4.5Z" />
      <path d="M12 10v4.5M12 17.2v.1" />
    </>
  ),
  arrowRight: <path d="M5 12h13M13 6.5 18.5 12 13 17.5" />,
  users: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
      <path d="M16 5.2a3.2 3.2 0 0 1 0 5.9M17.5 14.9c2 .6 3.5 2.3 3.5 4.6" />
    </>
  ),
  plus: <path d="M12 5.5v13M5.5 12h13" />,
  chevronDown: <path d="M6.5 9.5 12 15l5.5-5.5" />,
  arrowUp: <path d="M12 19V5M6.5 10.5 12 5l5.5 5.5" />,
  arrowDown: <path d="M12 5v14M6.5 13.5 12 19l5.5-5.5" />,
  user: (
    <>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20c0-3.4 3.1-5.5 7-5.5s7 2.1 7 5.5" />
    </>
  ),
  // Знак приложения: три столбца сетки, сходящиеся в финал.
  bracket: (
    <>
      <path d="M3 5.5h4.5v13H3" />
      <path d="M7.5 12H12" />
      <path d="M12 8h4.5v8H12" />
      <path d="M16.5 12H21" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20h16" />
      <path d="M7 20v-6M12 20V6M17 20v-9" />
    </>
  ),
  medal: (
    <>
      <circle cx="12" cy="14.5" r="5" />
      <path d="M9 9.6 6.5 3.5M15 9.6 17.5 3.5M10 3.5h4" />
    </>
  ),
  history: (
    <>
      <path d="M3.8 12a8.2 8.2 0 1 0 2.6-6" />
      <path d="M3.5 3.5v4.2h4.2" />
      <path d="M12 8v4.4l3 1.8" />
    </>
  ),
  image: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <circle cx="9" cy="9.5" r="1.6" />
      <path d="M4 16.5 9 12l4 3.5 3-2.5 4 3.5" />
    </>
  ),
  trash: (
    <>
      <path d="M4.5 6.5h15M9.5 6.5V4.8h5v1.7" />
      <path d="M6.5 6.5 7.4 20h9.2l.9-13.5" />
    </>
  ),
  lock: (
    <>
      <rect x="4.5" y="10.5" width="15" height="9.5" rx="2" />
      <path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" />
    </>
  ),
};

export default function Icon({ name, size = 16, className, filled = false, ...rest }) {
  const d = paths[name];
  if (!d) return null;
  return (
    <svg
      className={className ? `icon ${className}` : "icon"}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {d}
    </svg>
  );
}
