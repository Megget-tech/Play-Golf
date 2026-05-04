"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

export default function GuestSetupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [hcp, setHcp] = useState("");
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    createClient().auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push("/login"); return; }
      setUserId(user.id);
    });
  }, []);

  async function save() {
    if (!userId || !name.trim()) return;
    setLoading(true);
    const supabase = createClient();
    const hcpVal = hcp ? parseFloat(hcp.replace(",", ".")) : null;
    await supabase.from("profiles").upsert({
      id: userId,
      name: name.trim(),
      handicap_index: hcpVal !== null && !isNaN(hcpVal) ? Math.min(54, Math.max(0, hcpVal)) : null,
    });
    router.push("/dashboard");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-green-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-8">
        <h1 className="text-xl font-bold text-green-800 mb-1">Välkommen!</h1>
        <p className="text-sm text-gray-500 mb-6">Vad ska vi kalla dig?</p>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Namn</label>
            <input
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
              placeholder="Ditt namn"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Handicap <span className="text-gray-400 font-normal">(valfritt)</span>
            </label>
            <input
              type="number"
              min="0"
              max="54"
              step="0.1"
              value={hcp}
              onChange={(e) => setHcp(e.target.value)}
              placeholder="Ex. 18.4"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <button
            onClick={save}
            disabled={loading || !name.trim()}
            className="w-full bg-green-700 text-white rounded-lg py-2 text-sm font-medium hover:bg-green-800 disabled:opacity-50"
          >
            {loading ? "Sparar..." : "Kom igång ⛳"}
          </button>
          <button
            onClick={() => router.push("/dashboard")}
            className="w-full text-sm text-gray-400 py-1"
          >
            Hoppa över
          </button>
        </div>
      </div>
    </div>
  );
}
