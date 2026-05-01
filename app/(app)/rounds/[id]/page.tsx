"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { generateHoles } from "@/lib/generate-holes";

type Hole = { id: string; hole_number: number; par: number; stroke_index: number | null; distance_m: number | null };
type Player = { user_id: string; name: string; team: string | null; tee_id: string | null; tee_name: string | null; tee_color: string | null };
type ScoreMap = Record<string, Record<string, number>>; // holeId -> userId -> strokes
type TeeDistances = Record<string, Record<string, number>>; // tee_id -> hole_id -> distance_m

function scoreBadge(strokes: number, par: number) {
  const diff = strokes - par;
  if (strokes === 1) return { label: "HiO", cls: "bg-yellow-400 text-black" };
  if (diff <= -2) return { label: "Eagle", cls: "bg-green-700 text-white" };
  if (diff === -1) return { label: "Birdie", cls: "bg-green-500 text-white" };
  if (diff === 0) return { label: "Par", cls: "bg-gray-200 text-gray-700" };
  if (diff === 1) return { label: "Bogey", cls: "bg-yellow-200 text-yellow-800" };
  if (diff === 2) return { label: "Dubbel", cls: "bg-red-200 text-red-800" };
  return { label: `+${diff}`, cls: "bg-red-500 text-white" };
}

