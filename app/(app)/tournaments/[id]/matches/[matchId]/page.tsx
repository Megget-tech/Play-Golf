"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

const TOTAL_HOLES = 18;

type HoleResult = "red" | "blue" | "halved";

function computeStatus(results: HoleResult[]) {
  let redUp = 0;
  for (const r of results) {
    if (r === "red") redUp++;
    else if (r === "blue") redUp--;
  }
  const holesPlayed = results.length;
  const holesLeft = TOTAL_HOLES - holesPlayed;

  // Check if match is decided before all holes
  if (Math.abs(redUp) > holesLeft) {
    const winner = redUp > 0 ? "red" : "blue";
    const up = Math.abs(redUp);
    return { decided: true, winner, label: `${up}&${holesLeft}`, redUp };
  }
  // All 18 holes done
  if (holesLeft === 0) {
    if (redUp === 0) return { decided: true, winner: "halved" as const, label: "Halved (Delad)", redUp };
    const winner = redUp > 0 ? "red" : "blue";
    return { decided: true, winner, label: "1UP", redUp };
  }
  // Match ongoing
  if (redUp === 0) return { decided: false, winner: null, label: "Alla Kvitt", redUp };
  const leader = redUp > 0 ? "Rött" : "Blått";
  return { decided: false, winner: null, label: `${leader} ${Math.abs(redUp)}UP`, redUp };
}

