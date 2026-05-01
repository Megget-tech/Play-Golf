"use client";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";

type Tournament = { id: string; name: string; format: string; start_date: string | null; completed_at: string | null };
type TeamPlayer = { user_id: string; name: string; handicap_index: number | null; team: "red" | "blue" };
type RCMatch = { id: string; session_id: string; red_player1: string | null; red_player2: string | null; blue_player1: string | null; blue_player2: string | null; result: "red" | "blue" | "halved" | null };
type RCSession = { id: string; tournament_id: string; session_type: "foursomes" | "fourballs" | "singles"; name: string | null; sort_order: number; matches: RCMatch[] };

const SESSION_LABELS: Record<string, string> = { foursomes: "Foursomes (alternate shot)", fourballs: "Fyrboll (better ball)", singles: "Singel" };

// ── Regular tournament types ─────────────────────────────────────────────────
type Round = { id: string; date: string; courses: { name: string } | null };
type Standing = { name: string; user_id: string; team: string | null; total: number; diff: number; rounds: number };

export default function TournamentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);

  // Ryder Cup state
  const [teamRed, setTeamRed] = useState<TeamPlayer[]>([]);
  const [teamBlue, setTeamBlue] = useState<TeamPlayer[]>([]);
  const [sessions, setSessions] = useState<RCSession[]>([]);
  const [playerSearch, setPlayerSearch] = useState("");
  const [searchResults, setSearchResults] = useState<{ id: string; name: string; handicap_index: number }[]>([]);
  const [addingToTeam, setAddingToTeam] = useState<"red" | "blue" | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Regular tournament state
  const [rounds, setRounds] = useState<Round[]>([]);
  const [standings, setStandings] = useState<Standing[]>([]);

  useEffect(() => {
    load();
  }, [id]);

  async function load() {
    const { data: t } = await supabase.from("tournaments").select("id, name, format, start_date, completed_at").eq("id", id).single();
    setTournament(t);
    if (!t) { setLoading(false); return; }

    if (t.format === "ryder_cup") {
      await loadRyderCup();
    } else {
      await loadRegular();
    }
    setLoading(false);
  }

  async function loadRyderCup() {
    const { data: teamData } = await supabase
      .from("ryder_cup_teams")
      .select("user_id, team, profiles(name, handicap_index)")
      .eq("tournament_id", id);

    const players = (teamData ?? []).map((tp: any) => ({
      user_id: tp.user_id,
      name: tp.profiles?.name ?? "?",
      handicap_index: tp.profiles?.handicap_index ?? null,
      team: tp.team,
    }));
    setTeamRed(players.filter((p) => p.team === "red"));
    setTeamBlue(players.filter((p) => p.team === "blue"));

    const { data: sessData } = await supabase
      .from("ryder_cup_sessions")
      .select("id, tournament_id, session_type, name, sort_order")
      .eq("tournament_id", id)
      .order("sort_order");

    const sessIds = (sessData ?? []).map((s: any) => s.id);
    let matchesData: RCMatch[] = [];
    if (sessIds.length) {
      const { data: md } = await supabase
        .from("ryder_cup_matches")
        .select("id, session_id, red_player1, red_player2, blue_player1, blue_player2, result")
        .in("session_id", sessIds);
      matchesData = (md ?? []) as RCMatch[];
    }

    const builtSessions: RCSession[] = (sessData ?? []).map((s: any) => ({
      ...s,
      matches: matchesData.filter((m) => m.session_id === s.id),
    }));
    setSessions(builtSessions);
  }

  async function loadRegular() {
    const { data: r } = await supabase
      .from("rounds").select("id, date, courses(name)")
      .eq("tournament_id", id).order("date", { ascending: false });
    setRounds((r ?? []) as unknown as Round[]);

    if (r && r.length > 0) {
      const roundIds = r.map((x: any) => x.id);
      const { data: players } = await supabase
        .from("round_players").select("user_id, team, round_id, profiles(name)").in("round_id", roundIds);
      const { data: scores } = await supabase
        .from("scores").select("round_id, user_id, strokes, holes(par)").in("round_id", roundIds);

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
          map[uid].total += holeScores.reduce((a, b) => a + b.strokes, 0);
          map[uid].diff += holeScores.reduce((a, b) => a + b.strokes - b.par, 0);
          map[uid].rounds += 1;
        }
      }
      setStandings(Object.values(map).sort((a, b) => a.diff - b.diff));
    }
  }

  // ── Player search for team building ────────────────────────────────────────
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (playerSearch.length < 2) { setSearchResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      const res = await fetch(`/api/players/search?q=${encodeURIComponent(playerSearch)}`);
      const data = await res.json();
      const allTeamIds = new Set([...teamRed, ...teamBlue].map((p) => p.user_id));
      setSearchResults(data.filter((p: any) => !allTeamIds.has(p.id)));
    }, 300);
  }, [playerSearch, teamRed, teamBlue]);

  async function addToTeam(player: { id: string; name: string; handicap_index: number }, team: "red" | "blue") {
    await supabase.from("ryder_cup_teams").upsert({ tournament_id: id, user_id: player.id, team }, { onConflict: "tournament_id,user_id" });
    const newPlayer: TeamPlayer = { user_id: player.id, name: player.name, handicap_index: player.handicap_index, team };
    if (team === "red") setTeamRed((prev) => [...prev, newPlayer]);
    else setTeamBlue((prev) => [...prev, newPlayer]);
    setPlayerSearch(""); setSearchResults([]); setAddingToTeam(null);
  }

  async function closeTournament() {
    if (!confirm("Avsluta tävlingen? Inga fler sessioner kan läggas till.")) return;
    await supabase.from("tournaments").update({ completed_at: new Date().toISOString() }).eq("id", id);
    setTournament((prev) => prev ? { ...prev, completed_at: new Date().toISOString() } : prev);
  }

  async function reopenTournament() {
    await supabase.from("tournaments").update({ completed_at: null }).eq("id", id);
    setTournament((prev) => prev ? { ...prev, completed_at: null } : prev);
  }

  async function removeFromTeam(userId: string, team: "red" | "blue") {
    await supabase.from("ryder_cup_teams").delete().eq("tournament_id", id).eq("user_id", userId);
    if (team === "red") setTeamRed((prev) => prev.filter((p) => p.user_id !== userId));
    else setTeamBlue((prev) => prev.filter((p) => p.user_id !== userId));
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">Laddar...</div>;
  if (!tournament) return <div className="min-h-screen flex items-center justify-center text-gray-400">Hittades inte.</div>;

  // ── Points ─────────────────────────────────────────────────────────────────
  const allMatches = sessions.flatMap((s) => s.matches);
  const completedMatches = allMatches.filter((m) => m.result !== null);
  const redPoints = allMatches.reduce((acc, m) => acc + (m.result === "red" ? 1 : m.result === "halved" ? 0.5 : 0), 0);
  const bluePoints = allMatches.reduce((acc, m) => acc + (m.result === "blue" ? 1 : m.result === "halved" ? 0.5 : 0), 0);
  const totalMatches = allMatches.length;
  const toWin = totalMatches / 2 + 0.5;
  const isCompleted = !!tournament?.completed_at;
  const winner = redPoints > bluePoints ? "red" : bluePoints > redPoints ? "blue" : totalMatches > 0 ? "tied" : null;

  // Name lookup
  const nameMap: Record<string, string> = {};
  for (const p of [...teamRed, ...teamBlue]) nameMap[p.user_id] = p.name;

  function matchLabel(m: RCMatch, sessionType: string) {
    const isSingles = sessionType === "singles";
    const red = isSingles
      ? (nameMap[m.red_player1 ?? ""] ?? "?")
      : [nameMap[m.red_player1 ?? ""], nameMap[m.red_player2 ?? ""]].filter(Boolean).join(" & ") || "?";
    const blue = isSingles
      ? (nameMap[m.blue_player1 ?? ""] ?? "?")
      : [nameMap[m.blue_player1 ?? ""], nameMap[m.blue_player2 ?? ""]].filter(Boolean).join(" & ") || "?";
    return { red, blue };
  }

  function matchResultLabel(result: RCMatch["result"]) {
    if (!result) return null;
    if (result === "halved") return { text: "½ – ½", cls: "text-gray-600" };
    if (result === "red") return { text: "1 – 0", cls: "text-red-600" };
    return { text: "0 – 1", cls: "text-blue-600" };
  }

  // ── Ryder Cup UI ──────────────────────────────────────────────────────────
  if (tournament.format === "ryder_cup") {
    return (
      <div className="min-h-screen bg-green-50 pb-8">
        <header className="bg-green-800 text-white px-4 py-4">
          <button onClick={() => router.back()} className="text-sm opacity-75 mb-1">← Tillbaka</button>
          <h1 className="text-lg font-bold">{tournament.name}</h1>
          {tournament.start_date && <p className="text-sm opacity-75">{new Date(tournament.start_date).toLocaleDateString("sv-SE")}</p>}
        </header>

        <main className="px-4 py-4 max-w-lg mx-auto space-y-6">

          {/* Winner banner */}
          {isCompleted && winner && (
            <div className={`rounded-2xl px-4 py-4 text-center ${
              winner === "red" ? "bg-red-600 text-white" :
              winner === "blue" ? "bg-blue-600 text-white" :
              "bg-gray-700 text-white"
            }`}>
              <p className="text-xs font-semibold opacity-75 mb-1">TÄVLINGEN AVSLUTAD</p>
              <p className="text-2xl font-bold">
                {winner === "red" ? "🏆 Rött lag vinner!" :
                 winner === "blue" ? "🏆 Blått lag vinner!" :
                 "Oavgjort – lika poäng"}
              </p>
              <p className="text-lg font-semibold mt-1 opacity-90">
                {redPoints % 1 === 0 ? redPoints : redPoints.toFixed(1)} – {bluePoints % 1 === 0 ? bluePoints : bluePoints.toFixed(1)}
              </p>
              <button onClick={reopenTournament} className="mt-3 text-xs opacity-60 underline">Återöppna tävling</button>
            </div>
          )}

          {/* Scoreboard */}
          <div className="bg-white rounded-2xl shadow p-4">
            <div className="flex items-stretch gap-3">
              <div className={`flex-1 rounded-xl p-3 text-center ${redPoints > bluePoints ? "bg-red-600 text-white" : "bg-red-50"}`}>
                <p className={`text-xs font-bold mb-1 ${redPoints > bluePoints ? "text-red-100" : "text-red-600"}`}>RÖTT</p>
                <p className={`text-5xl font-bold ${redPoints > bluePoints ? "text-white" : "text-red-700"}`}>{redPoints % 1 === 0 ? redPoints : redPoints.toFixed(1)}</p>
              </div>
              <div className="flex flex-col items-center justify-center px-1">
                <p className="text-gray-400 font-bold text-lg">vs</p>
                {totalMatches > 0 && <p className="text-xs text-gray-400 mt-1">Vinner på {toWin}p</p>}
              </div>
              <div className={`flex-1 rounded-xl p-3 text-center ${bluePoints > redPoints ? "bg-blue-600 text-white" : "bg-blue-50"}`}>
                <p className={`text-xs font-bold mb-1 ${bluePoints > redPoints ? "text-blue-100" : "text-blue-600"}`}>BLÅTT</p>
                <p className={`text-5xl font-bold ${bluePoints > redPoints ? "text-white" : "text-blue-700"}`}>{bluePoints % 1 === 0 ? bluePoints : bluePoints.toFixed(1)}</p>
              </div>
            </div>
            {totalMatches > 0 && !isCompleted && (
              <p className="text-xs text-center text-gray-400 mt-2">
                {completedMatches.length}/{totalMatches} matcher klara
              </p>
            )}
          </div>

          {/* Teams */}
          <section>
            <h2 className="text-xs font-semibold text-gray-500 uppercase mb-2">Lag</h2>
            <div className="grid grid-cols-2 gap-3">
              {(["red", "blue"] as const).map((team) => {
                const members = team === "red" ? teamRed : teamBlue;
                const label = team === "red" ? "RÖTT" : "BLÅTT";
                const color = team === "red" ? "text-red-600 bg-red-50 border-red-200" : "text-blue-600 bg-blue-50 border-blue-200";
                const btnColor = team === "red" ? "text-red-600" : "text-blue-600";
                return (
                  <div key={team} className={`bg-white rounded-2xl shadow p-3 border ${color.split(" ").slice(2).join(" ")}`}>
                    <p className={`text-xs font-bold mb-2 ${color.split(" ")[0]}`}>{label}</p>
                    <ul className="space-y-1 mb-2">
                      {members.map((p) => (
                        <li key={p.user_id} className="flex items-center justify-between text-sm">
                          <span className="text-gray-800">{p.name}</span>
                          <button onClick={() => removeFromTeam(p.user_id, team)} className="text-gray-300 ml-1">×</button>
                        </li>
                      ))}
                    </ul>
                    {addingToTeam === team ? (
                      <div>
                        <input
                          type="search"
                          placeholder="Sök spelare..."
                          value={playerSearch}
                          onChange={(e) => setPlayerSearch(e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none"
                        />
                        {searchResults.length > 0 && (
                          <ul className="mt-1 bg-white border border-gray-100 rounded-lg shadow-lg overflow-hidden">
                            {searchResults.map((p) => (
                              <li key={p.id}>
                                <button onClick={() => addToTeam(p, team)} className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50">
                                  <span className="font-semibold">{p.name}</span>
                                  <span className="text-gray-400 ml-1">HCP {p.handicap_index}</span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                        <button onClick={() => { setAddingToTeam(null); setPlayerSearch(""); setSearchResults([]); }} className="text-xs text-gray-400 mt-1">Avbryt</button>
                      </div>
                    ) : (
                      <button onClick={() => setAddingToTeam(team)} className={`text-xs font-semibold ${btnColor}`}>+ Lägg till</button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Sessions */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-semibold text-gray-500 uppercase">Sessioner</h2>
              {!isCompleted && (
                <Link href={`/tournaments/${id}/sessions/new`} className="text-xs font-semibold text-green-700">+ Ny session</Link>
              )}
            </div>

            {sessions.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">Inga sessioner skapade än.</p>
            ) : (
              <div className="space-y-3">
                {sessions.map((sess) => {
                  const sessRed = sess.matches.reduce((a, m) => a + (m.result === "red" ? 1 : m.result === "halved" ? 0.5 : 0), 0);
                  const sessBlue = sess.matches.reduce((a, m) => a + (m.result === "blue" ? 1 : m.result === "halved" ? 0.5 : 0), 0);
                  return (
                    <div key={sess.id} className="bg-white rounded-2xl shadow overflow-hidden">
                      <div className="px-4 py-3 bg-gray-50 flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-sm text-gray-800">{sess.name || SESSION_LABELS[sess.session_type]}</p>
                          <p className="text-xs text-gray-500">{SESSION_LABELS[sess.session_type]}</p>
                        </div>
                        <div className="flex items-center gap-2 text-sm font-bold">
                          <span className="text-red-600">{sessRed % 1 === 0 ? sessRed : sessRed.toFixed(1)}</span>
                          <span className="text-gray-400">–</span>
                          <span className="text-blue-600">{sessBlue % 1 === 0 ? sessBlue : sessBlue.toFixed(1)}</span>
                        </div>
                      </div>
                      <ul className="divide-y divide-gray-50">
                        {sess.matches.map((m) => {
                          const { red, blue } = matchLabel(m, sess.session_type);
                          const res = matchResultLabel(m.result);
                          return (
                            <li key={m.id}>
                              <Link href={`/tournaments/${id}/matches/${m.id}`} className="flex items-center px-4 py-3 gap-2 hover:bg-gray-50">
                                <span className="text-red-600 text-sm flex-1 truncate">{red}</span>
                                <span className={`text-xs font-bold px-2 ${res ? res.cls : "text-gray-300"}`}>{res ? res.text : "pågår"}</span>
                                <span className="text-blue-600 text-sm flex-1 truncate text-right">{blue}</span>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Close tournament button */}
            {!isCompleted && sessions.length > 0 && (
              <button
                onClick={closeTournament}
                className="w-full mt-4 border border-gray-300 rounded-2xl py-3 text-sm font-semibold text-gray-600 hover:border-red-300 hover:text-red-600 transition-colors"
              >
                Avsluta tävling
              </button>
            )}
          </section>
        </main>
      </div>
    );
  }

  // ── Regular tournament UI ─────────────────────────────────────────────────
  const isMatchplay = tournament.format === "matchplay";
  let redPts = 0; let bluePts = 0;
  if (isMatchplay && rounds.length > 0) {
    const red = standings.filter((s) => s.team === "red");
    const blue = standings.filter((s) => s.team === "blue");
    const rd = red.reduce((a, b) => a + b.diff, 0);
    const bd = blue.reduce((a, b) => a + b.diff, 0);
    if (rd < bd) redPts = 1; else if (bd < rd) bluePts = 1; else { redPts = 0.5; bluePts = 0.5; }
  }

  return (
    <div className="min-h-screen bg-green-50">
      <header className="bg-green-800 text-white px-4 py-4">
        <button onClick={() => router.back()} className="text-sm opacity-75 mb-1">← Tillbaka</button>
        <h1 className="text-lg font-bold">{tournament.name}</h1>
        {tournament.start_date && <p className="text-sm opacity-75">{new Date(tournament.start_date).toLocaleDateString("sv-SE")}</p>}
      </header>
      <main className="px-4 py-4 max-w-lg mx-auto space-y-6">
        {isMatchplay && (
          <div className="bg-white rounded-2xl shadow p-4">
            <h2 className="text-xs font-semibold text-gray-500 uppercase mb-3">Lagställning</h2>
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-red-50 rounded-xl p-3 text-center">
                <p className="text-xs font-bold text-red-600 mb-1">RÖTT</p>
                <p className="text-4xl font-bold text-red-700">{redPts}</p>
              </div>
              <p className="text-gray-400 font-bold text-xl">vs</p>
              <div className="flex-1 bg-blue-50 rounded-xl p-3 text-center">
                <p className="text-xs font-bold text-blue-600 mb-1">BLÅTT</p>
                <p className="text-4xl font-bold text-blue-700">{bluePts}</p>
              </div>
            </div>
          </div>
        )}
        {standings.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-gray-500 uppercase mb-2">Resultat</h2>
            <ul className="space-y-2">
              {standings.map((s, i) => (
                <li key={s.user_id} className="bg-white rounded-2xl shadow px-4 py-3 flex items-center gap-3">
                  <span className="text-lg font-bold text-gray-400 w-6 text-center">{i + 1}</span>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-800">{s.name}</p>
                    {isMatchplay && s.team && <span className={`text-xs font-bold ${s.team === "red" ? "text-red-600" : "text-blue-600"}`}>{s.team === "red" ? "RÖTT" : "BLÅTT"}</span>}
                  </div>
                  <div className="text-right">
                    <p className={`font-bold ${s.diff > 0 ? "text-red-600" : s.diff < 0 ? "text-green-600" : "text-gray-500"}`}>{s.diff > 0 ? `+${s.diff}` : s.diff === 0 ? "Par" : s.diff}</p>
                    <p className="text-xs text-gray-400">{s.rounds} runda{s.rounds !== 1 ? "r" : ""}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-semibold text-gray-500 uppercase">Rundor</h2>
            <Link href={`/rounds/new?tournamentId=${id}`} className="text-xs text-green-700 font-semibold">+ Lägg till runda</Link>
          </div>
          {rounds.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">Inga rundor spelade än.</p>
          ) : (
            <ul className="space-y-2">
              {rounds.map((r) => (
                <li key={r.id}>
                  <Link href={`/rounds/${r.id}`} className="flex items-center justify-between bg-white rounded-2xl shadow px-4 py-3">
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
