import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import Icon from "../components/Icon.jsx";
import PageHead from "../components/PageHead.jsx";

// Заглушка «Скины». Идея: игрок выбирает скины на сайте, а плагин на нашем
// CS2-сервере выдаёт их ему в игре. Пока только раскладка, без данных.

const SLOTS = [
  { group: "Главное", items: ["Нож", "Перчатки"] },
  { group: "Винтовки", items: ["AK-47", "M4A4", "M4A1-S", "AWP"] },
  { group: "Пистолеты", items: ["Desert Eagle", "USP-S", "Glock-18"] },
];

const STEPS = [
  { title: "Выбираешь здесь", text: "Нож, перчатки и скины на любое оружие — прямо на сайте." },
  { title: "Заходишь на наш сервер", text: "Сервер узнаёт тебя по Steam ID, ничего вводить не нужно." },
  { title: "Играешь со своими", text: "Плагин выдаёт выбранные скины в каждом матче турнира." },
];

export default function Skins() {
  const { auth } = useAuth();

  return (
    <main className="page">
      <PageHead
        title={auth ? "Мои скины" : "Скины"}
        sub="Скоро: собираешь свой набор на сайте — и на нашем сервере он у тебя в игре."
        art="/img/skins.webp"
      >
        <span className="soon-badge mono">
          <i className="live-dot" /> в разработке
        </span>
      </PageHead>

      <ol className="skin-steps">
        {STEPS.map((s, i) => (
          <li key={s.title} style={{ animationDelay: `${i * 70}ms` }}>
            <span className="mono">0{i + 1}</span>
            <b>{s.title}</b>
            <p>{s.text}</p>
          </li>
        ))}
      </ol>

      {SLOTS.map((g) => (
        <section key={g.group} className="section">
          <h2 className="section-title">{g.group}</h2>
          <div className="skin-grid">
            {g.items.map((name, i) => (
              <div key={name} className="skin-slot" style={{ animationDelay: `${i * 50}ms` }}>
                <div className="ss-art">
                  <Icon name="plus" size={20} />
                </div>
                <div className="ss-body">
                  <b>{name}</b>
                  <span className="mono">не выбран</span>
                </div>
                <span className="ss-tag mono">скоро</span>
              </div>
            ))}
          </div>
        </section>
      ))}

      {!auth ? (
        <p className="hint skin-hint">
          Выбирать скины можно будет после <Link to="/login">входа</Link> — набор привяжется к твоему аккаунту.
        </p>
      ) : null}
    </main>
  );
}
