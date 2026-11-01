import { useEffect, useState } from "react";
import api, { apiErrorMessage } from "../api.js";
import HistoryTimeline from "../components/HistoryTimeline.jsx";
import PageHead, { EmptyState } from "../components/PageHead.jsx";
import PrizeBoard from "../components/PrizeBoard.jsx";
import { Bone, SkeletonPage } from "../components/Skeleton.jsx";

// История и призовые — отдельной страницей: это летопись компании, а не
// таблица показателей, и в «Статистике» ей было тесно.
export default function History() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/stats")
      .then((res) => setData(res.data))
      .catch((err) => setError(apiErrorMessage(err)));
  }, []);

  if (error) {
    return (
      <main className="page">
        <div className="error-box">{error}</div>
      </main>
    );
  }
  if (!data) return <HistorySkeleton />;

  return (
    <main className="page">
      <PageHead
        title="История"
        sub="Кто сколько забрал призовых и как прошёл каждый турнир — от первого до ближайшего."
        art="/img/trophy.webp"
      />

      {!data.tournaments.length ? (
        <EmptyState title="Турниров пока не было" text="История начнётся с первого турнира." />
      ) : (
        <>
          <h2 className="section-title">Призовые</h2>
          <PrizeBoard
            players={data.players}
            tournaments={data.tournaments}
            currency={data.currency}
            prizeTotal={data.prize_total}
          />

          <section className="section">
            <h2 className="section-title">Турниры</h2>
            <HistoryTimeline tournaments={data.tournaments} />
          </section>
        </>
      )}
    </main>
  );
}

function HistorySkeleton() {
  return (
    <SkeletonPage>
      <section className="page-head with-art">
        <div>
          <Bone w="min(260px, 60%)" h={50} r={12} />
          <Bone w="min(480px, 90%)" h={16} style={{ marginTop: 20 }} />
        </div>
        <Bone className="page-head-art" h={200} r={24} style={{ width: "100%" }} />
      </section>
      <div className="pz-top">
        <Bone h={220} r={20} style={{ width: "100%" }} />
        <Bone h={220} r={20} style={{ width: "100%" }} />
      </div>
      <div className="pz-earners" style={{ marginTop: 18 }}>
        {[0, 1, 2, 3].map((i) => (
          <Bone key={i} h={190} r={20} style={{ width: "100%" }} />
        ))}
      </div>
    </SkeletonPage>
  );
}
