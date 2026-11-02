import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api, { apiErrorMessage } from "../api.js";
import { useAuth } from "../auth/AuthContext.jsx";
import Icon from "../components/Icon.jsx";
import LobbyStage from "../components/LobbyStage.jsx";
import { BlockBones } from "../components/Skeleton.jsx";
import { useToast } from "../components/Toast.jsx";

// Страница одного лобби. Лобби — отдельная игра, в общую статистику она не идёт.
export default function LobbyView() {
  const { id } = useParams();
  const { isAdmin } = useAuth();
  const { toast, toastNode } = useToast();
  const navigate = useNavigate();
  const [lobby, setLobby] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api
      .get(`/lobbies/${id}`)
      .then((res) => setLobby(res.data))
      .catch((err) => setError(apiErrorMessage(err)));
  }, [id]);

  useEffect(() => {
    load();
    const t = setInterval(() => !document.hidden && load(), 6000);
    return () => clearInterval(t);
  }, [load]);

  const cancel = async (l) => {
    if (!confirm("Отменить лобби? Сервер перестанет его ждать.")) return;
    try {
      await api.post(`/lobbies/${l.id}/cancel`);
      load();
    } catch (err) {
      toast(apiErrorMessage(err));
    }
  };

  const remove = async () => {
    if (!confirm("Удалить это лобби совсем? Это необратимо.")) return;
    try {
      await api.delete(`/lobbies/${id}`);
      navigate("/lobbies");
    } catch (err) {
      toast(apiErrorMessage(err));
    }
  };

  return (
    <main className="page">
      {isAdmin && lobby ? (
        <button type="button" className="btn sm danger lv-delete" onClick={remove}>
          <Icon name="trash" size={13} /> Удалить лобби
        </button>
      ) : null}
      <Link to="/lobbies" className="back">
        <Icon name="arrowLeft" size={16} /> Все лобби
      </Link>
      {error ? <div className="error-box">{error}</div> : null}
      {!lobby ? <BlockBones rows={4} /> : <LobbyStage lobby={lobby} isAdmin={isAdmin} onCancel={cancel} toast={toast} />}
      {lobby && !["waiting", "ready", "live"].includes(lobby.status) ? (
        <p className="hint lv-note">Это отдельная игра: в статистику, рейтинг и историю турниров она не идёт.</p>
      ) : null}
      {toastNode}
    </main>
  );
}
