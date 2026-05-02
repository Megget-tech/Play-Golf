"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { generateHoles } from "@/lib/generate-holes";

type Hole = { id: string; hole_number: number; par: number; stroke_index: number | null; distance_m: number | null };
type Player = { user_id: string; name: string; handicap_index: number | null; team: string | null; tee_id: string | null; tee_name: string | null; tee_color: string | null };
type ScoreMap = Record<string, Record<string, number>>;
type TeeDistances = Record<string, Record<string, number>>;

function courseHcp(handicap_index: number | null): number {
  return Math.round(handicap_index ?? 0);
}

function strokesOnHole(hcp: number, strokeIndex: number | null): number {
  if (!strokeIndex) return 0;
  return Math.floor(hcp / 18) + (strokeIndex <= hcp % 18 ? 1 : 0);
}

function stablefordPoints(strokes: number, par: number, extraStrokes: number): number {
  if (!strokes) return 0;
  return Math.max(0, par + extraStrokes - strokes + 2);
}

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

function ScoreSymbol({ strokes, par }: { strokes: number; par: number }) {
  const diff = strokes - par;
  if (strokes === 1) {
    return (
      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full border-2 border-yellow-500">
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full border-2 border-yellow-500 text-yellow-600 font-bold text-xs">{strokes}</span>
      </span>
    );
  }
  if (diff <= -2) {
    return (
      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full border-2 border-green-600">
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full border-2 border-green-600 text-green-700 font-bold text-xs">{strokes}</span>
      </span>
    );
  }
  if (diff === -1) {
    return <span className="inline-flex items-center justify-center w-7 h-7 rounded-full border-2 border-green-500 text-green-700 font-bold text-xs">{strokes}</span>;
  }
  if (diff === 0) {
    return <span className="font-bold text-xs text-gray-600">{strokes}</span>;
  }
  if (diff === 1) {
    return <span className="inline-flex items-center justify-center w-7 h-7 border-2 border-red-500 text-red-700 font-bold text-xs">{strokes}</span>;
  }
  return (
    <span className="inline-flex items-center justify-center w-8 h-8 border-2 border-red-600">
      <span className="inline-flex items-center justify-center w-5 h-5 border-2 border-red-600 text-red-700 font-bold text-xs">{strokes}</span>
    </span>
  );
}

function calcScrambleHcp(teamPlayers: Player[]): string {
  const hcps = teamPlayers
    .map((p) => p.handicap_index ?? 0)
    .sort((a, b) => a - b);
  if (hcps.length === 2) return (hcps[0] * 0.35 + hcps[1] * 0.15).toFixed(1);
  if (hcps.length === 4) return (hcps[0] * 0.20 + hcps[1] * 0.15 + hcps[2] * 0.10 + hcps[3] * 0.05).toFixed(1);
  if (hcps.length === 3) return (hcps[0] * 0.25 + hcps[1] * 0.20 + hcps[2] * 0.10).toFixed(1);
  return "—";
}

// ── Poångbogey ───────────────────────────────────────────────────────────────
function matchVsParHole(strokes: number, par: number, extra: number): 1 | 0 | -1 {
  const net = strokes - extra;
  return net < par ? 1 : net > par ? -1 : 0;
}

