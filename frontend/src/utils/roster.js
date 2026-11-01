// Все, кто выходил за команду: основной состав и замены. У замен тоже своя
// строка в статистике, иначе их цифры потерялись бы.
export function rosterOf(team, slot) {
  if (!team) return [];
  return [
    { id: team.player_a_id, name: team.a, color: team.a_color, url: team.a_avatar, slot },
    team.player_b_id
      ? { id: team.player_b_id, name: team.b, color: team.b_color, url: team.b_avatar, slot }
      : null,
    ...(team.subs_info || []).map((s) => ({ id: s.id, name: s.name, color: s.color, url: s.avatar, slot })),
  ].filter(Boolean);
}

// Тот же упрощённый рейтинг HLTV 1.0, что и на сервере (bracket.player_rating):
// 1.00 — средний игрок.
export function playerRating(kills, deaths, rounds) {
  if (!rounds) return 0;
  return (kills / rounds / 0.679 + (0.7 * (rounds - deaths)) / rounds / 0.317) / 1.7;
}
