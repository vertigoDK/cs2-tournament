import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import Avatar from "./Avatar.jsx";
import Icon from "./Icon.jsx";

export default function ProfileMenu() {
  const { auth, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  // Меню закрывается кликом мимо и по Escape — иначе оно «залипает»
  // и перекрывает контент.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const go = (path) => {
    setOpen(false);
    navigate(path);
  };

  const doLogout = () => {
    setOpen(false);
    logout();
    navigate("/login");
  };

  return (
    <div className="profile-menu" ref={wrapRef}>
      <button
        type="button"
        className={`profile-trigger${open ? " open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Avatar name={auth?.displayName} color={auth?.avatarColor} url={auth?.avatarUrl} size={28} />
        <span className="pt-name">{auth?.displayName}</span>
        <Icon name="chevronDown" size={14} className="pt-caret" />
      </button>

      {open ? (
        <div className="profile-dropdown" role="menu">
          <div className="pd-head">
            <Avatar name={auth?.displayName} color={auth?.avatarColor} url={auth?.avatarUrl} size={38} />
            <div className="pd-id">
              <b>{auth?.displayName}</b>
              <span>
                {auth?.username}
                {isAdmin ? " · администратор" : ""}
              </span>
            </div>
          </div>
          <div className="pd-sep" />
          <button type="button" className="pd-item" role="menuitem" onClick={() => go("/me")}>
            <Icon name="user" size={16} />
            Личный кабинет
          </button>
          {isAdmin ? (
            <button type="button" className="pd-item" role="menuitem" onClick={() => go("/users")}>
              <Icon name="users" size={16} />
              Участники
            </button>
          ) : null}
          <div className="pd-sep" />
          <button type="button" className="pd-item danger" role="menuitem" onClick={doLogout}>
            <Icon name="logout" size={16} />
            Выйти
          </button>
        </div>
      ) : null}
    </div>
  );
}
