"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

const FORMATS = [
  { value: "stroke", label: "Slagspel", desc: "Lägst total score vinner" },
  { value: "scramble", label: "Scramble", desc: "Laget spelar från bästa bollen" },
  { value: "ryder_cup", label: "Ryder Cup", desc: "Foursomes, fyrboll och singel — poäng per match" },
];

export default function NewTournamentPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [format, setFormat] = useState("stroke");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  async function create() {
    if (!name.trim() || !userId) return;
    setLoading(true);
    setError("");
    const supabase = createClient();
    const { data, error: err } = await supabase
      .from("tournaments")
      .insert({ name: name.trim(), format, start_date: date, created_by: userId })
      .select("id")
      .single();
    if (err || !data) { setError(err?.message ?? "Något gick fel."); setLoading(false); return; }
    router.push(`/tournaments/${data.id}`);
  }

  return (
    <div className="min-h-screen bg-green-50">
      <header className="bg-green-800 text-white px-4 py-4">
        <button onClick={() => router.back()} className="text-sm opacity-75 mb-1">← Tillbaka</button>
        <h1 className="text-lg font-bold">Ny turnering</h1>
      </header>
      <main className="px-4 py-6 max-w-lg mx-auto space-y-6">
        <section>
          <h2 className="text-xs font-semibold text-gray-500 uppercase mb-2">Namn</h2>
          <input
            type="text"
            placeholder="Ex. Fredagstävlingen, Ryder Cup 2025..."
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-white border border-gray-200 rounded-2xl px-4 py-3 text-sm shadow focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </section>

        <section>
          <h2 className="text-xs font-semibold text-gray-500 uppercase mb-2">Format</h2>
          <div className="space-y-2">
            {FORMATS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFormat(f.value)}
                className={`w-full rounded-2xl px-4 py-3 text-left shadow transition-colors ${
                  format === f.value ? "bg-green-700 text-white" : "bg-white text-gray-800"
                }`}
              >
                <p className="font-semibold text-sm">{f.label}</p>
                <p className={`text-xs mt-0.5 ${format === f.value ? "text-green-100" : "text-gray-500"}`}>{f.desc}</p>
              </button>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-xs font-semibold text-gray-500 uppercase mb-2">Datum</h2>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full bg-white border border-gray-200 rounded-2xl px-4 py-3 text-sm shadow focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </section>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          onClick={create}
          disabled={loading || !name.trim()}
          className="w-full bg-green-700 text-white rounded-2xl py-4 font-semibold text-base hover:bg-green-800 disabled:opacity-50"
        >
          {loading ? "Skapar..." : "Skapa turnering 🏆"}
        </button>
      </main>
    </div>
  );
}