// ── Skins ─────────────────────────────────────────────────────────────────────
function computeSkins(
  holes: Hole[], scores: ScoreMap, players: { user_id: string }[]
): { holeId: string; winner: string | null; skinValue: number }[] {
  let carry = 0;
  return holes.map((h) => {
    const value = 1 + carry;
    const ss = players
      .map((p) => ({ uid: p.user_id, s: scores[h.id]?.[p.user_id] }))
      .filter((x) => x.s !== undefined) as { uid: string; s: number }[];
    if (ss.length < 2) { carry++; return { holeId: h.id, winner: null, skinValue: value }; }
    const min = Math.min(...ss.map((x) => x.s));
    const winners = ss.filter((x) => x.s === min);
    if (winners.length === 1) { carry = 0; return { holeId: h.id, winner: winners[0].uid, skinValue: value }; }
    carry++;
    return { holeId: h.id, winner: null, skinValue: value };
  });
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
  const [wolfDecisions, setWolfDecisions] = useState<Record<string, { partnerUserId: string | null }>>({});

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`wolf_${id}`);
      if (saved) setWolfDecisions(JSON.parse(saved));
    } catch {}
  }, [id]);

  useEffect(() => {
    if (format !== "wolf" || Object.keys(wolfDecisions).length === 0) return;
    localStorage.setItem(`wolf_${id}`, JSON.stringify(wolfDecisions));
  }, [wolfDecisions, format, id]);

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
          .from("courses").select("holes_count, par_total").eq("id", round.course_id).single();
        if (courseData) {
          const generated = generateHoles(round.course_id, courseData.holes_count, courseData.par_total);
          const { data: inserted } = await supabase.from("holes").insert(generated)
            .select("id, hole_number, par, stroke_index, distance_m");
          holesData = inserted;
        }
      }

      const { data: playersData } = await supabase
        .from("round_players")
        .select("user_id, team, tee_id, profiles(name, handicap_index), course_tees(name, color)")
        .eq("round_id", id);

      const { data: scoresData } = await supabase
        .from("scores").select("hole_id, user_id, strokes").eq("round_id", id);

      const scoreMap: ScoreMap = {};
      for (const s of scoresData ?? []) {
        if (!scoreMap[s.hole_id]) scoreMap[s.hole_id] = {};
        scoreMap[s.hole_id][s.user_id] = s.strokes;
      }

      const sh = round.starting_hole ?? 1;
      const sorted = [...(holesData ?? [])].sort((a, b) =>
        ((a.hole_number - sh + 18) % 18) - ((b.hole_number - sh + 18) % 18)
      );
      setHoles(sorted);

      const mappedPlayers = (playersData ?? []).map((p: any) => ({
        user_id: p.user_id,
        name: p.profiles?.name ?? "Okänd",
        handicap_index: p.profiles?.handicap_index ?? null,
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

  // ── Stroke play scoring ───────────────────────────────────────────────────
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

  // ── Scramble team scoring ─────────────────────────────────────────────────
  function getTeamScore(teamPlayers: Player[], holeId: string): number {
    for (const p of teamPlayers) {
      const s = scores[holeId]?.[p.user_id];
      if (s !== undefined) return s;
    }
    return 0;
  }

  async function saveTeamScore(teamPlayers: Player[], strokes: number) {
    if (!hole) return;
    setSaving(true);
    setScores((prev) => {
      const holeScores = { ...(prev[hole.id] ?? {}) };
      for (const p of teamPlayers) holeScores[p.user_id] = strokes;
      return { ...prev, [hole.id]: holeScores };
    });
    await Promise.all(teamPlayers.map((p) =>
      supabase.from("scores").upsert(
        { round_id: id, user_id: p.user_id, hole_id: hole.id, strokes },
        { onConflict: "round_id,user_id,hole_id" }
      )
    ));
    setSaving(false);
  }

  function teamTotalScore(teamPlayers: Player[]) {
    let total = 0; let par = 0;
    for (const h of holes) {
      const s = getTeamScore(teamPlayers, h.id);
      if (s > 0) { total += s; par += h.par; }
    }
    return { total, diff: total - par };
  }

  function totalScore(uid: string) {
    let total = 0; let par = 0;
    for (const h of holes) {
      const s = scores[h.id]?.[uid];
      if (s !== undefined) { total += s; par += h.par; }
    }
    return { total, diff: total - par };
  }

  function totalStableford(uid: string): number {
    const p = players.find((pl) => pl.user_id === uid);
    const hcp = courseHcp(p?.handicap_index ?? null);
    return holes.reduce((sum, h) => {
      const s = scores[h.id]?.[uid];
      if (!s) return sum;
      return sum + stablefordPoints(s, h.par, strokesOnHole(hcp, h.stroke_index));
    }, 0);
  }

  // ── Poångbogey running score ──────────────────────────────────────────────
  function matchVsParTotal(uid: string): number {
    const p = players.find((pl) => pl.user_id === uid);
    const hcp = courseHcp(p?.handicap_index ?? null);
    return holes.reduce((sum, h) => {
      const g = scores[h.id]?.[uid];
      if (!g) return sum;
      return sum + matchVsParHole(g, h.par, strokesOnHole(hcp, h.stroke_index));
    }, 0);
  }

  // ── Wolf helpers ──────────────────────────────────────────────────────────
  function wolfForHole(holeIndex: number): Player | undefined {
    return players[holeIndex % players.length];
  }

  function computeWolfPoints(): Record<string, number> {
    const pts: Record<string, number> = {};
    players.forEach((p) => { pts[p.user_id] = 0; });
    for (let i = 0; i < holes.length; i++) {
      const h = holes[i];
      const wolf = wolfForHole(i);
      if (!wolf) continue;
      const decision = wolfDecisions[h.id];
      if (!decision) continue;
      const wolfSide = decision.partnerUserId ? [wolf.user_id, decision.partnerUserId] : [wolf.user_id];
      const otherSide = players.map((p) => p.user_id).filter((u) => !wolfSide.includes(u));
      const bestNet = (uids: string[]) => Math.min(...uids.map((u) => {
        const g = scores[h.id]?.[u];
        if (!g) return Infinity;
        const pl = players.find((p) => p.user_id === u);
        return g - strokesOnHole(courseHcp(pl?.handicap_index ?? null), h.stroke_index);
      }));
      const wn = bestNet(wolfSide), on = bestNet(otherSide);
      if (!isFinite(wn) || !isFinite(on)) continue;
      if (decision.partnerUserId) {
        if (wn < on) wolfSide.forEach((u) => { pts[u] += 1; });
        else if (on < wn) otherSide.forEach((u) => { pts[u] += 1; });
      } else {
        if (wn < on) pts[wolf.user_id] += 3;
        else if (on < wn) otherSide.forEach((u) => { pts[u] += 1; });
      }
    }
    return pts;
  }

  // ── Köpenhamnare hole results ─────────────────────────────────────────────
  function kopenhamnareResults(redPs: Player[], bluePs: Player[]): ("red" | "blue" | "halved" | null)[] {
    return holes.map((h) => {
      const teamNet = (tp: Player[]) => {
        let sum = 0;
        for (const p of tp) {
          const g = scores[h.id]?.[p.user_id];
          if (!g) return null;
          sum += g - strokesOnHole(courseHcp(p.handicap_index), h.stroke_index);
        }
        return sum;
      };
      const r = teamNet(redPs), b = teamNet(bluePs);
      if (r === null || b === null) return null;
      if (r < b) return "red";
      if (b < r) return "blue";
      return "halved";
    });
  }

  async function abortRound() {
    if (!confirm("Avbryta rundan? All data raderas.")) return;
    await fetch(`/api/rounds/${id}`, { method: "DELETE" });
    router.push("/dashboard");
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-500">Laddar...</div>;

  // ── Group players by team for scramble ────────────────────────────────────
  const scrambleTeams: { key: string; label: string; players: Player[] }[] = [];
  if (format === "scramble") {
    const teamA = players.filter((p) => p.team === "red");
    const teamB = players.filter((p) => p.team === "blue");
    const noTeam = players.filter((p) => !p.team);
    if (teamA.length) scrambleTeams.push({ key: "red", label: "Lag A", players: teamA });
    if (teamB.length) scrambleTeams.push({ key: "blue", label: "Lag B", players: teamB });
    // Players without team assignment play individually
    for (const p of noTeam) scrambleTeams.push({ key: p.user_id, label: p.name, players: [p] });
  }

  // ── Summary view ──────────────────────────────────────────────────────────
  if (currentHole >= holes.length) {
    return (
      <div className="min-h-screen bg-green-100 pb-8">
        <header className="bg-green-800 text-white px-4 py-4">
          <h1 className="text-lg font-bold">Runda klar!</h1>
          <p className="text-sm opacity-75">{courseName}</p>
        </header>
        <main className="px-2 py-4 max-w-2xl mx-auto space-y-6">

          {/* Scramble summary */}
          {format === "scramble" && (
            <section className="px-2">
              <h2 className="text-xs font-semibold text-gray-500 uppercase mb-2">Lagresultat</h2>
              <div className="space-y-2">
                {[...scrambleTeams].sort((a, b) => teamTotalScore(a.players).diff - teamTotalScore(b.players).diff).map((team, i) => {
                  const { total, diff } = teamTotalScore(team.players);
                  const hcp = calcScrambleHcp(team.players);
                  return (
                    <div key={team.key} className="bg-white rounded-2xl shadow-md px-4 py-3 flex items-center gap-3">
                      <span className="text-sm font-bold text-gray-400 w-5">{i + 1}</span>
                      <div className="flex-1">
                        <p className="font-semibold text-gray-800">{team.label}</p>
                        <p className="text-xs text-gray-400">{team.players.map((p) => p.name).join(", ")} · Team HCP {hcp}</p>
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
              {/* Per-hole table for scramble */}
              <div className="overflow-x-auto mt-4">
                <table className="min-w-full text-xs bg-white rounded-2xl shadow overflow-hidden">
                  <thead>
                    <tr className="bg-green-800 text-white">
                      <th className="px-3 py-2 text-left sticky left-0 bg-green-800">Hål</th>
                      <th className="px-2 py-2">Par</th>
                      {scrambleTeams.map((t) => <th key={t.key} className="px-2 py-2 min-w-14">{t.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {holes.map((h, i) => (
                      <tr key={h.id} className={i % 2 === 0 ? "bg-white" : "bg-green-50"}>
                        <td className="px-3 py-2 font-semibold text-gray-700 sticky left-0 bg-inherit">{h.hole_number}</td>
                        <td className="px-2 py-2 text-center text-gray-500">{h.par}</td>
                        {scrambleTeams.map((t) => {
                          const s = getTeamScore(t.players, h.id);
                          if (!s) return <td key={t.key} className="px-2 py-2 text-center text-gray-300">—</td>;
                          return (
                            <td key={t.key} className="px-2 py-2 text-center">
                              <ScoreSymbol strokes={s} par={h.par} />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    <tr className="bg-green-900 text-white font-bold">
                      <td className="px-3 py-2 sticky left-0 bg-green-900">Tot</td>
                      <td className="px-2 py-2 text-center">{holes.reduce((s, h) => s + h.par, 0)}</td>
                      {scrambleTeams.map((t) => {
                        const { total, diff } = teamTotalScore(t.players);
                        return (
                          <td key={t.key} className="px-2 py-2 text-center">
                            <div>{total || "—"}</div>
                            {total > 0 && <div className={`text-xs font-normal ${diff > 0 ? "text-red-300" : diff < 0 ? "text-green-300" : "text-gray-300"}`}>{diff > 0 ? `+${diff}` : diff === 0 ? "Par" : diff}</div>}
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Stroke play summary */}
          {format === "stroke" && (
            <section className="px-2">
              <h2 className="text-xs font-semibold text-gray-500 uppercase mb-2">Slutresultat</h2>
              <div className="space-y-2">
                {[...players].sort((a, b) => totalStableford(b.user_id) - totalStableford(a.user_id)).map((p, i) => {
                  const { total, diff } = totalScore(p.user_id);
                  const totalSt = totalStableford(p.user_id);
                  return (
                    <div key={p.user_id} className="bg-white rounded-2xl shadow-md px-4 py-3 flex items-center gap-3">
                      <span className="text-sm font-bold text-gray-400 w-5">{i + 1}</span>
                      <div className="flex-1">
                        <p className="font-semibold text-gray-800 text-sm">{p.name}</p>
                        <p className="text-xs text-gray-400">HCP {courseHcp(p.handicap_index)}{p.tee_name ? ` · ${p.tee_name}` : ""}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-bold text-green-700">{totalSt}p</p>
                        <p className={`text-sm font-medium ${diff > 0 ? "text-red-500" : diff < 0 ? "text-green-600" : "text-gray-400"}`}>
                          {total > 0 ? `${total} (${diff > 0 ? "+" : ""}${diff === 0 ? "par" : diff})` : "—"}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="overflow-x-auto mt-4">
                <table className="min-w-full text-xs bg-white rounded-2xl shadow overflow-hidden">
                  <thead>
                    <tr className="bg-green-800 text-white">
                      <th className="px-3 py-2 text-left sticky left-0 bg-green-800">Hål</th>
                      <th className="px-2 py-2">Par</th>
                      <th className="px-2 py-2">SI</th>
                      {players.map((p) => (
                        <th key={p.user_id} className="px-2 py-2 min-w-16 text-center">{p.name.split(" ")[0]}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {holes.map((h, i) => (
                      <tr key={h.id} className={i % 2 === 0 ? "bg-white" : "bg-green-50"}>
                        <td className="px-3 py-2 font-semibold text-gray-700 sticky left-0 bg-inherit">{h.hole_number}</td>
                        <td className="px-2 py-2 text-center text-gray-500">{h.par}</td>
                        <td className="px-2 py-2 text-center text-gray-400">{h.stroke_index ?? "—"}</td>
                        {players.map((p) => {
                          const s = scores[h.id]?.[p.user_id];
                          const extra = strokesOnHole(courseHcp(p.handicap_index), h.stroke_index);
                          if (s === undefined) return (
                            <td key={p.user_id} className="px-2 py-1.5 text-center text-gray-300">
                              {extra > 0 && <div className="text-yellow-400 text-xs mb-0.5">+{extra}</div>}—
                            </td>
                          );
                          const pts = stablefordPoints(s, h.par, extra);
                          return (
                            <td key={p.user_id} className="px-2 py-1.5 text-center">
                              {extra > 0 && <div className="text-yellow-600 text-xs mb-0.5 font-semibold">+{extra}</div>}
                              <ScoreSymbol strokes={s} par={h.par} />
                              <div className="text-green-600 text-xs mt-0.5 font-semibold">{pts}p</div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    <tr className="bg-green-900 text-white font-bold">
                      <td className="px-3 py-2 sticky left-0 bg-green-900">Tot</td>
                      <td className="px-2 py-2 text-center">{holes.reduce((s, h) => s + h.par, 0)}</td>
                      <td className="px-2 py-2" />
                      {players.map((p) => {
                        const { total, diff } = totalScore(p.user_id);
                        const totalSt = totalStableford(p.user_id);
                        return (
                          <td key={p.user_id} className="px-2 py-2 text-center">
                            <div>{total || "—"}</div>
                            {total > 0 && <div className={`text-xs font-normal ${diff > 0 ? "text-red-300" : diff < 0 ? "text-green-300" : "text-gray-300"}`}>{diff > 0 ? `+${diff}` : diff === 0 ? "par" : diff}</div>}
                            <div className="text-xs font-semibold text-yellow-300">{totalSt}p</div>
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Matchplay summary */}
          {format === "matchplay" && (() => {
            const redPs = players.filter((p) => p.team === "red");
            const bluePs = players.filter((p) => p.team === "blue");

            type HR = "red" | "blue" | "halved" | null;
            const holeResults: HR[] = holes.map((h) => {
              const bestNet = (tp: Player[]) => Math.min(...tp.map((p) => {
                const g = scores[h.id]?.[p.user_id];
                if (!g) return Infinity;
                return g - strokesOnHole(courseHcp(p.handicap_index), h.stroke_index);
              }));
              const r = bestNet(redPs), b = bestNet(bluePs);
              if (!isFinite(r) && !isFinite(b)) return null;
              if (r < b) return "red";
              if (b < r) return "blue";
              return "halved";
            });

            let redUp = 0;
            const running: number[] = [];
            for (const hr of holeResults) {
              if (hr === "red") redUp++;
              else if (hr === "blue") redUp--;
              running.push(redUp);
            }

            const played = holeResults.filter((r) => r !== null).length;
            const redWins = holeResults.filter((r) => r === "red").length;
            const blueWins = holeResults.filter((r) => r === "blue").length;
            const halveds = holeResults.filter((r) => r === "halved").length;
            const left = holes.length - played;

            let label: string, bannerCls: string;
            if (redUp > 0) {
              label = redUp > left ? `Rött vann ${redUp}&${left}` : `Rött leder ${redUp} up${left > 0 ? ` · ${left} kvar` : ""}`;
              bannerCls = "bg-red-600";
            } else if (redUp < 0) {
              const bu = -redUp;
              label = bu > left ? `Blått vann ${bu}&${left}` : `Blått leder ${bu} up${left > 0 ? ` · ${left} kvar` : ""}`;
              bannerCls = "bg-blue-600";
            } else {
              label = played === 0 ? "Inga hål spelade" : left > 0 ? `All square · ${left} kvar` : "All square";
              bannerCls = "bg-gray-500";
            }

            const playerCell = (p: Player, h: (typeof holes)[0], rowBg: string) => {
              const gross = scores[h.id]?.[p.user_id];
              const extra = strokesOnHole(courseHcp(p.handicap_index), h.stroke_index);
              if (!gross) return (
                <td key={p.user_id} className={`px-2 py-1.5 text-center text-gray-300 ${rowBg}`}>
                  {extra > 0 && <div className="text-yellow-500 text-xs">+{extra}</div>}—
                </td>
              );
              return (
                <td key={p.user_id} className={`px-2 py-1.5 text-center ${rowBg}`}>
                  {extra > 0 && <div className="text-yellow-600 text-xs font-semibold">+{extra}</div>}
                  <ScoreSymbol strokes={gross} par={h.par} />
                  <div className="text-xs mt-0.5 text-gray-400">{gross - extra}</div>
                </td>
              );
            };

            return (
              <section className="px-2 space-y-4">
                {/* Result banner */}
                <div className={`${bannerCls} text-white rounded-2xl px-4 py-5 text-center`}>
                  <p className="text-2xl font-bold">{label}</p>
                  <p className="text-sm opacity-80 mt-1">Rött {redWins} – {halveds} – {blueWins} Blått</p>
                </div>

                {/* Hole timeline */}
                <div className="bg-white rounded-2xl shadow-md px-4 py-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-3">Hål för hål</p>
                  <div className="flex flex-wrap gap-x-2 gap-y-3">
                    {holes.map((h, i) => {
                      const r = holeResults[i];
                      const sc = running[i];
                      const circleCls = r === "red" ? "bg-red-500 text-white" : r === "blue" ? "bg-blue-500 text-white" : r === "halved" ? "bg-gray-300 text-gray-700" : "bg-gray-100 text-gray-400";
                      const scoreTxt = sc === 0 ? "=" : sc > 0 ? `R${sc}` : `B${-sc}`;
                      const scoreCls = sc > 0 ? "text-red-600" : sc < 0 ? "text-blue-600" : "text-gray-400";
                      return (
                        <div key={h.id} className="flex flex-col items-center w-7">
                          <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${circleCls}`}>{h.hole_number}</span>
                          <span className={`text-xs mt-0.5 font-semibold ${scoreCls}`}>{r !== null ? scoreTxt : ""}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> Rött</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-gray-300 inline-block" /> Delat</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blue-500 inline-block" /> Blått</span>
                  </div>
                </div>

                {/* Per-hole table */}
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs bg-white rounded-2xl shadow overflow-hidden">
                    <thead>
                      <tr className="bg-green-800 text-white">
                        <th className="px-2 py-2 text-left sticky left-0 bg-green-800">Hål</th>
                        <th className="px-2 py-2">Par</th>
                        <th className="px-2 py-2">SI</th>
                        {redPs.map((p) => <th key={p.user_id} className="px-2 py-2 text-red-300 min-w-12">{p.name.split(" ")[0]}</th>)}
                        <th className="px-2 py-2">Res</th>
                        {bluePs.map((p) => <th key={p.user_id} className="px-2 py-2 text-blue-300 min-w-12">{p.name.split(" ")[0]}</th>)}
                        <th className="px-2 py-2">Match</th>
                      </tr>
                    </thead>
                    <tbody>
                      {holes.map((h, i) => {
                        const result = holeResults[i];
                        const sc = running[i];
                        const rowBg = result === "red" ? "bg-red-50" : result === "blue" ? "bg-blue-50" : i % 2 === 0 ? "bg-white" : "bg-green-50";
                        const matchTxt = result === null ? "" : sc === 0 ? "=" : sc > 0 ? `R${sc}up` : `B${-sc}up`;
                        const matchCls = sc > 0 ? "text-red-600" : sc < 0 ? "text-blue-600" : "text-gray-400";
                        return (
                          <tr key={h.id}>
                            <td className={`px-2 py-1.5 font-semibold text-gray-700 sticky left-0 ${rowBg}`}>{h.hole_number}</td>
                            <td className={`px-2 py-1.5 text-center text-gray-500 ${rowBg}`}>{h.par}</td>
                            <td className={`px-2 py-1.5 text-center text-gray-400 ${rowBg}`}>{h.stroke_index ?? "—"}</td>
                            {redPs.map((p) => playerCell(p, h, rowBg))}
                            <td className={`px-2 py-1.5 text-center font-bold ${rowBg} ${result === "red" ? "text-red-600" : result === "blue" ? "text-blue-600" : "text-gray-400"}`}>
                              {result === "red" ? "R" : result === "blue" ? "B" : result === "halved" ? "=" : ""}
                            </td>
                            {bluePs.map((p) => playerCell(p, h, rowBg))}
                            <td className={`px-2 py-1.5 text-center font-semibold text-xs ${rowBg} ${matchCls}`}>{matchTxt}</td>
                          </tr>
                        );
                      })}
                      <tr className="bg-green-900 text-white font-bold">
                        <td className="px-2 py-2 sticky left-0 bg-green-900" colSpan={3}>Tot</td>
                        {redPs.map((p) => {
                          const { total, diff } = totalScore(p.user_id);
                          return (
                            <td key={p.user_id} className="px-2 py-2 text-center">
                              <div>{total || "—"}</div>
                              {total > 0 && <div className={`text-xs font-normal ${diff > 0 ? "text-red-300" : "text-green-300"}`}>{diff > 0 ? `+${diff}` : diff}</div>}
                            </td>
                          );
                        })}
                        <td className="px-2 py-2 text-center text-xs">
                          <div className="text-red-300">{redWins}W</div>
                          <div className="text-gray-400">{halveds}=</div>
                          <div className="text-blue-300">{blueWins}W</div>
                        </td>
                        {bluePs.map((p) => {
                          const { total, diff } = totalScore(p.user_id);
                          return (
                            <td key={p.user_id} className="px-2 py-2 text-center">
                              <div>{total || "—"}</div>
                              {total > 0 && <div className={`text-xs font-normal ${diff > 0 ? "text-red-300" : "text-green-300"}`}>{diff > 0 ? `+${diff}` : diff}</div>}
                            </td>
                          );
                        })}
                        <td className="px-2 py-2" />
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })()}

          {/* Poångbogey summary */}
          {format === "poangbogey" && (
            <section className="px-2">
              <h2 className="text-xs font-semibold text-gray-500 uppercase mb-2">Slutresultat – Poångbogey</h2>
              <div className="space-y-2 mb-4">
                {[...players].sort((a, b) => matchVsParTotal(b.user_id) - matchVsParTotal(a.user_id)).map((p, i) => {
                  const mvp = matchVsParTotal(p.user_id);
                  return (
                    <div key={p.user_id} className="bg-white rounded-2xl shadow-md px-4 py-3 flex items-center gap-3">
                      <span className="text-sm font-bold text-gray-400 w-5">{i + 1}</span>
                      <div className="flex-1">
                        <p className="font-semibold text-gray-800 text-sm">{p.name}</p>
                        <p className="text-xs text-gray-400">HCP {courseHcp(p.handicap_index)}</p>
                      </div>
                      <div className="text-right">
                        <p className={`text-2xl font-bold ${mvp > 0 ? "text-green-600" : mvp < 0 ? "text-red-500" : "text-gray-500"}`}>
                          {mvp > 0 ? `+${mvp}` : mvp === 0 ? "±0" : mvp}
                        </p>
                        <p className="text-xs text-gray-400">{mvp > 0 ? "up" : mvp < 0 ? "dn" : "all sq"}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs bg-white rounded-2xl shadow overflow-hidden">
                  <thead>
                    <tr className="bg-green-800 text-white">
                      <th className="px-3 py-2 text-left sticky left-0 bg-green-800">Hål</th>
                      <th className="px-2 py-2">Par</th>
                      <th className="px-2 py-2">SI</th>
                      {players.map((p) => <th key={p.user_id} className="px-2 py-2 min-w-14 text-center">{p.name.split(" ")[0]}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {holes.map((h, i) => (
                      <tr key={h.id} className={i % 2 === 0 ? "bg-white" : "bg-green-50"}>
                        <td className="px-3 py-2 font-semibold text-gray-700 sticky left-0 bg-inherit">{h.hole_number}</td>
                        <td className="px-2 py-2 text-center text-gray-500">{h.par}</td>
                        <td className="px-2 py-2 text-center text-gray-400">{h.stroke_index ?? "—"}</td>
                        {players.map((p) => {
                          const g = scores[h.id]?.[p.user_id];
                          const extra = strokesOnHole(courseHcp(p.handicap_index), h.stroke_index);
                          if (!g) return <td key={p.user_id} className="px-2 py-2 text-center text-gray-300">—</td>;
                          const res = matchVsParHole(g, h.par, extra);
                          return (
                            <td key={p.user_id} className="px-2 py-1.5 text-center">
                              <ScoreSymbol strokes={g} par={h.par} />
                              <div className={`text-xs font-bold mt-0.5 ${res > 0 ? "text-green-600" : res < 0 ? "text-red-500" : "text-gray-400"}`}>
                                {res > 0 ? "W" : res < 0 ? "L" : "H"}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    <tr className="bg-green-900 text-white font-bold">
                      <td className="px-3 py-2 sticky left-0 bg-green-900" colSpan={3}>Tot</td>
                      {players.map((p) => {
                        const mvp = matchVsParTotal(p.user_id);
                        return (
                          <td key={p.user_id} className="px-2 py-2 text-center">
                            <div>{mvp > 0 ? `+${mvp}` : mvp}</div>
                            <div className={`text-xs font-normal ${mvp > 0 ? "text-green-300" : mvp < 0 ? "text-red-300" : "text-gray-400"}`}>{mvp > 0 ? "up" : mvp < 0 ? "dn" : "="}</div>
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Skins summary */}
          {format === "skins" && (() => {
            const allSkins = computeSkins(holes, scores, players);
            const totalWon: Record<string, number> = {};
            players.forEach((p) => { totalWon[p.user_id] = 0; });
            allSkins.forEach((s) => { if (s.winner) totalWon[s.winner] = (totalWon[s.winner] ?? 0) + s.skinValue; });
            const totalSkins = allSkins.filter((s) => s.winner).reduce((sum, s) => sum + s.skinValue, 0);
            return (
              <section className="px-2">
                <h2 className="text-xs font-semibold text-gray-500 uppercase mb-2">Skins</h2>
                <div className="space-y-2 mb-4">
                  {[...players].sort((a, b) => (totalWon[b.user_id] ?? 0) - (totalWon[a.user_id] ?? 0)).map((p, i) => (
                    <div key={p.user_id} className="bg-white rounded-2xl shadow-md px-4 py-3 flex items-center gap-3">
                      <span className="text-sm font-bold text-gray-400 w-5">{i + 1}</span>
                      <div className="flex-1">
                        <p className="font-semibold text-gray-800 text-sm">{p.name}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-orange-600">{totalWon[p.user_id] ?? 0}</p>
                        <p className="text-xs text-gray-400">huvor</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="bg-white rounded-2xl shadow-md px-4 py-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-3">Hål för hål · {totalSkins} huvor spelade</p>
                  <div className="flex flex-wrap gap-x-2 gap-y-3">
                    {allSkins.map((skin, i) => {
                      const h = holes[i];
                      const winner = players.find((p) => p.user_id === skin.winner);
                      return (
                        <div key={skin.holeId} className="flex flex-col items-center w-8">
                          <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${skin.winner ? "bg-orange-500 text-white" : "bg-gray-100 text-gray-400"}`}>
                            {h.hole_number}
                          </span>
                          <span className="text-xs mt-0.5 font-semibold text-orange-600 leading-tight text-center">
                            {skin.winner ? (skin.skinValue > 1 ? `${winner?.name.split(" ")[0]} ×${skin.skinValue}` : winner?.name.split(" ")[0]) : skin.skinValue > 1 ? `(${skin.skinValue})` : ""}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>
            );
          })()}

          {/* Wolf summary */}
          {format === "wolf" && (() => {
            const wolfPts = computeWolfPoints();
            return (
              <section className="px-2">
                <h2 className="text-xs font-semibold text-gray-500 uppercase mb-2">Wolf – Resultat</h2>
                <div className="space-y-2 mb-4">
                  {[...players].sort((a, b) => (wolfPts[b.user_id] ?? 0) - (wolfPts[a.user_id] ?? 0)).map((p, i) => (
                    <div key={p.user_id} className="bg-white rounded-2xl shadow-md px-4 py-3 flex items-center gap-3">
                      <span className="text-sm font-bold text-gray-400 w-5">{i + 1}</span>
                      <div className="flex-1">
                        <p className="font-semibold text-gray-800 text-sm">{p.name}</p>
                        <p className="text-xs text-gray-400">HCP {courseHcp(p.handicap_index)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-yellow-600">{wolfPts[p.user_id] ?? 0}</p>
                        <p className="text-xs text-gray-400">poäng</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs bg-white rounded-2xl shadow overflow-hidden">
                    <thead>
                      <tr className="bg-green-800 text-white">
                        <th className="px-3 py-2 text-left sticky left-0 bg-green-800">Hål</th>
                        <th className="px-2 py-2">Wolf</th>
                        <th className="px-2 py-2">Partner</th>
                        <th className="px-2 py-2">Vinnare</th>
                        {players.map((p) => <th key={p.user_id} className="px-2 py-2 min-w-10 text-center">{p.name.split(" ")[0]}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {holes.map((h, i) => {
                        const wolf = wolfForHole(i);
                        const decision = wolfDecisions[h.id];
                        const partner = decision?.partnerUserId ? players.find((p) => p.user_id === decision.partnerUserId) : null;
                        const wolfSide = decision ? (decision.partnerUserId ? [wolf!.user_id, decision.partnerUserId] : [wolf!.user_id]) : [];
                        const otherSide = players.map((p) => p.user_id).filter((u) => !wolfSide.includes(u));
                        let holeWinnerSide: "wolf" | "other" | "halved" | null = null;
                        if (decision && wolf) {
                          const bestNet = (uids: string[]) => Math.min(...uids.map((u) => { const g = scores[h.id]?.[u]; if (!g) return Infinity; const pl = players.find((p) => p.user_id === u); return g - strokesOnHole(courseHcp(pl?.handicap_index ?? null), h.stroke_index); }));
                          const wn = bestNet(wolfSide), on = bestNet(otherSide);
                          if (isFinite(wn) && isFinite(on)) holeWinnerSide = wn < on ? "wolf" : on < wn ? "other" : "halved";
                        }
                        return (
                          <tr key={h.id} className={i % 2 === 0 ? "bg-white" : "bg-green-50"}>
                            <td className="px-3 py-2 font-semibold text-gray-700 sticky left-0 bg-inherit">{h.hole_number}</td>
                            <td className="px-2 py-2 text-center">⚡ {wolf?.name.split(" ")[0]}</td>
                            <td className="px-2 py-2 text-center text-gray-600">{decision ? (partner ? partner.name.split(" ")[0] : "Lone") : "—"}</td>
                            <td className={`px-2 py-2 text-center font-semibold ${holeWinnerSide === "wolf" ? "text-yellow-600" : holeWinnerSide === "other" ? "text-gray-600" : "text-gray-400"}`}>
                              {holeWinnerSide === "wolf" ? "Wolf" : holeWinnerSide === "other" ? "Andra" : holeWinnerSide === "halved" ? "=" : "—"}
                            </td>
                            {players.map((p) => {
                              const g = scores[h.id]?.[p.user_id];
                              if (!g) return <td key={p.user_id} className="px-2 py-2 text-center text-gray-300">—</td>;
                              return <td key={p.user_id} className="px-2 py-2 text-center"><ScoreSymbol strokes={g} par={h.par} /></td>;
                            })}
                          </tr>
                        );
                      })}
                      <tr className="bg-green-900 text-white font-bold">
                        <td className="px-3 py-2 sticky left-0 bg-green-900" colSpan={4}>Tot</td>
                        {players.map((p) => (
                          <td key={p.user_id} className="px-2 py-2 text-center text-yellow-300">{wolfPts[p.user_id] ?? 0}p</td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })()}

          {/* Köpenhamnare summary */}
          {format === "kopenhamnare" && (() => {
            const redPs = players.filter((p) => p.team === "red");
            const bluePs = players.filter((p) => p.team === "blue");
            const holeResults = kopenhamnareResults(redPs, bluePs);
            let redUp = 0;
            const running: number[] = [];
            for (const hr of holeResults) { if (hr === "red") redUp++; else if (hr === "blue") redUp--; running.push(redUp); }
            const played = holeResults.filter((r) => r !== null).length;
            const redWins = holeResults.filter((r) => r === "red").length;
            const blueWins = holeResults.filter((r) => r === "blue").length;
            const halveds = holeResults.filter((r) => r === "halved").length;
            const left = holes.length - played;
            let label: string, bannerCls: string;
            if (redUp > 0) { label = redUp > left ? `Rött vann ${redUp}&${left}` : `Rött leder ${redUp} up${left > 0 ? ` · ${left} kvar` : ""}`; bannerCls = "bg-red-600"; }
            else if (redUp < 0) { const bu = -redUp; label = bu > left ? `Blått vann ${bu}&${left}` : `Blått leder ${bu} up${left > 0 ? ` · ${left} kvar` : ""}`; bannerCls = "bg-blue-600"; }
            else { label = played === 0 ? "Inga hål spelade" : left > 0 ? `All square · ${left} kvar` : "All square"; bannerCls = "bg-gray-500"; }

            const teamNetSum = (tp: Player[], h: Hole) => {
              let sum = 0;
              for (const p of tp) { const g = scores[h.id]?.[p.user_id]; if (!g) return null; sum += g - strokesOnHole(courseHcp(p.handicap_index), h.stroke_index); }
              return sum;
            };

            return (
              <section className="px-2 space-y-4">
                <div className={`${bannerCls} text-white rounded-2xl px-4 py-5 text-center`}>
                  <p className="text-2xl font-bold">{label}</p>
                  <p className="text-sm opacity-80 mt-1">Rött {redWins} – {halveds} – {blueWins} Blått · Kombinerat netto</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs bg-white rounded-2xl shadow overflow-hidden">
                    <thead>
                      <tr className="bg-green-800 text-white">
                        <th className="px-2 py-2 text-left sticky left-0 bg-green-800">Hål</th>
                        <th className="px-2 py-2">Par</th>
                        {redPs.map((p) => <th key={p.user_id} className="px-2 py-2 text-red-300 min-w-12">{p.name.split(" ")[0]}</th>)}
                        <th className="px-2 py-2 text-red-200">Sum R</th>
                        <th className="px-2 py-2">Res</th>
                        <th className="px-2 py-2 text-blue-200">Sum B</th>
                        {bluePs.map((p) => <th key={p.user_id} className="px-2 py-2 text-blue-300 min-w-12">{p.name.split(" ")[0]}</th>)}
                        <th className="px-2 py-2">Match</th>
                      </tr>
                    </thead>
                    <tbody>
                      {holes.map((h, i) => {
                        const result = holeResults[i];
                        const sc = running[i];
                        const rowBg = result === "red" ? "bg-red-50" : result === "blue" ? "bg-blue-50" : i % 2 === 0 ? "bg-white" : "bg-green-50";
                        const matchTxt = result === null ? "" : sc === 0 ? "=" : sc > 0 ? `R${sc}up` : `B${-sc}up`;
                        const matchCls = sc > 0 ? "text-red-600" : sc < 0 ? "text-blue-600" : "text-gray-400";
                        const rSum = teamNetSum(redPs, h);
                        const bSum = teamNetSum(bluePs, h);
                        return (
                          <tr key={h.id}>
                            <td className={`px-2 py-1.5 font-semibold text-gray-700 sticky left-0 ${rowBg}`}>{h.hole_number}</td>
                            <td className={`px-2 py-1.5 text-center text-gray-500 ${rowBg}`}>{h.par}</td>
                            {redPs.map((p) => {
                              const g = scores[h.id]?.[p.user_id];
                              return <td key={p.user_id} className={`px-2 py-1.5 text-center ${rowBg}`}>{g ? <ScoreSymbol strokes={g} par={h.par} /> : <span className="text-gray-300">—</span>}</td>;
                            })}
                            <td className={`px-2 py-1.5 text-center font-semibold text-red-700 ${rowBg}`}>{rSum ?? "—"}</td>
                            <td className={`px-2 py-1.5 text-center font-bold ${rowBg} ${result === "red" ? "text-red-600" : result === "blue" ? "text-blue-600" : "text-gray-400"}`}>
                              {result === "red" ? "R" : result === "blue" ? "B" : result === "halved" ? "=" : ""}
                            </td>
                            <td className={`px-2 py-1.5 text-center font-semibold text-blue-700 ${rowBg}`}>{bSum ?? "—"}</td>
                            {bluePs.map((p) => {
                              const g = scores[h.id]?.[p.user_id];
                              return <td key={p.user_id} className={`px-2 py-1.5 text-center ${rowBg}`}>{g ? <ScoreSymbol strokes={g} par={h.par} /> : <span className="text-gray-300">—</span>}</td>;
                            })}
                            <td className={`px-2 py-1.5 text-center font-semibold text-xs ${rowBg} ${matchCls}`}>{matchTxt}</td>
                          </tr>
                        );
                      })}
                      <tr className="bg-green-900 text-white font-bold">
                        <td className="px-2 py-2 sticky left-0 bg-green-900" colSpan={2}>Tot</td>
                        {redPs.map((p) => { const { total } = totalScore(p.user_id); return <td key={p.user_id} className="px-2 py-2 text-center">{total || "—"}</td>; })}
                        <td className="px-2 py-2 text-center text-red-300">{redWins}W</td>
                        <td className="px-2 py-2 text-center text-xs"><div className="text-gray-400">{halveds}=</div></td>
                        <td className="px-2 py-2 text-center text-blue-300">{blueWins}W</td>
                        {bluePs.map((p) => { const { total } = totalScore(p.user_id); return <td key={p.user_id} className="px-2 py-2 text-center">{total || "—"}</td>; })}
                        <td className="px-2 py-2" />
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })()}

          <div className="px-2 space-y-2">
            <button onClick={() => setCurrentHole(holes.length - 1)} className="w-full bg-white text-green-700 border border-green-300 rounded-2xl py-3 font-semibold text-sm">
              ← Tillbaka till sista hålet
            </button>
            <button onClick={() => router.push("/dashboard")} className="w-full bg-green-700 text-white rounded-2xl py-3 font-semibold">
              Hem
            </button>
          </div>
        </main>
      </div>
    );
  }

  // ── Active scorecard ──────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-green-100">
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
            <button onClick={() => setShowMenu((v) => !v)} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/20 text-base font-bold">···</button>
            {showMenu && (
              <div className="absolute right-0 top-10 bg-white rounded-2xl shadow-xl z-50 overflow-hidden min-w-44">
                <button onClick={() => { setShowMenu(false); setCurrentHole(holes.length); }} className="w-full text-left px-4 py-3 text-sm font-semibold text-green-700 hover:bg-green-50">Avsluta runda</button>
                <button onClick={() => { setShowMenu(false); abortRound(); }} className="w-full text-left px-4 py-3 text-sm font-semibold text-red-600 hover:bg-red-50 border-t border-gray-100">Avbryt &amp; radera</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="h-1 bg-green-900">
        <div className="h-1 bg-white transition-all" style={{ width: `${((currentHole + 1) / holes.length) * 100}%` }} />
      </div>

      <main className="px-4 py-6 max-w-lg mx-auto space-y-4">

        {/* Scramble: one card per team */}
        {format === "scramble" && scrambleTeams.map((team) => {
          const val = getTeamScore(team.players, hole.id);
          const { total, diff } = teamTotalScore(team.players);
          const badge = val > 0 ? scoreBadge(val, hole.par) : null;
          const hcp = calcScrambleHcp(team.players);
          const size = team.players.length;
          return (
            <div key={team.key} className="bg-white rounded-2xl shadow-md px-4 py-4">
              <div className="flex items-center justify-between mb-1">
                <div>
                  <p className="font-semibold text-gray-800">
                    {team.label}
                    <span className="ml-2 text-xs font-normal text-gray-400">{size}-manna · Team HCP {hcp}</span>
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">{team.players.map((p) => p.name).join(", ")}</p>
                </div>
                <div className="flex items-center gap-2">
                  {badge && <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${badge.cls}`}>{badge.label}</span>}
                  <p className={`text-sm font-medium ${diff > 0 ? "text-red-500" : diff < 0 ? "text-green-600" : "text-gray-400"}`}>
                    {total > 0 ? (diff > 0 ? `+${diff}` : diff === 0 ? "Par" : diff) : "—"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4 mt-3">
                <button onClick={() => saveTeamScore(team.players, Math.max(1, val - 1))} className="w-12 h-12 rounded-full bg-gray-100 text-2xl font-bold text-gray-700 flex items-center justify-center">−</button>
                <div className="flex-1 text-center">
                  <span className="text-4xl font-bold text-gray-900">{val || "—"}</span>
                </div>
                <button onClick={() => saveTeamScore(team.players, val + 1)} className="w-12 h-12 rounded-full bg-green-700 text-2xl font-bold text-white flex items-center justify-center">+</button>
              </div>
            </div>
          );
        })}

        {/* Wolf: banner + partner picker */}
        {format === "wolf" && (() => {
          const wolf = wolfForHole(currentHole);
          if (!wolf) return null;
          const decision = wolfDecisions[hole.id];
          const others = players.filter((p) => p.user_id !== wolf.user_id);
          const partner = decision?.partnerUserId ? players.find((p) => p.user_id === decision.partnerUserId) : null;
          const otherSideNames = others.filter((p) => p.user_id !== decision?.partnerUserId).map((p) => p.name.split(" ")[0]).join(" & ");
          return (
            <div className="space-y-2">
              <div className="bg-yellow-500 text-white rounded-2xl px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-xs opacity-80">Wolf detta hål</p>
                  <p className="font-bold text-base">⚡ {wolf.name}</p>
                  {decision && (
                    <p className="text-xs opacity-80 mt-0.5">
                      {partner ? `Med ${partner.name.split(" ")[0]} vs ${otherSideNames}` : `Lone Wolf vs alla`}
                    </p>
                  )}
                </div>
                {decision && (
                  <button onClick={() => setWolfDecisions((prev) => { const n = { ...prev }; delete n[hole.id]; return n; })}
                    className="text-xs bg-white/20 px-2 py-1 rounded-lg">Ändra</button>
                )}
              </div>
              {!decision && (
                <div className="bg-white rounded-2xl shadow-md px-4 py-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Wolf väljer partner</p>
                  <div className="space-y-1.5">
                    {others.map((p) => (
                      <button key={p.user_id}
                        onClick={() => setWolfDecisions((prev) => ({ ...prev, [hole.id]: { partnerUserId: p.user_id } }))}
                        className="w-full text-left px-4 py-2.5 rounded-xl bg-green-50 text-green-800 font-semibold text-sm">
                        {p.name} <span className="text-green-600 font-normal text-xs">HCP {courseHcp(p.handicap_index)}</span>
                      </button>
                    ))}
                    <button
                      onClick={() => setWolfDecisions((prev) => ({ ...prev, [hole.id]: { partnerUserId: null } }))}
                      className="w-full text-left px-4 py-2.5 rounded-xl bg-yellow-50 text-yellow-800 font-bold text-sm">
                      ⚡ Lone Wolf – kör ensam
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* Skins: show current skin value banner */}
        {format === "skins" && (() => {
          const allSkins = computeSkins(holes, scores, players);
          const skinValue = allSkins[currentHole]?.skinValue ?? 1;
          const totalWon: Record<string, number> = {};
          players.forEach((p) => { totalWon[p.user_id] = 0; });
          allSkins.slice(0, currentHole).forEach((s) => { if (s.winner) totalWon[s.winner] = (totalWon[s.winner] ?? 0) + s.skinValue; });
          const leader = [...players].sort((a, b) => (totalWon[b.user_id] ?? 0) - (totalWon[a.user_id] ?? 0))[0];
          return (
            <div className="bg-orange-500 text-white rounded-2xl px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-xs opacity-80">Huva detta hål</p>
                <p className="text-3xl font-bold">{skinValue}</p>
              </div>
              {(totalWon[leader?.user_id ?? ""] ?? 0) > 0 && (
                <div className="text-right">
                  <p className="text-xs opacity-80">Leder</p>
                  <p className="font-bold">{leader.name.split(" ")[0]} · {totalWon[leader.user_id]}st</p>
                </div>
              )}
            </div>
          );
        })()}

        {/* Stroke / Poångbogey / Skins / Wolf: one card per player */}
        {(format === "stroke" || format === "poangbogey" || format === "skins" || format === "wolf") && players.map((p) => {
          const val = scores[hole.id]?.[p.user_id] ?? 0;
          const { total, diff } = totalScore(p.user_id);
          const badge = val > 0 ? scoreBadge(val, hole.par) : null;
          const hcp = courseHcp(p.handicap_index);
          const extra = strokesOnHole(hcp, hole.stroke_index);
          const stablePts = format === "stroke" && val > 0 ? stablefordPoints(val, hole.par, extra) : null;
          const totalSt = format === "stroke" ? totalStableford(p.user_id) : 0;
          const mvp = format === "poangbogey" ? matchVsParTotal(p.user_id) : null;
          return (
            <div key={p.user_id} className="bg-white rounded-2xl shadow-md px-4 py-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-800 truncate">{p.name}</p>
                    {extra > 0 && <span className="shrink-0 text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full font-bold">+{extra}</span>}
                    {format === "wolf" && (() => {
                      const wolf = wolfForHole(currentHole);
                      return wolf?.user_id === p.user_id ? <span className="shrink-0 text-xs bg-yellow-400 text-yellow-900 px-1.5 py-0.5 rounded-full font-bold">⚡ Wolf</span> : null;
                    })()}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-gray-400">HCP {hcp}</span>
                    {p.tee_name && (
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        · <span className={`w-2 h-2 rounded-full inline-block ${p.tee_color === "red" ? "bg-red-500" : p.tee_color === "yellow" ? "bg-yellow-400" : p.tee_color === "blue" ? "bg-blue-500" : "bg-gray-400"}`} />
                        {p.tee_name}
                        {p.tee_id && teeDistances[p.tee_id]?.[hole.id] && <span>{teeDistances[p.tee_id][hole.id]} m</span>}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
                  <div className="flex items-center gap-1.5">
                    {badge && <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${badge.cls}`}>{badge.label}</span>}
                    {stablePts !== null && <span className="text-xs font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{stablePts}p</span>}
                  </div>
                  {format === "stroke" && <p className="text-xs text-gray-400">{total > 0 ? `${diff > 0 ? "+" : ""}${diff === 0 ? "par" : diff}` : "—"} · {totalSt}p tot</p>}
                  {format === "poangbogey" && <p className={`text-xs font-semibold ${mvp! > 0 ? "text-green-600" : mvp! < 0 ? "text-red-500" : "text-gray-400"}`}>{mvp! > 0 ? `+${mvp} up` : mvp! < 0 ? `${mvp} dn` : "all sq"}</p>}
                  {format === "skins" && <p className="text-xs text-gray-400">{total > 0 ? `${diff > 0 ? "+" : ""}${diff === 0 ? "par" : diff}` : "—"}</p>}
                  {format === "wolf" && <p className="text-xs text-gray-400">{total > 0 ? `${diff > 0 ? "+" : ""}${diff === 0 ? "par" : diff}` : "—"}</p>}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <button onClick={() => saveScore(p.user_id, Math.max(1, val - 1))} className="w-12 h-12 rounded-full bg-gray-100 text-2xl font-bold text-gray-700 flex items-center justify-center">−</button>
                <div className="flex-1 text-center"><span className="text-4xl font-bold text-gray-900">{val || "—"}</span></div>
                <button onClick={() => saveScore(p.user_id, val + 1)} className="w-12 h-12 rounded-full bg-green-700 text-2xl font-bold text-white flex items-center justify-center">+</button>
              </div>
            </div>
          );
        })}

        {/* Matchplay / Köpenhamnare: compact side-by-side layout */}
        {(format === "matchplay" || format === "kopenhamnare") && (() => {
          const redPs = players.filter((p) => p.team === "red");
          const bluePs = players.filter((p) => p.team === "blue");

          // Live match score up to current hole
          let liveRedUp = 0;
          for (let i = 0; i < currentHole; i++) {
            const h = holes[i];
            if (format === "matchplay") {
              const bestNet = (tp: Player[]) => Math.min(...tp.map((p) => {
                const g = scores[h.id]?.[p.user_id];
                return g ? g - strokesOnHole(courseHcp(p.handicap_index), h.stroke_index) : Infinity;
              }));
              const r = bestNet(redPs), b = bestNet(bluePs);
              if (isFinite(r) || isFinite(b)) {
                if (r < b) liveRedUp++;
                else if (b < r) liveRedUp--;
              }
            } else {
              // köpenhamnare: combined net
              const teamNet = (tp: Player[]) => {
                let sum = 0;
                for (const p of tp) { const g = scores[h.id]?.[p.user_id]; if (!g) return null; sum += g - strokesOnHole(courseHcp(p.handicap_index), h.stroke_index); }
                return sum;
              };
              const r = teamNet(redPs), b = teamNet(bluePs);
              if (r !== null && b !== null) {
                if (r < b) liveRedUp++;
                else if (b < r) liveRedUp--;
              }
            }
          }
          const holesLeft = holes.length - currentHole - 1;
          const statusLabel = liveRedUp === 0 ? "All square" : liveRedUp > 0 ? `Rött ${liveRedUp} up` : `Blått ${-liveRedUp} up`;
          const statusCls = liveRedUp > 0 ? "bg-red-600" : liveRedUp < 0 ? "bg-blue-600" : "bg-gray-600";

          const teamCard = (tPlayers: Player[], color: "red" | "blue") => {
            const isRed = color === "red";
            const borderCls = isRed ? "border-red-200 bg-red-50" : "border-blue-200 bg-blue-50";
            const labelCls = isRed ? "text-red-600" : "text-blue-600";
            const btnCls = isRed ? "bg-red-600" : "bg-blue-600";
            return (
              <div className={`flex-1 border-2 ${borderCls} rounded-2xl p-3 space-y-3`}>
                <p className={`text-xs font-bold ${labelCls} uppercase tracking-wide`}>{isRed ? "Rött" : "Blått"}</p>
                {tPlayers.map((p) => {
                  const val = scores[hole.id]?.[p.user_id] ?? 0;
                  const hcp = courseHcp(p.handicap_index);
                  const extra = strokesOnHole(hcp, hole.stroke_index);
                  const badge = val > 0 ? scoreBadge(val, hole.par) : null;
                  const { total, diff } = totalScore(p.user_id);
                  return (
                    <div key={p.user_id}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div>
                          <p className="text-xs font-semibold text-gray-800 leading-tight">{p.name.split(" ")[0]}</p>
                          <p className="text-xs text-gray-400">HCP {hcp}{extra > 0 ? ` · +${extra}` : ""}</p>
                        </div>
                        <div className="text-right">
                          {badge && <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${badge.cls}`}>{badge.label}</span>}
                          <p className={`text-xs font-medium mt-0.5 ${diff > 0 ? "text-red-500" : diff < 0 ? "text-green-600" : "text-gray-400"}`}>
                            {total > 0 ? `${diff > 0 ? "+" : ""}${diff === 0 ? "par" : diff}` : "—"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => saveScore(p.user_id, Math.max(1, val - 1))}
                          className="w-9 h-9 rounded-full bg-white shadow text-xl font-bold text-gray-600 flex items-center justify-center">−</button>
                        <div className="flex-1 text-center">
                          <span className="text-3xl font-bold text-gray-900">{val || "—"}</span>
                        </div>
                        <button onClick={() => saveScore(p.user_id, val + 1)}
                          className={`w-9 h-9 rounded-full ${btnCls} shadow text-xl font-bold text-white flex items-center justify-center`}>+</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          };

          return (
            <div className="space-y-3">
              <div className={`${statusCls} text-white rounded-2xl px-4 py-2.5 flex items-center justify-between`}>
                <p className="font-bold text-sm">{statusLabel}</p>
                <p className="text-xs opacity-75">{holesLeft} hål kvar</p>
              </div>
              <div className="flex gap-2">
                {teamCard(redPs, "red")}
                {teamCard(bluePs, "blue")}
              </div>
            </div>
          );
        })()}

        {saving && <p className="text-xs text-center text-gray-400">Sparar...</p>}

        <div className="flex gap-3 pt-2">
          <button onClick={() => setCurrentHole((h) => Math.max(0, h - 1))} disabled={currentHole === 0} className="flex-1 bg-white rounded-2xl py-3 text-sm font-medium text-gray-700 shadow disabled:opacity-30">← Föregående</button>
          <button onClick={() => setCurrentHole((h) => h + 1)} className="flex-1 bg-green-700 text-white rounded-2xl py-3 text-sm font-semibold shadow">
            {currentHole === holes.length - 1 ? "Avsluta runda →" : "Nästa hål →"}
          </button>
        </div>
      </main>
    </div>
  );
}
