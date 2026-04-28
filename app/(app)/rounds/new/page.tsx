"use client";
import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase";

const FORMATS = [
  { value: "stroke", label: "Slagspel", desc: "Räkna slag per runda" },
  { value: "scramble", label: "Scramble", desc: "Laget spelar från bästa bollen" },
  { value: "matchplay", label: "Match / Ryder Cup", desc: "Rött vs Blått lag, poängbaserat" },
];

function NewRoundInner() {
  const router = useRouter();
  const params = useSearchParams();
  const courseId = params.get("courseId") ?? "";
  const courseName = params.get("courseName") ?? "";

  const [format, setFormat] = useState("stroke");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  async function startRound() {
    if (!courseId || !userId) { setError("Välj en bana och logga in."); return; }
    setLoading(true);
    const supabase = createClient();
    const { data, error: err } = await supabase
      .from("rounds")
      .insert({ course_id: courseId, format, created_by: userId, date: new Date().toISOString().slice(0, 10) })
      .select("id")
      .single();
    if (err || !data) { setError(err?.message ?? "Något gick fel."); setLoading(false); return; }

    // Add creator as player
    await supabase.from("round_players").insert({ round_id: data.id, user_id: userId });
    router.push(`/rounds/${data.id}`);
  }

  return (
    <div className="min-h-screen bg-green-50">
      <header className="bg-green-800 text-white px-4 py-4">
        <button onClick={() => router.back()} className="text-sm opacity-75 mb-1">← Tillbaka</button>
        <h1 className="text-lg font-bold">Ny runda</h1>
      </header>

      <main className="px-4 py-6 max-w-lg mx-auto space-y-6">
        {/* Course */}
        <section>
          <h2 className="text-xs font-semibold text-gray-500 uppercase mb-2">Bana</h2>
          {courseName ? (
            <div className="bg-white rounded-2xl shadow px-4 py-3 flex items-center justify-between">
              <span className="font-semibold text-gray-800">{courseName}</span>
              <button
                onClick={() => router.push("/courses")}
                className="text-xs text-green-700 underline"
              >
                Ändra
              </button>
            </div>
          ) : (
            <button
              onClick={() => router.push("/courses")}
              className="w-full bg-white rounded-2xl shadow px-4 py-3 text-left text-green-700 font-medium text-sm"
            >
              + Välj bana →
            </button>
          )}
        </section>

        {/* Format */}
        <section>
          <h2 className="text-xs font-semibold text-gray-500 uppercase mb-2">Format</h2>
          <div className="space-y-2">
            {FORMATS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFormat(f.value)}
                className={`w-full rounded-2xl px-4 py-3 text-left shadow transition-colors ${
                  format === f.value
                    ? "bg-green-700 text-white"
                    : "bg-white text-gray-800"
                }`}
              >
                <p className="font-semibold text-sm">{f.label}</p>
                <p className={`text-xs mt-0.5 ${format === f.value ? "text-green-100" : "text-gray-500"}`}>
                  {f.desc}
                </p>
              </button>
            ))}
          </div>
        </section>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          onClick={startRound}
          disabled={loading || !courseId}
          className="w-full bg-green-700 text-white rounded-2xl py-4 font-semibold text-base hover:bg-green-800 disabled:opacity-50"
        >
          {loading ? "Startar..." : "Starta runda ⛳"}
        </button>
      </main>
    </div>
  );
}

export default function NewRoundPage() {
  return (
    <Suspense>
      <NewRoundInner />
    </Suspense>
  );
}
