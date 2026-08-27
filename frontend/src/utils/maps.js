// Картинки карт лежат в frontend/public/maps/<slug>.png и отдаются статикой.
// Чтобы добавить новую карту, достаточно положить туда файл с именем карты
// в нижнем регистре — код ничего про конкретные карты не знает.

export function mapSlug(name) {
  return (name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

export function mapImage(name) {
  const slug = mapSlug(name);
  return slug ? `/maps/${slug}.png` : null;
}
