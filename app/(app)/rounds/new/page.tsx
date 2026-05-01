"use client";
import { useEffect, useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase";

const FORMATS = [
  { value: "stroke", label: "Slagspel", desc: "Räkna slag per runda" },
  { value: "scramble", label: "Scramble", desc: "Laget spelar från bästa bollen" },
  { value: "matchplay", label: "Match / Ryder Cup", desc: "Rött vs Blått lag, poängbaserat" },
];

const TEE_COLORS: Record<string, string> = {
  red: "bg-red-500", yellow: "bg-yellow-400", blue: "bg-blue-500",
  white: "bg-white border border-gray-300", black: "bg-gray-900",
};

const DRAFT_KEY = "round_draft";

type Tee = { id: string; name: string; color: string | null; par_total: number | null; sort_order: number };
type Player = { id: string; name: string; handicap_index: number; team?: "red" | "blue" | null; tee_id?: string | null };

function NewRoundInner() {
  const router = useRouter();
  const params = useSearchParams();
  const courseId = params.get("courseId") ?? "";
  const courseName = params.get("courseName") ?? "";
  const tournamentId = params.get("tournamentId") ?? "";

  const [format, setFormat] = useState("stroke");
  const [startingHole, setStartingHole] = useState<1 | 10>(1);
  const [tees, setTees] = useState<Tee[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Player[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualHcp, setManualHcp] = useState("");
  const [manualGolfId, setManualGolfId] = useState("");
  const [manualLoading, setManualLoading] = useState(false);
  const [savedGuests, setSavedGuests] = useState<Player[]>([]);
  const [editingGuest, setEditingGuest] = useState<Player | null>(null);
  const [editName, setEditName] = useState("");
  const [editHcp, setEditHcp] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRestored = useRef(false);

  // ── Init: restore draft OR load current user ─────────────────────────────
  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      // Restore draft if it exists
      try {
        const raw = sessionStorage.getItem(DRAFT_KEY);
        if (raw) {
          const draft = JSON.parse(raw);
          if (draft.players?.length > 0) {
            setPlayers(draft.players);
            if (draft.format) setFormat(draft.format);
            if (draft.startingHole) setStartingHole(draft.startingHole);
            draftRestored.current = true;
          }
        }
      } catch {}

      if (!draftRestored.current) {
        const { data: profile } = await supabase.from("profiles").select("name, handicap_index").eq("id", user.id).single();
        if (profile) {
          setPlayers([{ id: user.id, name: profile.name, handicap_index: profile.handicap_index, tee_id: null }]);
        }
      }

      // Load previously added manual players
      const { data: guests } = await supabase
        .from("profiles")
        .select("id, name, handicap_index")
        .eq("is_guest", true)
        .eq("created_by", user.id)
        .order("name");
      setSavedGuests((guests ?? []) as Player[]);
    }
    init();
  }, []);

  // ── Persist draft to sessionStorage ──────────────────────────────────────
  useEffect(() => {
    if (players.length === 0) return;
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ players, format, startingHole }));
  }, [players, format, startingHole]);

  // ── Load tees for selected course ─────────────────────────────────────────
  useEffect(() => {
    if (!courseId) { setTees([]); return; }
    createClient()
      .from("course_tees")
      .select("id, name, color, par_total, sort_order")
      .eq("course_id", courseId)
      .order("sort_order")
      .then(({ data }) => setTees(data ?? []));
  }, [courseId]);

  // ── Player search ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (search.length < 2) { setSearchResults([]); return; }
    timer.current = setTimeout(async () => {
      const res = await fetch(`/api/players/search?q=${encodeURIComponent(search)}`);
      const data = await res.json();
      setSearchResults(data.filter((p: Player) => p.id !== userId && !players.find((x) => x.id === p.id)));
    }, 300);
  }, [search, userId, players]);

  function addPlayer(p: Player) {
    setPlayers((prev) => [...prev, { ...p, team: null, tee_id: null }]);
    setSearch(""); setSearchResults([]);
  }

  async function addManualPlayer() {
    if (!manualName.trim()) return;
    setManualLoading(true);
    const res = await fetch("/api/players/guest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: manualName.trim(),
        handicap_index: manualHcp ? parseFloat(manualHcp) : null,
        golf_id: manualGolfId.trim() || null,
      }),
    });
    const data = await res.json();
    if (data.id) {
      const newPlayer = { id: data.id, name: data.name, handicap_index: data.handicap_index, team: null, tee_id: null };
      setPlayers((prev) => [...prev, newPlayer]);
      setSavedGuests((prev) => [...prev, newPlayer].sort((a, b) => a.name.localeCompare(b.name)));
      setManualName(""); setManualHcp(""); setManualGolfId("");
      setShowManualForm(false);
    } else {
      setError(data.error ?? "Kunde inte lägga till spelaren.");
    }
    setManualLoading(false);
  }

  function startEditGuest(g: Player) {
    setEditingGuest(g);
    setEditName(g.name);
    setEditHcp(g.handicap_index != null ? String(g.handicap_index) : "");
  }

  async function saveEditGuest() {
    if (!editingGuest || !editName.trim()) return;
    setEditSaving(true);
    const res = await fetch(`/api/players/${editingGuest.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editName.trim(),
        handicap_index: editHcp ? parseFloat(editHcp) : null,
      }),
    });
    const data = await res.json();
    if (data.id) {
      const updated = { ...editingGuest, name: data.name, handicap_index: data.handicap_index };
      setSavedGuests((prev) => prev.map((g) => g.id === data.id ? updated : g).sort((a, b) => a.name.localeCompare(b.name)));
      // Also update if already added to the round
      setPlayers((prev) => prev.map((p) => p.id === data.id ? { ...p, name: data.name, handicap_index: data.handicap_index } : p));
    }
    setEditingGuest(null);
    setEditSaving(false);
  }

  function removePlayer(id: string) {
    if (id === userId) return;
    setPlayers((prev) => prev.filter((p) => p.id !== id));
  }
  function setTeam(id: string, team: "red" | "blue") {
    setPlayers((prev) => prev.map((p) => p.id === id ? { ...p, team } : p));
  }
  function setPlayerTee(id: string, teeId: string) {
    setPlayers((prev) => prev.map((p) => p.id === id ? { ...p, tee_id: teeId } : p));
  }

  function scrambleTeamInfo(team: "red" | "blue") {
    const label = team === "red" ? "Lag A" : "Lag B";
    const members = players.filter((p) => p.team === team);
    if (!members.length) return null;
    const hcps = members.map((p) => p.handicap_index ?? 0).sort((a, b) => a - b);
    let hcp = 0;
    if (hcps.length === 2) hcp = hcps[0] * 0.35 + hcps[1] * 0.15;
    else if (hcps.length === 3) hcp = hcps[0] * 0.25 + hcps[1] * 0.20 + hcps[2] * 0.10;
    else if (hcps.length === 4) hcp = hcps[0] * 0.20 + hcps[1] * 0.15 + hcps[2] * 0.10 + hcps[3] * 0.05;
    return { label, count: members.length, hcp: hcp.toFixed(1) };
  }

  async function startRound() {
    if (!courseId || !userId) { setError("Välj en bana och logga in."); return; }
    setLoading(true);
    const supabase = createClient();
    const { data, error: err } = await supabase
      .from("rounds")
      .insert({
        course_id: courseId, format, starting_hole: startingHole,
        created_by: userId, date: new Date().toISOString().slice(0, 10),
        tournament_id: tournamentId || null,
      })
      .select("id").single();
    if (err || !data) { setError(err?.message ?? "Något gick fel."); setLoading(false); return; }

    await Promise.all(players.map((p) =>
      fetch(`/api/rounds/${data.id}/players`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: p.id, team: p.team ?? null, tee_id: p.tee_id ?? null }),
      })
    ));

    sessionStorage.removeItem(DRAFT_KEY);
    router.push(`/rounds/${data.id}`);
  }

  const availableGuests = savedGuests.filter((g) => !players.find((p) => p.id === g.id));

  return (
    <div className="min-h-screen bg-green-50">
      <header className="bg-green-800 text-white px-4 py-4">
        <button onClick={() => router.back()} className="text-sm opacity-75 mb-1">← Tillbaka</button>
        <h1 className="text-lg font-bold">Ny runda</h1>
        {tournamentId && <p className="text-xs opacity-75 mt-0.5">Del av turnering</p>}
      </header>

      <main className="px-4 py-6 max-w-lg mx-auto space-y-6">
        {/* Course */}
        <section>
          <h2 className="text-xs font-semibold text-gray-500 uppercase mb-2">Bana</h2>
          {courseName ? (
            <div className="bg-white rounded-2xl shadow px-4 py-3 flex items-center justify-between">
              <span className="font-semibold text-gray-800">{courseName}</span>
              <button
                onClick={() => router.push(`/courses?returnTo=/rounds/new&courseId=${courseId}&courseName=${encodeURIComponent(courseName)}`)}
                className="text-xs text-green-700 underline"
              >
                Ändra
              </button>
            </div>
          ) : (
            <button onClick={() => router.push("/courses")} className="w-full bg-white rounded-2xl shadow px-4 py-3 text-left text-green-700 font-medium text-sm">
              + Välj bana →
            </button>
          )}
        </section>

        {/* Format */}
        <section>
          <h2 className="text-xs font-semibold text-gray-500 uppercase mb-2">Format</h2>
          <div className="space-y-2">
            {FORMATS.map((f) => (
              <button key={f.value} onClick={() => setFormat(f.value)}
                className={`w-full rounded-2xl px-4 py-3 text-left shadow transition-colors ${format === f.value ? "bg-green-700 text-white" : "bg-white text-gray-800"}`}>
                <p className="font-semibold text-sm">{f.label}</p>
                <p className={`text-xs mt-0.5 ${format === f.value ? "text-green-100" : "text-gray-500"}`}>{f.desc}</p>
              </button>
            ))}
          </div>
        </section>

        {/* Starting hole */}
        <section>
          <h2 className="text-xs font-semibold text-gray-500 uppercase mb-2">Starthål</h2>
          <div className="flex gap-2">
            {([1, 10] as const).map((h) => (
              <button key={h} onClick={() => setStartingHole(h)}
                className={`flex-1 rounded-2xl py-3 text-sm font-semibold shadow transition-colors ${startingHole === h ? "bg-green-700 text-white" : "bg-white text-gray-700"}`}>
                Hål {h}
              </button>
            ))}
          </div>
        </section>

        {/* Players */}
        <section>
          <h2 className="text-xs font-semibold text-gray-500 uppercase mb-2">Spelare</h2>
          <ul className="space-y-2 mb-3">
            {players.map((p) => (
              <li key={p.id} className="bg-white rounded-2xl shadow px-4 py-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-sm text-gray-800">
                      {p.name} {p.id === userId && <span className="text-xs text-gray-400">(du)</span>}
                    </p>
                    <p className="text-xs text-gray-400">HCP {p.handicap_index ?? "—"}</p>
                  </div>
                  {p.id !== userId && (
                    <button onClick={() => removePlayer(p.id)} className="text-gray-400 text-lg">×</button>
                  )}
                </div>

                {tees.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1.5">Tee</p>
                    <div className="flex flex-wrap gap-2">
                      {tees.map((t) => (
                        <button key={t.id} onClick={() => setPlayerTee(p.id, t.id)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                            p.tee_id === t.id ? "border-green-600 bg-green-50 text-green-800 shadow-sm" : "border-gray-200 bg-white text-gray-600"
                          }`}>
                          <span className={`w-3 h-3 rounded-full inline-block ${TEE_COLORS[t.color ?? ""] ?? "bg-gray-300"}`} />
                          {t.name}
                          {t.par_total && <span className="text-gray-400 font-normal">Par {t.par_total}</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {(format === "matchplay" || format === "scramble") && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1.5">{format === "matchplay" ? "Lag" : "Scramble-lag"}</p>
                    <div className="flex gap-2">
                      <button onClick={() => setTeam(p.id, "red")}
                        className={`flex-1 rounded-lg py-1.5 text-xs font-bold transition-colors ${p.team === "red" ? "bg-red-600 text-white" : "bg-red-50 text-red-600"}`}>
                        {format === "matchplay" ? "RÖTT" : "LAG A"}
                      </button>
                      <button onClick={() => setTeam(p.id, "blue")}
                        className={`flex-1 rounded-lg py-1.5 text-xs font-bold transition-colors ${p.team === "blue" ? "bg-blue-600 text-white" : "bg-blue-50 text-blue-600"}`}>
                        {format === "matchplay" ? "BLÅTT" : "LAG B"}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>

          {/* Scramble HCP summary */}
          {format === "scramble" && (["red", "blue"] as const).some((t) => players.some((p) => p.team === t)) && (
            <div className="bg-green-50 border border-green-200 rounded-2xl px-4 py-3 space-y-1 text-sm mb-3">
              {(["red", "blue"] as const).map((t) => {
                const info = scrambleTeamInfo(t);
                if (!info) return null;
                return (
                  <div key={t} className="flex items-center justify-between">
                    <span className="font-semibold text-gray-700">{info.label} · {info.count}-manna</span>
                    <span className="text-gray-500">Team HCP <span className="font-bold text-gray-800">{info.hcp}</span></span>
                  </div>
                );
              })}
              <p className="text-xs text-gray-400 pt-1">2-manna: 35%+15% · 4-manna: 20%+15%+10%+5%</p>
            </div>
          )}

          {/* Player search */}
          <div className="relative mb-2">
            <input type="search" placeholder="Sök registrerad spelare..." value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white border border-gray-200 rounded-2xl px-4 py-3 text-sm shadow focus:outline-none focus:ring-2 focus:ring-green-500" />
            {searchResults.length > 0 && (
              <ul className="absolute z-10 w-full bg-white rounded-2xl shadow-lg mt-1 overflow-hidden">
                {searchResults.map((p) => (
                  <li key={p.id}>
                    <button onClick={() => addPlayer(p)} className="w-full text-left px-4 py-3 hover:bg-green-50 text-sm">
                      <span className="font-semibold">{p.name}</span>
                      <span className="text-gray-400 ml-2">HCP {p.handicap_index}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Previously added manual players */}
          {(availableGuests.length > 0 || savedGuests.some((g) => players.find((p) => p.id === g.id))) && (
            <div className="mb-2">
              <p className="text-xs text-gray-500 mb-1.5">Sparade spelare</p>

              {/* Edit form */}
              {editingGuest && (
                <div className="bg-white border border-green-300 rounded-2xl px-4 py-3 space-y-2 mb-2 shadow-sm">
                  <p className="text-xs font-semibold text-gray-600">Redigera {editingGuest.name}</p>
                  <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
                    placeholder="Namn" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                  <input type="number" value={editHcp} onChange={(e) => setEditHcp(e.target.value)}
                    placeholder="HCP" step="0.1" min="0" max="54"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                  <div className="flex gap-2">
                    <button onClick={() => setEditingGuest(null)} className="flex-1 rounded-xl py-1.5 text-sm text-gray-500 bg-gray-100">Avbryt</button>
                    <button onClick={saveEditGuest} disabled={editSaving || !editName.trim()}
                      className="flex-1 rounded-xl py-1.5 text-sm font-semibold text-white bg-green-700 disabled:opacity-50">
                      {editSaving ? "Sparar..." : "Spara"}
                    </button>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {savedGuests.map((g) => {
                  const alreadyAdded = !!players.find((p) => p.id === g.id);
                  return (
                    <div key={g.id} className={`flex items-center gap-1 border rounded-xl text-xs font-medium shadow-sm transition-colors ${alreadyAdded ? "bg-green-50 border-green-300 text-green-800" : "bg-white border-gray-200 text-gray-700"}`}>
                      <button onClick={() => !alreadyAdded && addPlayer(g)} disabled={alreadyAdded}
                        className="pl-3 pr-1 py-1.5 flex items-center gap-1">
                        {!alreadyAdded && <span className="text-gray-400">+</span>}
                        {g.name}
                        {g.handicap_index != null && <span className="text-gray-400 font-normal ml-0.5">{g.handicap_index}</span>}
                      </button>
                      <button onClick={() => startEditGuest(g)} className="pr-2 py-1.5 text-gray-400 hover:text-gray-600" title="Redigera">✏</button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Manual player form */}
          {showManualForm ? (
            <div className="bg-white rounded-2xl shadow px-4 py-4 space-y-3">
              <p className="text-sm font-semibold text-gray-700">Ny spelare</p>
              <input type="text" placeholder="Namn *" value={manualName} onChange={(e) => setManualName(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              <div className="flex gap-2">
                <input type="number" placeholder="HCP (t.ex. 18.4)" value={manualHcp}
                  onChange={(e) => setManualHcp(e.target.value)} step="0.1" min="0" max="54"
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                <input type="text" placeholder="Golf-ID (valfritt)" value={manualGolfId}
                  onChange={(e) => setManualGolfId(e.target.value)}
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setShowManualForm(false); setManualName(""); setManualHcp(""); setManualGolfId(""); }}
                  className="flex-1 rounded-xl py-2 text-sm text-gray-600 bg-gray-100">Avbryt</button>
                <button onClick={addManualPlayer} disabled={manualLoading || !manualName.trim()}
                  className="flex-1 rounded-xl py-2 text-sm font-semibold text-white bg-green-700 disabled:opacity-50">
                  {manualLoading ? "Sparar..." : "Lägg till"}
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowManualForm(true)}
              className="w-full border border-dashed border-gray-300 rounded-2xl py-3 text-sm text-gray-500 hover:border-green-400 hover:text-green-700 transition-colors">
              + Lägg till ny spelare manuellt
            </button>
          )}
        </section>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button onClick={startRound} disabled={loading || !courseId}
          className="w-full bg-green-700 text-white rounded-2xl py-4 font-semibold text-base hover:bg-green-800 disabled:opacity-50">
          {loading ? "Startar..." : "Starta runda ⛳"}
        </button>
      </main>
    </div>
  );
}

export default function NewRoundPage() {
  return <Suspense><NewRoundInner /></Suspense>;
}
