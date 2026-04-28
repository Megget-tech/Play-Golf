"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { generateHoles } from "@/lib/generate-holes";

type Hole = { id: string; hole_number: number; par: number; stroke_index: number | null; distance_m: number | null };
type Player = { user_id: string; name: string; team: string | null };
type ScoreMap = Record<string, Record<string, number>>; // holeId -> userId -> strokes

export default function ScorecardPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();

  const [holes, setHoles] = useState<Hole[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [scores, setScores] = useState<ScoreMap>({});
  const [currentHole, setCurrentHole] = useState(0);
  const [courseId, setCourseId] = useState<string | null>(null);
  const [courseName, setCourseName] = useState("");
  const [format, setFormat] = useState("stroke");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id ?? null);

      const { data: round } = await supabase
        .from("rounds")
        .select("course_id, format, courses(name)")
        .eq("id", id)
        .single();
      if (!round) return;
      setCourseId(round.course_id);
      setFormat(round.format);
      setCourseName((round as any).courses?.name ?? "");

      let { data: holesData } = await supabase
        .from("holes")
        .select("id, hole_number, par, stroke_index, distance_m")
        .eq("course_id", round.course_id)
        .order("hole_number");

      // Auto-generate holes if the course has none
      if (!holesData || holesData.length === 0) {
        const { data: courseData } = await supabase
          .from("courses")
          .select("holes_count, par_total")
          .eq("id", round.course_id)
          .single();

        if (courseData) {
          const generated = generateHoles(
            round.course_id,
            courseData.holes_count,
            courseData.par_total
          );
          const { data: inserted } = await supabase
            .from("holes")
            .insert(generated)
            .select("id, hole_number, par, stroke_index, distance_m");
          holesData = inserted;
        }
      }

      const { data: playersData } = await supabase
        .from("round_players")
        .select("user_id, team, profiles(name)")
        .eq("round_id", id);

      const { data: scoresData } = await supabase
        .from("scores")
        .select("hole_id, user_id, strokes")
        .eq("round_id", id);

      const scoreMap: ScoreMap = {};
      for (const s of scoresData ?? []) {
        if (!scoreMap[s.hole_id]) scoreMap[s.hole_id] = {};
        scoreMap[s.hole_id][s.user_id] = s.strokes;
      }

      setHoles(holesData ?? []);
      setPlayers((playersData ?? []).map((p: any) => ({ user_id: p.user_id, name: p.profiles?.name ?? "Okänd", team: p.team })));
      setScores(scoreMap);
      setLoading(false);
    }
    load();
  }, [id]);

  const hole = holes[currentHole];

  async function saveScore(userId: string, strokes: number) {
    if (!hole) return;
    setSaving(true);
    const newScores = { ...scores, [hole.id]: { ...(scores[hole.id] ?? {}), [userId]: strokes } };
    setScores(newScores);
    await supabase.from("scores").upsert(
      { round_id: id, user_id: userId, hole_id: hole.id, strokes },
      { onConflict: "round_id,user_id,hole_id" }
    );
    setSaving(false);
  }

  function totalScore(uid: string) {
    let total = 0; let par = 0;
    for (const h of holes) {
      const s = scores[h.id]?.[uid];
      if (s !== undefined) { total += s; par += h.par; }
    }
    return { total, diff: total - par };
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-500">Laddar...</div>;


  if (currentHole >= holes.length) {
    // Summary view
    return (
      <div className="min-h-screen bg-green-50">
        <header className="bg-green-800 text-white px-4 py-4">
          <h1 className="text-lg font-bold">Runda klar!</h1>
          <p className="text-sm opacity-75">{courseName}</p>
        </header>
        <main className="px-4 py-6 max-w-lg mx-auto space-y-3">
          {players.map((p) => {
            const { total, diff } = totalScore(p.user_id);
            return (
              <div key={p.user_id} className="bg-white rounded-2xl shadow px-4 py-3 flex items-center justify-between">
                <span className="font-semibold text-gray-800">{p.name}</span>
                <div className="text-right">
                  <p className="text-xl font-bold text-gray-900">{total}</p>
                  <p className={`text-sm font-medium ${diff > 0 ? "text-red-600" : diff < 0 ? "text-green-600" : "text-gray-500"}`}>
                    {diff > 0 ? `+${diff}` : diff === 0 ? "Par" : diff}
                  </p>
                </div>
              </div>
            );
          })}
          <button
            onClick={() => router.push("/dashboard")}
            className="w-full mt-4 bg-green-700 text-white rounded-2xl py-3 font-semibold"
          >
            Tillbaka till hem
          </button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-green-50">
      <header className="bg-green-800 text-white px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-xs opacity-75">{courseName}</p>
          <h1 className="text-lg font-bold">Hål {hole.hole_number}</h1>
        </div>
        <div className="text-right">
          <p className="text-xs opacity-75">Par {hole.par}</p>
          {hole.distance_m && <p className="text-xs opacity-75">{hole.distance_m} m</p>}
          <p className="text-xs opacity-75">{currentHole + 1}/{holes.length}</p>
        </div>
      </header>

      {/* Hole progress bar */}
      <div className="h-1 bg-green-900">
        <div
          className="h-1 bg-white transition-all"
          style={{ width: `${((currentHole + 1) / holes.length) * 100}%` }}
        />
      </div>

      <main className="px-4 py-6 max-w-lg mx-auto space-y-4">
        {players.map((p) => {
          const val = scores[hole.id]?.[p.user_id] ?? 0;
          const { total, diff } = totalScore(p.user_id);
          return (
            <div key={p.user_id} className="bg-white rounded-2xl shadow px-4 py-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-semibold text-gray-800">{p.name}</p>
                  {format === "matchplay" && p.team && (
                    <span className={`text-xs font-bold ${p.team === "red" ? "text-red-600" : "text-blue-600"}`}>
                      {p.team === "red" ? "RÖTT" : "BLÅTT"}
                    </span>
                  )}
                </div>
                <p className={`text-sm font-medium ${diff > 0 ? "text-red-500" : diff < 0 ? "text-green-600" : "text-gray-400"}`}>
                  {total > 0 ? (diff > 0 ? `+${diff}` : diff === 0 ? "Par" : diff) : "-"}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => saveScore(p.user_id, Math.max(1, val - 1))}
                  className="w-12 h-12 rounded-full bg-gray-100 text-2xl font-bold text-gray-700 flex items-center justify-center"
                >
                  −
                </button>
                <div className="flex-1 text-center">
                  <span className="text-4xl font-bold text-gray-900">{val || "—"}</span>
                </div>
                <button
                  onClick={() => saveScore(p.user_id, val + 1)}
                  className="w-12 h-12 rounded-full bg-green-700 text-2xl font-bold text-white flex items-center justify-center"
                >
                  +
                </button>
              </div>
            </div>
          );
        })}

        {saving && <p className="text-xs text-center text-gray-400">Sparar...</p>}

        <div className="flex gap-3 pt-2">
          <button
            onClick={() => setCurrentHole((h) => Math.max(0, h - 1))}
            disabled={currentHole === 0}
            className="flex-1 bg-white rounded-2xl py-3 text-sm font-medium text-gray-700 shadow disabled:opacity-30"
          >
            ← Föregående
          </button>
          <button
            onClick={() => setCurrentHole((h) => h + 1)}
            className="flex-1 bg-green-700 text-white rounded-2xl py-3 text-sm font-semibold shadow"
          >
            {currentHole === holes.length - 1 ? "Avsluta runda →" : "Nästa hål →"}
          </button>
        </div>
      </main>
    </div>
  );
}
