// Пасхалка: у одного участника ник kefir — на его страницах сверху льётся кефир.
// Привязка по нику, а не по логину: логин админ может перевыдать в любой момент.
const KEFIR_NICKS = ["kefir", "кефир"];

export function isKefir(auth) {
  const nick = (auth?.displayName || "").trim().toLowerCase();
  return KEFIR_NICKS.includes(nick);
}
