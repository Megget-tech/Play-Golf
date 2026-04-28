"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const DEFAULT_PARS_18 = [4,4,3,4,5,3,4,5,4,4,4,3,5,4,3,5,4,4];
const DEFAULT_PARS_9  = [4,4,3,4,5,3,4,5,4];

export default function NewCoursePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [holesCount, setHolesCount] = useState(18);
  const [pars, setPars] = useState<number[]>(DEFAULT_PARS_18);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function changeHoleCount(n: number) {
    setHolesCount(n);
    setPars(n === 9 ? DEFAULT_PARS_9 : DEFAULT_PARS_18);
  }

  function setPar(i: number, val: number) {
    setPars((prev) => { const next = [...prev]; next[i] = val; return next; });
  }

  async function save() {
    if (!name.trim()) { setError("Ange banans namn."); return; }
    setSaving(true);
    const res = await fetch("/api/courses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        location: location.trim(),
        holes_count: holesCount,
        par_total: pars.reduce((a, b) => a + b, 0),
        holes: pars.map((par) => ({ par })),
      }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Något gick fel."); setSaving(false); return; }
    router.push(`/rounds/new?courseId=${data.id}&courseName=${encodeURIComponent(name.trim())}`);
  }

  return (
    <div className="min-h-screen bg-green-50">
      <header className="bg-green-800 text-white px-4 py-4">
        <button onClick={() => router.back()} className="text-sm opacity-75 mb-1">← Tillbaka</button>
        <h1 className="text-lg font-bold">Skapa bana manuellt</h1>
      </header>

      <main className="px-4 py-6 max-w-lg mx-auto space-y-6">
        <section className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase">Banans namn</label>
            <input
              type="text"
              placeholder="Ex. Lidingö GK"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full mt-1 bg-white border border-gray-200 rounded-2xl px-4 py-3 text-sm shadow focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase">Ort (valfritt)</label>
            <input
              type="text"
              placeholder="Ex. Stockholm"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full mt-1 bg-white border border-gray-200 rounded-2xl px-4 py-3 text-sm shadow focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase">Antal hål</label>
            <div className="flex gap-2 mt-1">
              {[9, 18].map((n) => (
                <button
                  key={n}
                  onClick={() => changeHoleCount(n)}
                  className={`flex-1 rounded-2xl py-2 text-sm font-semibold shadow ${
                    holesCount === n ? "bg-green-700 text-white" : "bg-white text-gray-700"
                  }`}
                >
                  {n} hål
                </button>
              ))}
            </div>
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-gray-500 uppercase">Par per hål</label>
            <span className="text-xs text-gray-400">Totalt: par {pars.reduce((a,b)=>a+b,0)}</span>
          </div>
          <div className="bg-white rounded-2xl shadow p-3 grid grid-cols-3 gap-2">
            {pars.map((par, i) => (
              <div key={i} className="flex items-center gap-1">
                <span className="text-xs text-gray-400 w-6">H{i+1}</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPar(i, Math.max(3, par - 1))}
                    className="w-7 h-7 rounded-lg bg-gray-100 text-gray-700 font-bold text-sm"
                  >−</button>
                  <span className="w-5 text-center text-sm font-bold">{par}</span>
                  <button
                    onClick={() => setPar(i, Math.min(5, par + 1))}
                    className="w-7 h-7 rounded-lg bg-green-100 text-green-800 font-bold text-sm"
                  >+</button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          onClick={save}
          disabled={saving}
          className="w-full bg-green-700 text-white rounded-2xl py-4 font-semibold text-base disabled:opacity-50"
        >
          {saving ? "Sparar..." : "Spara och välj bana ⛳"}
        </button>
      </main>
    </div>
  );
}
