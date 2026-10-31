import { Link, useLocation } from "react-router-dom";
import Icon from "../components/Icon.jsx";

export default function NotFound() {
  const { pathname } = useLocation();
  return (
    <main className="page">
      <section className="nf">
        <img
          src="/img/notfound.webp"
          alt="Дымовая граната, в облаке которой теряется пунктирный маршрут"
          className="nf-art"
        />
        <div className="nf-code mono" aria-hidden>
          4<span>0</span>4
        </div>
        <h1>Бомбсайт не найден</h1>
        <p className="lead">
          Кто-то раскинул дым, и маршрут потерялся где-то внутри. По адресу{" "}
          <code className="mono">{pathname}</code> ничего нет.
        </p>
        <Link to="/" className="btn primary">
          <Icon name="arrowLeft" size={15} /> Вернуться на базу
        </Link>
      </section>
    </main>
  );
}
