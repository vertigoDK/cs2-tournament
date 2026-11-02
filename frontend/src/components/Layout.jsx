import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext.jsx";
import Icon from "./Icon.jsx";
import ProfileMenu from "./ProfileMenu.jsx";
import KefirDrips from "./KefirDrips.jsx";
import DraftRedirect from "./DraftRedirect.jsx";
import { SantaHat, Snowfall, SnowToggle, WinterNotes, WinterSky } from "./Winter.jsx";
import { isWinter } from "../utils/season.js";

// Группы бокового меню; новый раздел — строка в нужной группе.
const NAV = [
  { title: "Играем", items: [{ to: "/", end: true, label: "Турниры", icon: "trophy" }] },
  {
    title: "Люди и цифры",
    items: [
      { to: "/players", label: "Игроки", icon: "users" },
      { to: "/history", label: "История", icon: "history" },
      { to: "/stats", label: "Статистика", icon: "chart" },
    ],
  },
  { title: "Для меня", items: [{ to: "/skins", label: "Выбрать скины", icon: "image" }] },
];
const ADMIN_NAV = { title: "Админ", items: [{ to: "/users", label: "Участники", icon: "lock" }] };

export default function Layout() {
  const { auth, isAdmin } = useAuth();
  const location = useLocation();
  const { pathname } = location;

  const [menuOpen, setMenuOpen] = useState(false);
  const groups = isAdmin ? [...NAV, ADMIN_NAV] : NAV;

  useEffect(() => {
    window.scrollTo(0, 0);
    setMenuOpen(false);
  }, [pathname]);

  const navClass = ({ isActive }) => `nav-link${isActive ? " active" : ""}`;

  return (
    <div className="app">
      <aside className={`sidebar${menuOpen ? " open" : ""}`}>
        <Link to="/" className="brand" aria-label="NINE CUP — на главную">
          <span className="brand-mark">
            <img src="/img/logo-light.png" alt="" />
            <SantaHat />
          </span>
          <span className="brand-text">
            <span className="brand-word">nine</span>
            <span className="brand-sub mono">cup</span>
          </span>
        </Link>

        <nav className="side-nav">
          {groups.map((g) => (
            <div key={g.title} className="side-group">
              <span className="side-title mono">{g.title}</span>
              {g.items.map((it) => (
                <NavLink key={it.to} to={it.to} end={it.end} className={navClass}>
                  <Icon name={it.icon} size={17} />
                  <span>{it.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="side-foot">
          {isAdmin ? (
            <Link to="/tournaments/new" className="btn primary side-new">
              <Icon name="plus" size={15} />
              Новый турнир
            </Link>
          ) : null}
          {auth ? (
            <ProfileMenu />
          ) : (
            <Link to="/login" state={{ from: pathname }} className="btn side-login">
              <Icon name="user" size={15} /> Войти
            </Link>
          )}
        </div>
      </aside>
      {menuOpen ? <button type="button" className="side-scrim" aria-label="Закрыть меню" onClick={() => setMenuOpen(false)} /> : null}

      <div className="main">
        {/* Тактические пометки на полях широкого экрана — чистое украшение. */}
        <div className="field-notes" aria-hidden>
          {isWinter() ? (
            <WinterNotes />
          ) : (
            <>
              <img src="/img/doodle-arc.webp" alt="" className="fn fn-1" />
              <img src="/img/doodle-site-a.webp" alt="" className="fn fn-2" />
              <img src="/img/doodle-steps.webp" alt="" className="fn fn-3" />
              <img src="/img/doodle-site-b.webp" alt="" className="fn fn-4" />
            </>
          )}
        </div>

        {/* На телефоне панель уезжает в выдвижное меню, наверху остаётся тонкая полоса. */}
        <header className="topbar">
          <Link to="/" className="brand" aria-label="NINE CUP — на главную">
            <span className="brand-mark">
              <img src="/img/logo-light.png" alt="" />
              <SantaHat />
            </span>
            <span className="brand-text">
              <span className="brand-word">nine</span>
              <span className="brand-sub mono">cup</span>
            </span>
          </Link>
          <button type="button" className="burger" aria-label="Меню" aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}>
            <Icon name={menuOpen ? "close" : "grid"} size={20} />
          </button>
        </header>

      {/* key по адресу перезапускает анимацию появления на каждой странице */}
      <div className="page-wrap" key={pathname}>
        <Outlet />
      </div>

      {/* Панорама карт стоит на верхней линии подвала. */}
      <div className={`skyline${isWinter() ? " winter" : ""}`} aria-hidden>
        <WinterSky />
        <img src="/img/skyline.webp" alt="" loading="lazy" />
      </div>

      <footer className="footer">
        <div className="footer-inner">
          <img src="/img/logo.png" alt="" className="footer-mark" />
          <span>Играем до девяти.</span>
          <SnowToggle />
          <span className="footer-meta mono">2×2 · BO1 / BO3 / BO5 · {new Date().getFullYear()}</span>
        </div>
      </footer>

      </div>

      <Snowfall />
      {auth ? <DraftRedirect /> : null}
      <KefirDrips />
    </div>
  );
}
