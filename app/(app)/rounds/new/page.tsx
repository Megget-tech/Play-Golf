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
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      const { data: profile } = await supabase.from("profiles").select("name, handicap_index").eq("id", user.id).single();
      if (profile) {
        setPlayers([{ id: user.id, name: profile.name, handicap_index: profile.handicap_index, tee_id: null }]);
      }
    }
    init();
  }, []);

  useEffect(() => {
    if (!courseId) { setTees([]); return; }
    createClient()
      .from("course_tees")
      .select("id, name, color, par_total, sort_order")
      .eq("course_id", courseId)
      .order("sort_order")
      .then(({ data }) => setTees(data ?? []));
  }, [courseId]);

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
    router.push(`/rounds/${data.id}`);
  }

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
              <button onClick={() => router.push("/courses")} className="text-xs text-green-700 underline">Ändra</button>
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
                    <p className="text-xs text-gray-400">HCP {p.handicap_index}</p>
                  </div>
                  {p.id !== userId && (
                    <button onClick={() => removePlayer(p.id)} className="text-gray-400 text-lg">×</button>
                  )}
                </div>

                {/* Tee selector — only if course has tees */}
                {tees.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1.5">Tee</p>
                    <div className="flex flex-wrap gap-2">
                      {tees.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => setPlayerTee(p.id, t.id)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                            p.tee_id === t.id
                              ? "border-green-600 bg-green-50 text-green-800 shadow-sm"
                              : "border-gray-200 bg-white text-gray-600"
                          }`}
                        >
                          <span className={`w-3 h-3 rounded-full inline-block ${TEE_COLORS[t.color ?? ""] ?? "bg-gray-300"}`} />
                          {t.name}
                          {t.par_total && <span className="text-gray-400 font-normal">Par {t.par_total}</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Matchplay team */}
                {format === "matchplay" && (
                  <div className="flex gap-2">
                    <button onClick={() => setTeam(p.id, "red")}
                      className={`flex-1 rounded-lg py-1 text-xs font-bold transition-colors ${p.team === "red" ? "bg-red-600 text-white" : "bg-red-50 text-red-600"}`}>
                      RÖTT
                    </button>
                    <button onClick={() => setTeam(p.id, "blue")}
                      className={`flex-1 rounded-lg py-1 text-xs font-bold transition-colors ${p.team === "blue" ? "bg-blue-600 text-white" : "bg-blue-50 text-blue-600"}`}>
                      BLÅTT
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>

          <div className="relative">
            <input type="search" placeholder="Sök spelare att bjuda in..." value={search}
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
