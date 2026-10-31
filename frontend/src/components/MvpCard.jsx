import Avatar from "./Avatar.jsx";

const HINT =
  "Рейтинг — упрощённый HLTV 1.0: килы и выживаемость за раунд, 1.00 — средний игрок. " +
  "В зачёт идут сыгравшие хотя бы половину раундов.";

// Лучший игрок завершённого турнира — рядом с плашкой чемпиона.
export default function MvpCard({ mvp }) {
  return (
    <div className="mvp-card" title={HINT}>
      <Avatar name={mvp.display_name} color={mvp.avatar_color} url={mvp.avatar_url} size={54} />
      <div>
        <span className="mono">MVP турнира</span>
        <b>{mvp.display_name}</b>
        <span className="mvp-line mono">
          рейтинг <i>{mvp.rating.toFixed(2)}</i> · {mvp.kills}/{mvp.deaths}/{mvp.assists} · {mvp.maps} карт
        </span>
      </div>
    </div>
  );
}
