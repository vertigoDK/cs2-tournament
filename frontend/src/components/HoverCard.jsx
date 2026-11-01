import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";

// Карточка при наведении (кубки, медали). Рисуется поверх страницы через
// портал: её не обрезают карточки с overflow и не перекрашивают тёмные
// плашки вокруг. Над значком, а если сверху не влезает — под ним.
export default function HoverCard({ card, children, to, label, className = "" }) {
  const ref = useRef(null);
  const [anchor, setAnchor] = useState(null);

  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setAnchor({ x: r.left + r.width / 2, top: r.top, bottom: r.bottom });
  };
  const hide = () => setAnchor(null);

  useEffect(() => {
    if (!anchor) return;
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [anchor]);

  const Tag = to ? Link : "span";
  return (
    <Tag
      ref={ref}
      to={to}
      tabIndex={to ? undefined : 0}
      className={`cup ${className}`}
      aria-label={label}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {anchor ? createPortal(<Floating anchor={anchor}>{card}</Floating>, document.body) : null}
    </Tag>
  );
}

function Floating({ anchor, children }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const gap = 12;
    const left = Math.min(Math.max(8, anchor.x - width / 2), window.innerWidth - width - 8);
    const above = anchor.top - height - gap;
    const below = above < 8;
    setPos({
      left,
      top: below ? anchor.bottom + gap : above,
      arrow: Math.min(Math.max(18, anchor.x - left), width - 18),
      below,
    });
  }, [anchor]);

  return (
    <span
      ref={ref}
      className={`cup-tip${pos ? " on" : ""}${pos?.below ? " below" : ""}`}
      role="tooltip"
      style={pos ? { left: pos.left, top: pos.top, "--arrow": `${pos.arrow}px` } : { left: 0, top: 0 }}
    >
      {children}
    </span>
  );
}
