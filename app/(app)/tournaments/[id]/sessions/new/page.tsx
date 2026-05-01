"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

const SESSION_TYPES = [
  { value: "foursomes", label: "Foursomes", desc: "Alternate shot — 2 mot 2, en boll" },
  { value: "fourballs", label: "Fyrboll", desc: "Better ball — 2 mot 2, egna bollar" },
  { value: "singles", label: "Singel", desc: "1 mot 1, matchspel" },
] as const;

type Player = { user_id: string; name: string; handicap_index: number | null };
type PendingMatch = { redPlayers: Player[]; bluePlayers: Player[] };

export default function NewSessionPage() {
  const { id: tournamentId } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();

  const [sessionType, setSessionType] = useState<"foursomes" | "fourballs" | "singles">("singles");
  const [sessionName, setSessionName] = useState("");
  const [teamRed, setTeamRed] = useState<Player[]>([]);
  const [teamBlue, setTeamBlue] = useState<Player[]>([]);
  const [matches, setMatches] = useState<PendingMatch[]>([]);
  const [selectedRed, setSelectedRed] = useState<Player[]>([]);
  const [selectedBlue, setSelectedBlue] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const maxPerSide = sessionType === "singles" ? 1 : 2;

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("ryder_cup_teams")
        .select("user_id, team, profiles(name, handicap_index)")
        .eq("tournament_id", tournamentId);
      const mapped = (data ?? []).map((tp: any) => ({
        user_id: tp.user_id,
        name: tp.profiles?.name ?? "?",
        handicap_index: tp.profiles?.handicap_index ?? null,
        team: tp.team,
      }));
      setTeamRed(mapped.filter((p) => p.team === "red"));
      setTeamBlue(mapped.filter((p) => p.team === "blue"));
      setLoading(false);
    }
    load();
  }, [tournamentId]);

  // Players already used in pending matches
  const usedRed = new Set(matches.flatMap((m) => m.redPlayers.map((p) => p.user_id)));
  const usedBlue = new Set(matches.flatMap((m) => m.bluePlayers.map((p) => p.user_id)));

  function toggleRed(p: Player) {
    if (selectedRed.find((s) => s.user_id === p.user_id)) {
      setSelectedRed((prev) => prev.filter((s) => s.user_id !== p.user_id));
    } else if (selectedRed.length < maxPerSide) {
      setSelectedRed((prev) => [...prev, p]);
    }
  }

  function toggleBlue(p: Player) {
    if (selectedBlue.find((s) => s.user_id === p.user_id)) {
      setSelectedBlue((prev) => prev.filter((s) => s.user_id !== p.user_id));
    } else if (selectedBlue.length < maxPerSide) {
      setSelectedBlue((prev) => [...prev, p]);
    }
  }

  function addMatch() {
    if (selectedRed.length !== maxPerSide || selectedBlue.length !== maxPerSide) return;
    setMatches((prev) => [...prev, { redPlayers: selectedRed, bluePlayers: selectedBlue }]);
    setSelectedRed([]);
    setSelectedBlue([]);
  }

  function removeMatch(i: number) {
    setMatches((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function save() {
    if (matches.length === 0) return;
    setSaving(true);

    const { data: sess } = await supabase
      .from("ryder_cup_sessions")
      .insert({
        tournament_id: tournamentId,
        session_type: sessionType,
        name: sessionName.trim() || null,
        sort_order: Date.now(),
      })
      .select("id").single();

    if (!sess) { setSaving(false); return; }

    await Promise.all(matches.map((m) =>
      supabase.from("ryder_cup_matches").insert({
        session_id: sess.id,
        red_player1: m.redPlayers[0]?.user_id ?? null,
        red_player2: m.redPlayers[1]?.user_id ?? null,
        blue_player1: m.bluePlayers[0]?.user_id ?? null,
        blue_player2: m.bluePlayers[1]?.user_id ?? null,
      })
    ));

    router.push(`/tournaments/${tournamentId}`);
  }

  const canAddMatch = selectedRed.length === maxPerSide && selectedBlue.length === maxPerSide;

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">Laddar...</div>;

  return (
    <div className="min-h-screen bg-green-50 pb-8">
      <header className="bg-green-800 text-white px-4 py-4">
        <button onClick={() => router.back()} className="text-sm opacity-75 mb-1">← Tillbaka</button>
        <h1 className="text-lg font-bold">Ny session</h1>
      </header>

      <main className="px-4 py-4 max-w-lg mx-auto space-y-5">

        {/* Session type */}
        <section>
          <h2 className="text-xs font-semibold text-gray-500 uppercase mb-2">Spelform</h2>
          <div className="space-y-2">
            {SESSION_TYPES.map((t) => (
              <button key={t.value} onClick={() => { setSessionType(t.value); setSelectedRed([]); setSelectedBlue([]); }}
                className={`w-full text-left px-4 py-3 rounded-2xl shadow text-sm transition-colors ${sessionType === t.value ? "bg-green-700 text-white" : "bg-white text-gray-800"}`}>
                <p className="font-semibold">{t.label}</p>
                <p className={`text-xs mt-0.5 ${sessionType === t.value ? "text-green-100" : "text-gray-500"}`}>{t.desc}</p>
              </button>
            ))}
          </div>
        </section>

        {/* Optional name */}
        <section>
          <h2 className="text-xs font-semibold text-gray-500 uppercase mb-2">Sessionsnamn (valfritt)</h2>
          <input type="text" placeholder={`Ex. Dag 1 – ${SESSION_TYPES.find(t => t.value === sessionType)?.label}`}
            value={sessionName} onChange={(e) => setSessionName(e.target.value)}
            className="w-full bg-white border border-gray-200 rounded-2xl px-4 py-3 text-sm shadow focus:outline-none focus:ring-2 focus:ring-green-500" />
        </section>

        {/* Player pairing */}
        <section>
          <h2 className="text-xs font-semibold text-gray-500 uppercase mb-2">
            Para ihop spelare {maxPerSide === 1 ? "(1 mot 1)" : "(2 mot 2)"}
          </h2>

          <div className="grid grid-cols-2 gap-3 mb-3">
            {/* Red team */}
            <div>
              <p className="text-xs font-bold text-red-600 mb-1.5">RÖTT</p>
              <ul className="space-y-1.5">
                {teamRed.map((p) => {
                  const used = usedRed.has(p.user_id);
                  const sel = !!selectedRed.find((s) => s.user_id === p.user_id);
                  return (
                    <li key={p.user_id}>
                      <button
                        onClick={() => !used && toggleRed(p)}
                        disabled={used || (!sel && selectedRed.length >= maxPerSide)}
                        className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                          sel ? "bg-red-600 text-white" :
                          used ? "bg-gray-100 text-gray-400" :
                          "bg-red-50 text-red-800 hover:bg-red-100"
                        } disabled:opacity-40`}
                      >
                        {p.name}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
            {/* Blue team */}
            <div>
              <p className="text-xs font-bold text-blue-600 mb-1.5">BLÅTT</p>
              <ul className="space-y-1.5">
                {teamBlue.map((p) => {
                  const used = usedBlue.has(p.user_id);
                  const sel = !!selectedBlue.find((s) => s.user_id === p.user_id);
                  return (
                    <li key={p.user_id}>
                      <button
                        onClick={() => !used && toggleBlue(p)}
                        disabled={used || (!sel && selectedBlue.length >= maxPerSide)}
                        className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                          sel ? "bg-blue-600 text-white" :
                          used ? "bg-gray-100 text-gray-400" :
                          "bg-blue-50 text-blue-800 hover:bg-blue-100"
                        } disabled:opacity-40`}
                      >
                        {p.name}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          <button onClick={addMatch} disabled={!canAddMatch}
            className="w-full bg-green-700 text-white rounded-2xl py-2.5 text-sm font-semibold disabled:opacity-30">
            + Lägg till match
          </button>
        </section>

        {/* Pending matches */}
        {matches.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-gray-500 uppercase mb-2">Matcher ({matches.length})</h2>
            <ul className="space-y-2">
              {matches.map((m, i) => (
                <li key={i} className="bg-white rounded-2xl shadow px-4 py-3 flex items-center gap-2">
                  <span className="text-red-600 text-sm flex-1">{m.redPlayers.map((p) => p.name).join(" & ")}</span>
                  <span className="text-gray-400 text-xs">vs</span>
                  <span className="text-blue-600 text-sm flex-1 text-right">{m.bluePlayers.map((p) => p.name).join(" & ")}</span>
                  <button onClick={() => removeMatch(i)} className="text-gray-400 ml-2">×</button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <button onClick={save} disabled={saving || matches.length === 0}
          className="w-full bg-green-700 text-white rounded-2xl py-4 font-semibold text-base disabled:opacity-40">
          {saving ? "Sparar..." : `Spara session (${matches.length} match${matches.length !== 1 ? "er" : ""})`}
        </button>
      </main>
    </div>
  );
}
