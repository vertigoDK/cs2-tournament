// Шапка страницы: крупный заголовок, подводка и иллюстрация справа.
export default function PageHead({ title, sub, art, children }) {
  return (
    <section className={`page-head${art ? " with-art" : ""}`}>
      <div>
        <h1>{title}</h1>
        {sub ? <p className="lead">{sub}</p> : null}
        {children}
      </div>
      {art ? <img className="page-head-art" src={art} alt="" /> : null}
    </section>
  );
}

// Пустое состояние с иллюстрацией — вместо голой строки «ничего нет».
export function EmptyState({ art = "/img/trophy.webp", title, text, children }) {
  return (
    <div className="empty">
      <img src={art} alt="" className="empty-art" />
      <h3>{title}</h3>
      {text ? <p>{text}</p> : null}
      {children}
    </div>
  );
}
