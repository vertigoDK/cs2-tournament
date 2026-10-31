// Обложки карт — иллюстрации в стиле сайта, лежат в
// frontend/public/img/maps/<slug>.webp. Чтобы добавить карту, достаточно
// положить туда файл с именем карты в нижнем регистре: код ничего про
// конкретные карты не знает, а без файла плитка просто останется без картинки.

export function mapSlug(name) {
  return (name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

export function mapImage(name) {
  const slug = mapSlug(name);
  return slug ? `/img/maps/${slug}.webp` : null;
}

// Карты, для которых обложка точно есть, — из них берётся обложка турнира.
const COVERS = ["mirage", "inferno", "overpass", "nuke", "vertigo", "lake"];

// Своей обложки у турнира нет, поэтому берём одну из карт по id: у каждого
// турнира она своя и не меняется между заходами.
export function tournamentCover(id) {
  const n = Math.abs(Number(id) || 0);
  return `/img/maps/${COVERS[(n * 5 + 1) % COVERS.length]}.webp`;
}