export default function MatchPage() {
  const { id: tournamentId, matchId } = useParams<{ id: string; matchId: string }>();
  const router = useRouter();
  const supabase = createClient();

  const [redNames, setRedNames] = useState<string[]>([]);
  const [blueNames, setBlueNames] = useState<string[]>([]);
  const [sessionType, setSessionType] = useState("singles");
  const [results, setResults] = useState<HoleResult[]>([]);
  const [existingResult, setExistingResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      // Load match + session + player names
      const { data: match } = await supabase
        .from("ryder_cup_matches")
        .select("red_player1, red_player2, blue_player1, blue_player2, result, session_id")
        .eq("id", matchId).single();
      if (!match) { setLoading(false); return; }

      setExistingResult(match.result ?? null);

      const { data: sess } = await supabase
        .from("ryder_cup_sessions").select("session_type").eq("id", match.session_id).single();
      if (sess) setSessionType(sess.session_type);

      // Collect player IDs and fetch names
      const pids = [match.red_player1, match.red_player2, match.blue_player1, match.blue_player2].filter(Boolean) as string[];
      const { data: profiles } = await supabase.from("profiles").select("id, name").in("id", pids);
      const nameMap: Record<string, string> = {};
      for (const p of profiles ?? []) nameMap[p.id] = p.name;

      setRedNames([match.red_player1, match.red_player2].filter(Boolean).map((id) => nameMap[id!] ?? "?"));
      setBlueNames([match.blue_player1, match.blue_player2].filter(Boolean).map((id) => nameMap[id!] ?? "?"));

      // Load existing hole results
      const { data: holes } = await supabase
        .from("ryder_cup_hole_results")
        .select("hole_number, winner")
        .eq("match_id", matchId)
        .order("hole_number");

      const r: HoleResult[] = Array(TOTAL_HOLES).fill(null);
      for (const h of holes ?? []) r[h.hole_number - 1] = h.winner as HoleResult;
      // Trim trailing nulls
      let last = -1;
      for (let i = 0; i < r.length; i++) if (r[i]) last = i;
      setResults(r.slice(0, last + 1) as HoleResult[]);

      setLoading(false);
    }
    load();
  }, [matchId]);

  const status = computeStatus(results);
  const currentHole = results.length + 1; // next hole to score
  const matchOver = status.decided || !!existingResult;

  async function recordHole(winner: HoleResult) {
    if (matchOver) return;
    setSaving(true);
    const holeNumber = results.length + 1;
    const newResults = [...results, winner];
    setResults(newResults);

    await supabase.from("ryder_cup_hole_results").upsert(
      { match_id: matchId, hole_number: holeNumber, winner },
      { onConflict: "match_id,hole_number" }
    );

    const newStatus = computeStatus(newResults);
    if (newStatus.decided && !existingResult) {
      await supabase.from("ryder_cup_matches").update({ result: newStatus.winner }).eq("id", matchId);
      setExistingResult(newStatus.winner!);
    }
    setSaving(false);
  }

  async function undoLast() {
    if (results.length === 0 || existingResult) return;
    const holeNumber = results.length;
    setResults((prev) => prev.slice(0, -1));
    await supabase.from("ryder_cup_hole_results").delete().eq("match_id", matchId).eq("hole_number", holeNumber);
  }

  async function forceResult(winner: "red" | "blue" | "halved") {
    setSaving(true);
    await supabase.from("ryder_cup_matches").update({ result: winner }).eq("id", matchId);
    setExistingResult(winner);
    setSaving(false);
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">Laddar...</div>;

  const statusColor = status.redUp > 0 ? "text-red-600" : status.redUp < 0 ? "text-blue-600" : "text-gray-600";

  return (
    <div className="min-h-screen bg-green-100 flex flex-col">
      <header className="bg-green-800 text-white px-4 py-4">
        <button onClick={() => router.back()} className="text-sm opacity-75 mb-1">← Tillbaka</button>
        <div className="flex items-center gap-3 mt-1">
          <div className="flex-1 text-center">
            <p className="text-xs text-red-300 font-bold">RÖTT</p>
            <p className="font-bold text-sm">{redNames.join(" & ")}</p>
          </div>
          <p className="text-white/50 font-bold">vs</p>
          <div className="flex-1 text-center">
            <p className="text-xs text-blue-300 font-bold">BLÅTT</p>
            <p className="font-bold text-sm">{blueNames.join(" & ")}</p>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-between px-4 py-8 max-w-sm mx-auto w-full">

        {/* Match status */}
        <div className="text-center space-y-1 w-full">
          <p className={`text-4xl font-bold ${matchOver ? (existingResult === "red" ? "text-red-600" : existingResult === "blue" ? "text-blue-600" : "text-gray-600") : statusColor}`}>
            {matchOver && existingResult
              ? existingResult === "halved" ? "Delad match" : existingResult === "red" ? "Rött vinner" : "Blått vinner"
              : status.label}
          </p>
          {!matchOver && (
            <p className="text-sm text-gray-400">{TOTAL_HOLES - results.length} hål kvar</p>
          )}
        </div>

        {/* Hole timeline */}
        <div className="flex gap-1 flex-wrap justify-center my-6 w-full">
          {Array.from({ length: TOTAL_HOLES }).map((_, i) => {
            const r = results[i];
            return (
              <div key={i} className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                !r ? "bg-gray-200 text-gray-400" :
                r === "red" ? "bg-red-500 text-white" :
                r === "blue" ? "bg-blue-500 text-white" :
                "bg-gray-400 text-white"
              }`}>
                {i + 1}
              </div>
            );
          })}
        </div>

        {/* Scoring */}
        {!matchOver ? (
          <div className="w-full space-y-4">
            <p className="text-center text-sm font-semibold text-gray-500">Hål {currentHole} — vem vann?</p>
            <div className="grid grid-cols-3 gap-3">
              <button onClick={() => recordHole("red")} disabled={saving}
                className="bg-red-500 text-white rounded-2xl py-5 font-bold text-sm shadow active:scale-95 transition-transform">
                RÖTT<br />vann
              </button>
              <button onClick={() => recordHole("halved")} disabled={saving}
                className="bg-gray-200 text-gray-700 rounded-2xl py-5 font-bold text-sm shadow active:scale-95 transition-transform">
                KVITT
              </button>
              <button onClick={() => recordHole("blue")} disabled={saving}
                className="bg-blue-500 text-white rounded-2xl py-5 font-bold text-sm shadow active:scale-95 transition-transform">
                BLÅTT<br />vann
              </button>
            </div>
            {results.length > 0 && (
              <button onClick={undoLast} className="w-full text-sm text-gray-400 py-2">↩ Ångra hål {results.length}</button>
            )}
          </div>
        ) : (
          <div className="w-full space-y-4">
            <div className={`rounded-2xl p-4 text-center font-bold text-lg ${
              existingResult === "red" ? "bg-red-100 text-red-700" :
              existingResult === "blue" ? "bg-blue-100 text-blue-700" :
              "bg-gray-100 text-gray-600"
            }`}>
              {existingResult === "red" ? `Rött vinner – ${status.label}` :
               existingResult === "blue" ? `Blått vinner – ${status.label}` :
               "Delad match – ½ poäng vardera"}
            </div>
            {/* Manual override if needed */}
            {!status.decided && (
              <div className="space-y-2">
                <p className="text-xs text-center text-gray-400">Rätta resultatet:</p>
                <div className="grid grid-cols-3 gap-2">
                  {(["red", "halved", "blue"] as const).map((w) => (
                    <button key={w} onClick={() => forceResult(w)} disabled={saving}
                      className={`py-2 rounded-xl text-xs font-bold ${w === "red" ? "bg-red-100 text-red-700" : w === "blue" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"}`}>
                      {w === "red" ? "Rött" : w === "blue" ? "Blått" : "Kvitt"}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <button onClick={() => router.push(`/tournaments/${tournamentId}`)}
              className="w-full bg-green-700 text-white rounded-2xl py-3 font-semibold">
              Tillbaka till turneringen
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
