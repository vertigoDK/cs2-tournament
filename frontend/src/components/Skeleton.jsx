import { useEffect, useState } from "react";

// Заглушки на время загрузки: повторяют раскладку настоящей страницы, чтобы
// контент вставал на место, а не прыгал. После долгого простоя первый запрос
// будит функцию на Vercel и базу Neon — это пара секунд, и тогда под
// заглушкой появляется подпись, что сервер просыпается.

export function Bone({ w, h = 14, r, className = "", style }) {
  return (
    <span
      className={`bone ${className}`}
      style={{ width: w, height: h ?? undefined, borderRadius: r, ...style }}
      aria-hidden="true"
    />
  );
}

function WakeNote() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 2500);
    return () => clearTimeout(timer);
  }, []);
  return (
    <p className={`wake-note mono${slow ? " show" : ""}`} role="status">
      {slow ? "Сервер просыпается после простоя — ещё пара секунд…" : "Загрузка…"}
    </p>
  );
}

export function SkeletonPage({ children, narrow }) {
  return (
    <main className={`page skeleton${narrow ? " narrow" : ""}`} aria-busy="true">
      {children}
      <WakeNote />
    </main>
  );
}

function HeadBones({ art }) {
  return (
    <section className={`page-head${art ? " with-art" : ""}`}>
      <div>
        <Bone w="min(320px, 70%)" h={50} r={12} />
        <Bone w="min(500px, 90%)" h={16} style={{ marginTop: 20 }} />
        <Bone w="min(360px, 65%)" h={16} style={{ marginTop: 10 }} />
      </div>
      {art ? <Bone className="page-head-art bone-art" h={200} r={24} /> : null}
    </section>
  );
}

function FactBones({ count = 4 }) {
  return (
    <div className="t-facts">
      {Array.from({ length: count }, (_, i) => (
        <div key={i}>
          <Bone w={64} h={10} />
          <Bone w={i % 2 ? 72 : 110} h={18} style={{ marginTop: 7 }} />
        </div>
      ))}
    </div>
  );
}

function CardBones({ index }) {
  return (
    <div className="card sk-card" style={{ animationDelay: `${index * 60}ms` }}>
      <div className="card-cover">
        <Bone className="bone-fill" h={null} r={0} />
      </div>
      <div className="card-body">
        <Bone w="62%" h={22} r={8} />
        <Bone w="78%" h={12} />
        <div className="card-foot">
          <Bone w={96} h={16} />
          <Bone w={120} h={12} />
        </div>
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <SkeletonPage>
      <HeadBones />
      <div className="featured sk-featured">
        <div className="featured-body">
          <Bone w={92} h={26} r={999} />
          <Bone w="min(380px, 80%)" h={34} r={10} />
          <FactBones count={3} />
          <Bone w={260} h={58} r={12} />
          <Bone w={130} h={16} />
        </div>
        <Bone className="sk-art" h={null} r={0} />
      </div>
      <section className="section">
        <Bone w={120} h={12} style={{ marginBottom: 18 }} />
        <div className="grid">
          {[0, 1, 2].map((i) => (
            <CardBones key={i} index={i} />
          ))}
        </div>
      </section>
    </SkeletonPage>
  );
}

function MatchBones({ index }) {
  return (
    <div className="match sk-match" style={{ animationDelay: `${index * 60}ms` }}>
      <div className="sk-match-head">
        <Bone w={70} h={10} />
        <Bone w={36} h={10} />
      </div>
      {[0, 1].map((row) => (
        <div key={row} className="sk-match-row">
          <Bone w={26} h={26} r={8} />
          <Bone w={row ? "46%" : "58%"} h={14} />
          <Bone w={18} h={18} r={6} style={{ marginLeft: "auto" }} />
        </div>
      ))}
    </div>
  );
}

export function TournamentSkeleton() {
  return (
    <SkeletonPage>
      <Bone w={120} h={14} style={{ marginBottom: 22 }} />
      <section className="t-hero sk-featured">
        <div className="t-hero-body">
          <Bone w={92} h={26} r={999} />
          <Bone w="min(420px, 85%)" h={42} r={12} />
          <FactBones />
        </div>
        <Bone className="sk-art" h={null} r={0} />
      </section>
      <div className="t-actions">
        <Bone w={190} h={40} r={12} />
        <Bone w={140} h={40} r={12} />
      </div>
      <section className="section">
        <Bone w={90} h={12} style={{ marginBottom: 18 }} />
        <div className="sk-bracket">
          <div className="sk-round">
            <MatchBones index={0} />
            <MatchBones index={1} />
          </div>
          <div className="sk-round">
            <MatchBones index={2} />
          </div>
        </div>
      </section>
    </SkeletonPage>
  );
}

export function TableBones({ rows = 6, cols = 5 }) {
  return (
    <div className="panel sk-table">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="sk-row" style={{ animationDelay: `${r * 40}ms` }}>
          <Bone w={18} h={12} />
          <Bone w={30} h={30} r={9} />
          <Bone w={`${38 - (r % 3) * 7}%`} h={14} />
          {Array.from({ length: cols - 1 }, (_, c) => (
            <Bone
              key={c}
              w={34}
              h={12}
              className={c === 0 ? "sk-num-first" : c >= 2 ? "sk-num-extra" : ""}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function StatsSkeleton() {
  return (
    <SkeletonPage>
      <HeadBones art />
      <div className="sk-tabs">
        {[90, 100, 70, 84].map((w, i) => (
          <Bone key={i} w={w} h={14} />
        ))}
      </div>
      <div className="podium">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`podium-card sk-podium${i === 0 ? " first" : ""}`}>
            <Bone w={44} h={44} r={12} />
            <Bone w="60%" h={20} r={8} style={{ marginTop: 10 }} />
            <Bone w={80} h={34} r={8} style={{ marginTop: 14 }} />
          </div>
        ))}
      </div>
      <TableBones />
    </SkeletonPage>
  );
}

// Список внутри уже отрисованной страницы (участники, статистика кабинета).
export function ListBones({ rows = 5 }) {
  return (
    <div className="sk-list" aria-busy="true">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="sk-row" style={{ animationDelay: `${r * 40}ms` }}>
          <Bone w={36} h={36} r={10} />
          <div className="sk-lines">
            <Bone w={`${44 - (r % 3) * 8}%`} h={14} />
            <Bone w={110} h={10} />
          </div>
          <Bone w={110} h={32} r={10} />
        </div>
      ))}
    </div>
  );
}

export function FormSkeleton() {
  return (
    <SkeletonPage narrow>
      <HeadBones />
      <div className="panel panel-pad sk-form">
        {[0, 1, 2].map((i) => (
          <div key={i}>
            <Bone w={110} h={11} />
            <Bone w="100%" h={44} r={12} style={{ marginTop: 8 }} />
          </div>
        ))}
        <div className="sk-tiles">
          {Array.from({ length: 6 }, (_, i) => (
            <Bone key={i} h={70} r={12} style={{ width: "100%" }} />
          ))}
        </div>
      </div>
    </SkeletonPage>
  );
}

// Небольшой блок внутри модалки или раздела.
export function BlockBones({ rows = 3 }) {
  return (
    <div className="sk-block" aria-busy="true">
      {Array.from({ length: rows }, (_, r) => (
        <Bone key={r} w={`${92 - r * 14}%`} h={14} />
      ))}
    </div>
  );
}
