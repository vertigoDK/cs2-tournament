import { createPortal } from "react-dom";

// Затемнение под модальным окном. Рисуется прямо в <body>, а не внутри
// страницы: у .page есть анимация появления с transform, и пока она идёт,
// position: fixed считается от страницы — окно на полсекунды вставало внизу
// и без размытия фона.
export default function Backdrop({ onClose, children }) {
  return createPortal(
    <div className="veto-backdrop" onClick={onClose}>
      {children}
    </div>,
    document.body
  );
}
