"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";

type Tournament = { id: string; name: string; format: string; start_date: string | null };
type Round = { id: string; date: string; courses: { name: string } | null };
type Standing = { name: string; user_id: string; team: string | null; total: number; diff: number; rounds: number };

export default function TournamentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: t } = await supabase.from("tournaments").select("id, name, format, start_date").eq("id", id).single();
      setTournament(t);

      const { data: r } = await supabase
        .from("rounds")
        .select("id, date, courses(name)")
        .eq("tournament_id", id)
        .order("date", { ascending: false });
      setRounds((r ?? []) as unknown as Round[]);

      // Build standings from scores
      if (r && r.length > 0) {
        const roundIds = r.map((x: any) => x.id);
        const { data: players } = await supabase
          .from("round_players")
          .select("user_id, team, round_id, profiles(name)")
          .in("round_id", roundIds);

        const { data: scores } = await supabase
          .from("scores")
          .select("round_id, user_id, strokes, holes(par)")
          .in("round_id", roundIds);

        const map: Record<string, Standing> = {};
        for (const p of players ?? []) {
          if (!map[p.user_id]) {
            map[p.user_id] = { user_id: p.user_id, name: (p as any).profiles?.name ?? "?", team: p.team, total: 0, diff: 0, rounds: 0 };
          }
        }

        const roundScores: Record<string, Record<string, { strokes: number; par: number }[]>> = {};
        for (const s of scores ?? []) {
          if (!roundScores[s.round_id]) roundScores[s.round_id] = {};
          if (!roundScores[s.round_id][s.user_id]) roundScores[s.round_id][s.user_id] = [];
          roundScores[s.round_id][s.user_id].push({ strokes: s.strokes, par: (s as any).holes?.par ?? 4 });
        }

        for (const [, uid_scores] of Object.entries(roundScores)) {
          for (const [uid, holeScores] of Object.entries(uid_scores)) {
            if (!map[uid]) continue;
            const total = holeScores.reduce((a, b) => a + b.strokes, 0);
            const par = holeScores.reduce((a, b) => a + b.par, 0);
            map[uid].total += total;
            map[uid].diff += total - par;
            map[uid].rounds += 1;
          }
        }

        const sorted = Object.values(map).sort((a, b) => a.diff - b.diff);
        setStandings(sorted);
      }

      setLoading(false);
    }
    load();
  }, [id]);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">Laddar...</div>;
  if (!tournament) return <div className="min-h-screen flex items-center justify-center text-gray-400">Hittades inte.</div>;

  const isMatchplay = tournament.format === "matchplay";

  // Ryder Cup: points per round per team
  let redPoints = 0; let bluePoints = 0;
  if (isMatchplay && standings.length > 0) {
    // Simplified: team with lower total diff wins each round
    for (const round of rounds) {
      const inRound = standings.filter((s) => s.rounds > 0);
      const red = inRound.filter((s) => s.team === "red");
      const blue = inRound.filter((s) => s.team === "blue");
      const redDiff = red.reduce((a, b) => a + b.diff, 0);
      const blueDiff = blue.reduce((a, b) => a + b.diff, 0);
      if (redDiff < blueDiff) redPoints += 1;
      else if (blueDiff < redDiff) bluePoints += 1;
      else { redPoints += 0.5; bluePoints += 0.5; }
    }
  }

  return (
    <div className="min-h-screen bg-green-50">
      <header className="bg-green-800 text-white px-4 py-4">
        <button onClick={() => router.back()} className="text-sm opacity-75 mb-1">← Tillbaka</button>
        <h1 className="text-lg font-bold">{tournament.name}</h1>
        {tournament.start_date && (
          <p className="text-sm opacity-75">{new Date(tournament.start_date).toLocaleDateString("sv-SE")}</p>
        )}
      </header>

      <main className="px-4 py-4 max-w-lg mx-auto space-y-6">

        {/* Ryder Cup scoreboard */}
        {isMatchplay && (
          <div className="bg-white rounded-2xl shadow p-4">
            <h2 className="text-xs font-semibold text-gray-500 uppercase mb-3">Lagställning</h2>
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-red-50 rounded-xl p-3 text-center">
                <p className="text-xs font-bold text-red-600 mb-1">RÖTT</p>
                <p className="text-4xl font-bold text-red-700">{redPoints}</p>
              </div>
              <p className="text-gray-400 font-bold text-xl">vs</p>
              <div className="flex-1 bg-blue-50 rounded-xl p-3 text-center">
                <p className="text-xs font-bold text-blue-600 mb-1">BLÅTT</p>
                <p className="text-4xl font-bold text-blue-700">{bluePoints}</p>
              </div>
            </div>
          </div>
        )}

        {/* Standings */}
        {standings.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-gray-500 uppercase mb-2">Resultat</h2>
            <ul className="space-y-2">
              {standings.map((s, i) => (
                <li key={s.user_id} className="bg-white rounded-2xl shadow px-4 py-3 flex items-center gap-3">
                  <span className="text-lg font-bold text-gray-400 w-6 text-center">{i + 1}</span>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-800">{s.name}</p>
                    {isMatchplay && s.team && (
                      <span className={`text-xs font-bold ${s.team === "red" ? "text-red-600" : "text-blue-600"}`}>
                        {s.team === "red" ? "RÖTT" : "BLÅTT"}
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <p className={`font-bold ${s.diff > 0 ? "text-red-600" : s.diff < 0 ? "text-green-600" : "text-gray-500"}`}>
                      {s.diff > 0 ? `+${s.diff}` : s.diff === 0 ? "Par" : s.diff}
                    </p>
                    <p className="text-xs text-gray-400">{s.rounds} runda{s.rounds !== 1 ? "r" : ""}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Rounds */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-semibold text-gray-500 uppercase">Rundor</h2>
            <Link
              href={`/rounds/new?tournamentId=${id}`}
              className="text-xs text-green-700 font-semibold"
            >
              + Lägg till runda
            </Link>
          </div>
          {rounds.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">Inga rundor spelade än.</p>
          ) : (
            <ul className="space-y-2">
              {rounds.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/rounds/${r.id}`}
                    className="flex items-center justify-between bg-white rounded-2xl shadow px-4 py-3"
                  >
                    <div>
                      <p className="font-semibold text-sm text-gray-800">{r.courses?.name ?? "Okänd bana"}</p>
                      <p className="text-xs text-gray-400">{new Date(r.date).toLocaleDateString("sv-SE")}</p>
                    </div>
                    <span className="text-gray-400 text-sm">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