export default function ScorecardPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();

  const [holes, setHoles] = useState<Hole[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [scores, setScores] = useState<ScoreMap>({});
  const [currentHole, setCurrentHole] = useState(0);
  const [courseName, setCourseName] = useState("");
  const [format, setFormat] = useState("stroke");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [teeDistances, setTeeDistances] = useState<TeeDistances>({});
  const [showMenu, setShowMenu] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: round } = await supabase
        .from("rounds")
        .select("course_id, format, starting_hole, courses(name)")
        .eq("id", id)
        .single();
      if (!round) return;
      setFormat(round.format);
      setCourseName((round as any).courses?.name ?? "");

      let { data: holesData } = await supabase
        .from("holes")
        .select("id, hole_number, par, stroke_index, distance_m")
        .eq("course_id", round.course_id)
        .order("hole_number");

      if (!holesData || holesData.length === 0) {
        const { data: courseData } = await supabase
          .from("courses")
          .select("holes_count, par_total")
          .eq("id", round.course_id)
          .single();
        if (courseData) {
          const generated = generateHoles(round.course_id, courseData.holes_count, courseData.par_total);
          const { data: inserted } = await supabase
            .from("holes").insert(generated)
            .select("id, hole_number, par, stroke_index, distance_m");
          holesData = inserted;
        }
      }

      const { data: playersData } = await supabase
        .from("round_players")
        .select("user_id, team, tee_id, profiles(name), course_tees(name, color)")
        .eq("round_id", id);

      const { data: scoresData } = await supabase
        .from("scores").select("hole_id, user_id, strokes").eq("round_id", id);

      const scoreMap: ScoreMap = {};
      for (const s of scoresData ?? []) {
        if (!scoreMap[s.hole_id]) scoreMap[s.hole_id] = {};
        scoreMap[s.hole_id][s.user_id] = s.strokes;
      }

      const sh = round.starting_hole ?? 1;
      const sorted = [...(holesData ?? [])].sort((a, b) => {
        const ai = ((a.hole_number - sh + 18) % 18);
        const bi = ((b.hole_number - sh + 18) % 18);
        return ai - bi;
      });

      setHoles(sorted);
      const mappedPlayers = (playersData ?? []).map((p: any) => ({
        user_id: p.user_id,
        name: p.profiles?.name ?? "Okänd",
        team: p.team,
        tee_id: p.tee_id ?? null,
        tee_name: p.course_tees?.name ?? null,
        tee_color: p.course_tees?.color ?? null,
      }));
      setPlayers(mappedPlayers);

      const teeIds = [...new Set(mappedPlayers.map((p: any) => p.tee_id).filter(Boolean))];
      if (teeIds.length > 0) {
        const { data: distData } = await supabase
          .from("hole_tee_distances").select("tee_id, hole_id, distance_m").in("tee_id", teeIds);
        const distMap: TeeDistances = {};
        for (const d of distData ?? []) {
          if (!distMap[d.tee_id]) distMap[d.tee_id] = {};
          distMap[d.tee_id][d.hole_id] = d.distance_m;
        }
        setTeeDistances(distMap);
      }
      setScores(scoreMap);
      setLoading(false);
    }
    load();
  }, [id]);

  const hole = holes[currentHole];

  async function saveScore(playerId: string, strokes: number) {
    if (!hole) return;
    setSaving(true);
    setScores((prev) => ({ ...prev, [hole.id]: { ...(prev[hole.id] ?? {}), [playerId]: strokes } }));
    await supabase.from("scores").upsert(
      { round_id: id, user_id: playerId, hole_id: hole.id, strokes },
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

  async function abortRound() {
    if (!confirm("Avbryta rundan? All data raderas.")) return;
    await fetch(`/api/rounds/${id}`, { method: "DELETE" });
    router.push("/dashboard");
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-500">Laddar...</div>;

  // ─── Summary view ─────────────────────────────────────────────────────────
  if (currentHole >= holes.length) {
    return (
      <div className="min-h-screen bg-green-50 pb-8">
        <header className="bg-green-800 text-white px-4 py-4">
          <h1 className="text-lg font-bold">Runda klar!</h1>
          <p className="text-sm opacity-75">{courseName}</p>
        </header>

        <main className="px-2 py-4 max-w-2xl mx-auto space-y-6">
          {/* Totals */}
          <section className="px-2">
            <h2 className="text-xs font-semibold text-gray-500 uppercase mb-2">Slutresultat</h2>
            <div className="space-y-2">
              {[...players].sort((a, b) => {
                const da = totalScore(a.user_id).diff;
                const db = totalScore(b.user_id).diff;
                return da - db;
              }).map((p, i) => {
                const { total, diff } = totalScore(p.user_id);
                return (
                  <div key={p.user_id} className="bg-white rounded-2xl shadow px-4 py-3 flex items-center gap-3">
                    <span className="text-sm font-bold text-gray-400 w-5">{i + 1}</span>
                    <div className="flex-1">
                      <p className="font-semibold text-gray-800 text-sm">{p.name}</p>
                      {p.tee_name && <p className="text-xs text-gray-400">{p.tee_name}</p>}
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-gray-900">{total || "—"}</p>
                      <p className={`text-sm font-medium ${diff > 0 ? "text-red-600" : diff < 0 ? "text-green-600" : "text-gray-500"}`}>
                        {total > 0 ? (diff > 0 ? `+${diff}` : diff === 0 ? "Par" : diff) : "—"}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Per-hole scorecard table */}
          <section>
            <h2 className="text-xs font-semibold text-gray-500 uppercase mb-2 px-2">Håll för håll</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs bg-white rounded-2xl shadow overflow-hidden">
                <thead>
                  <tr className="bg-green-800 text-white">
                    <th className="px-3 py-2 text-left sticky left-0 bg-green-800">Hål</th>
                    <th className="px-2 py-2">Par</th>
                    {players.map((p) => (
                      <th key={p.user_id} className="px-2 py-2 min-w-14">{p.name.split(" ")[0]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {holes.map((h, i) => (
                    <tr key={h.id} className={i % 2 === 0 ? "bg-white" : "bg-green-50"}>
                      <td className="px-3 py-2 font-semibold text-gray-700 sticky left-0 bg-inherit">{h.hole_number}</td>
                      <td className="px-2 py-2 text-center text-gray-500">{h.par}</td>
                      {players.map((p) => {
                        const s = scores[h.id]?.[p.user_id];
                        if (s === undefined) return <td key={p.user_id} className="px-2 py-2 text-center text-gray-300">—</td>;
                        const { cls } = scoreBadge(s, h.par);
                        return (
                          <td key={p.user_id} className="px-2 py-2 text-center">
                            <span className={`inline-block w-7 h-7 rounded-full flex items-center justify-center font-bold ${cls}`}>
                              {s}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {/* Totals row */}
                  <tr className="bg-green-900 text-white font-bold">
                    <td className="px-3 py-2 sticky left-0 bg-green-900">Tot</td>
                    <td className="px-2 py-2 text-center">{holes.reduce((s, h) => s + h.par, 0)}</td>
                    {players.map((p) => {
                      const { total, diff } = totalScore(p.user_id);
                      return (
                        <td key={p.user_id} className="px-2 py-2 text-center">
                          <div>{total || "—"}</div>
                          {total > 0 && (
                            <div className={`text-xs font-normal ${diff > 0 ? "text-red-300" : diff < 0 ? "text-green-300" : "text-gray-300"}`}>
                              {diff > 0 ? `+${diff}` : diff === 0 ? "Par" : diff}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <div className="px-2 space-y-2">
            <button
              onClick={() => setCurrentHole(holes.length - 1)}
              className="w-full bg-white text-green-700 border border-green-300 rounded-2xl py-3 font-semibold text-sm"
            >
              ← Tillbaka till sista hålet
            </button>
            <button
              onClick={() => router.push("/dashboard")}
              className="w-full bg-green-700 text-white rounded-2xl py-3 font-semibold"
            >
              Hem
            </button>
          </div>
        </main>
      </div>
    );
  }

  // ─── Scorecard per hole ────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-green-50">
      <header className="bg-green-800 text-white px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-xs opacity-75">{courseName}</p>
          <h1 className="text-lg font-bold">Hål {hole.hole_number}</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs opacity-75">Par {hole.par} · SI {hole.stroke_index ?? "—"}</p>
            <p className="text-xs opacity-75">{currentHole + 1}/{holes.length}</p>
          </div>
          <div className="relative">
            <button
              onClick={() => setShowMenu((v) => !v)}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-white/20 text-base font-bold"
            >
              ···
            </button>
            {showMenu && (
              <div className="absolute right-0 top-10 bg-white rounded-2xl shadow-xl z-50 overflow-hidden min-w-44">
                <button
                  onClick={() => { setShowMenu(false); setCurrentHole(holes.length); }}
                  className="w-full text-left px-4 py-3 text-sm font-semibold text-green-700 hover:bg-green-50"
                >
                  Avsluta runda
                </button>
                <button
                  onClick={() => { setShowMenu(false); abortRound(); }}
                  className="w-full text-left px-4 py-3 text-sm font-semibold text-red-600 hover:bg-red-50 border-t border-gray-100"
                >
                  Avbryt &amp; radera
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

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
          const badge = val > 0 ? scoreBadge(val, hole.par) : null;
          return (
            <div key={p.user_id} className="bg-white rounded-2xl shadow px-4 py-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-semibold text-gray-800">{p.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {p.tee_name && (
                      <span className="flex items-center gap-1 text-xs text-gray-500">
                        <span className={`w-2.5 h-2.5 rounded-full inline-block ${
                          p.tee_color === "red" ? "bg-red-500" :
                          p.tee_color === "yellow" ? "bg-yellow-400" :
                          p.tee_color === "blue" ? "bg-blue-500" :
                          p.tee_color === "white" ? "bg-white border border-gray-300" : "bg-gray-400"
                        }`} />
                        {p.tee_name}
                        {p.tee_id && teeDistances[p.tee_id]?.[hole.id] && (
                          <span>· {teeDistances[p.tee_id][hole.id]} m</span>
                        )}
                      </span>
                    )}
                    {format === "matchplay" && p.team && (
                      <span className={`text-xs font-bold ${p.team === "red" ? "text-red-600" : "text-blue-600"}`}>
                        {p.team === "red" ? "RÖTT" : "BLÅTT"}
                      </span>
                    )}
                    {format === "scramble" && p.team && (
                      <span className={`text-xs font-bold ${p.team === "red" ? "text-red-600" : "text-blue-600"}`}>
                        Lag {p.team === "red" ? "A" : "B"}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {badge && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${badge.cls}`}>{badge.label}</span>
                  )}
                  <p className={`text-sm font-medium ${diff > 0 ? "text-red-500" : diff < 0 ? "text-green-600" : "text-gray-400"}`}>
                    {total > 0 ? (diff > 0 ? `+${diff}` : diff === 0 ? "Par" : diff) : "—"}
                  </p>
                </div>
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
