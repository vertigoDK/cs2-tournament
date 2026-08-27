import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import Icon from "./Icon.jsx";
import ProfileMenu from "./ProfileMenu.jsx";

export default function Layout() {
  const { isAdmin } = useAuth();

  return (
    <div className="app">
      <header className="topbar">
        <NavLink to="/" className="brand">
          <span className="brand-mark">
            <Icon name="bracket" size={18} />
          </span>
          <span className="brand-text">CS2 Турниры</span>
        </NavLink>

        <nav className="topnav">
          <NavLink to="/" end className="topnav-link">
            Турниры
          </NavLink>
          <NavLink to="/stats" className="topnav-link">
            Статистика
          </NavLink>
          {isAdmin ? (
            <NavLink to="/users" className="topnav-link">
              Участники
            </NavLink>
          ) : null}
        </nav>

        <div className="spacer" />

        {isAdmin ? (
          <NavLink to="/tournaments/new" className="btn primary new-tournament" title="Новый турнир">
            <Icon name="plus" size={14} />
            <span>Новый турнир</span>
          </NavLink>
        ) : null}
        <ProfileMenu />
      </header>
      <Outlet />
    </div>
  );
}
