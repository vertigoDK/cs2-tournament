import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { useAuth } from "../auth/AuthContext.jsx";
import Icon from "./Icon.jsx";
import ProfileMenu from "./ProfileMenu.jsx";
import KefirDrips from "./KefirDrips.jsx";
import DraftRedirect from "./DraftRedirect.jsx";
import { SantaHat, Snowfall, SnowToggle, WinterNotes, WinterSky } from "./Winter.jsx";
import { isWinter } from "../utils/season.js";

export default function Layout() {
  const { auth, isAdmin } = useAuth();
  const location = useLocation();
  const { pathname } = location;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  const navClass = ({ isActive }) => `nav-link${isActive ? " active" : ""}`;

  return (
    <div className="app">
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

      <header className="header">
        <div className="header-inner">
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

          <nav className="nav">
            <NavLink to="/" end className={navClass}>
              Турниры
            </NavLink>
            <NavLink to="/players" className={navClass}>
              Игроки
            </NavLink>
            <NavLink to="/history" className={navClass}>
              История
            </NavLink>
            <NavLink to="/stats" className={navClass}>
              Статистика
            </NavLink>
            <NavLink to="/skins" className={navClass}>
              Выбрать скины
            </NavLink>
            {isAdmin ? (
              <NavLink to="/users" className={navClass}>
                Участники
              </NavLink>
            ) : null}
          </nav>

          <div className="header-actions">
            {isAdmin ? (
              <Link to="/tournaments/new" className="btn primary new-tournament" title="Новый турнир">
                <Icon name="plus" size={15} />
                <span className="hide-sm">Новый турнир</span>
              </Link>
            ) : null}
            {auth ? (
              <ProfileMenu />
            ) : (
              <Link to="/login" state={{ from: pathname }} className="btn">
                <Icon name="user" size={15} /> Войти
              </Link>
            )}
          </div>
        </div>
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

      <Snowfall />
      {auth ? <DraftRedirect /> : null}
      <KefirDrips />
    </div>
  );
}
