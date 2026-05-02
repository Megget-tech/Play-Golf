"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

type Round = { id: string; date: string; format: string; courses: { name: string } | null };

const FORMAT_LABEL: Record<string, string> = {
  stroke: "Slagspel", scramble: "Scramble", matchplay: "Match",
  poangbogey: "Poängbogey", skins: "Skins", wolf: "Wolf", kopenhamnare: "Köpenhamnare",
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("sv-SE", { day: "numeric", month: "short", year: "numeric" });
}

export default function RoundsPage() {
  const router = useRouter();
  const [rounds, setRounds] = useState<Round[]>([]);
  const [hcp, setHcp] = useState<number | null>(null);
  const [hcpLastMonth, setHcpLastMonth] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("handicap_index")
        .eq("id", user.id)
        .single();
      setHcp(profile?.handicap_index ?? null);

      // Try to get HCP from a month ago (if handicap_log table exists)
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
      const { data: hcpLog } = await supabase
        .from("handicap_log")
        .select("handicap_index, logged_at")
        .eq("user_id", user.id)
        .lte("logged_at", oneMonthAgo.toISOString())
        .order("logged_at", { ascending: false })
        .limit(1);
      if (hcpLog && hcpLog.length > 0) {
        setHcpLastMonth(hcpLog[0].handicap_index);
      }

      const { data } = await supabase
        .from("rounds")
        .select("id, date, format, courses(name)")
        .eq("created_by", user.id)
        .order("date", { ascending: false });
      setRounds((data ?? []) as unknown as Round[]);
      setLoading(false);
    }
    load();
  }, []);

  const now = new Date();
  const seasonStart = new Date(`${now.getFullYear()}-04-01`);
  const summerStart = new Date(`${now.getFullYear()}-06-01`);
  const roundsThisSeason = rounds.filter((r) => new Date(r.date) >= seasonStart).length;
  const roundsThisSummer = rounds.filter((r) => new Date(r.date) >= summerStart).length;
  const hcpDiff = hcp !== null && hcpLastMonth !== null ? +(hcp - hcpLastMonth).toFixed(1) : null;

  // Group rounds by year+month for display
  const grouped: { label: string; items: Round[] }[] = [];
  for (const r of rounds) {
    const d = new Date(r.date);
    const label = d.toLocaleDateString("sv-SE", { month: "long", year: "numeric" });
    const last = grouped[grouped.length - 1];
    if (last && last.label === label) last.items.push(r);
    else grouped.push({ label, items: [r] });
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">Laddar...</div>;

  return (
    <div className="min-h-screen bg-green-100 pb-8">
      <header className="bg-green-800 text-white px-4 py-4">
        <button onClick={() => router.back()} className="text-sm opacity-75 mb-1">← Tillbaka</button>
        <h1 className="text-lg font-bold">Alla rundor</h1>
      </header>

      <main className="px-4 py-4 max-w-lg mx-auto space-y-5">

        {/* Stats */}
        <section>
          <h2 className="text-xs font-semibold text-gray-500 uppercase mb-2">Statistik</h2>

          {/* HCP card */}
          <div className="bg-green-700 text-white rounded-2xl shadow-md px-5 py-4 mb-3 flex items-center justify-between">
            <div>
              <p className="text-xs opacity-75 mb-0.5">Aktuellt handicap</p>
              <p className="text-4xl font-bold">{hcp ?? "—"}</p>
            </div>
            {hcpDiff !== null ? (
              <div className="text-right">
                <p className="text-xs opacity-75 mb-0.5">Senaste månaden</p>
                <p className={`text-2xl font-bold ${hcpDiff < 0 ? "text-green-300" : hcpDiff > 0 ? "text-red-300" : "text-white"}`}>
                  {hcpDiff > 0 ? `+${hcpDiff}` : hcpDiff === 0 ? "±0" : hcpDiff}
                </p>
              </div>
            ) : (
              <div className="text-right opacity-60">
                <p className="text-xs">Förändring</p>
                <p className="text-sm mt-0.5">spåras ej</p>
              </div>
            )}
          </div>

          {/* Small stat cards */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-white rounded-2xl shadow-md px-3 py-4 text-center">
              <p className="text-2xl font-bold text-gray-800">{roundsThisSummer}</p>
              <p className="text-xs text-gray-500 mt-1 leading-tight">Rundor<br/>i sommar</p>
            </div>
            <div className="bg-white rounded-2xl shadow-md px-3 py-4 text-center">
              <p className="text-2xl font-bold text-gray-800">{roundsThisSeason}</p>
              <p className="text-xs text-gray-500 mt-1 leading-tight">Denna<br/>säsong</p>
            </div>
            <div className="bg-white rounded-2xl shadow-md px-3 py-4 text-center">
              <p className="text-2xl font-bold text-gray-800">{rounds.length}</p>
              <p className="text-xs text-gray-500 mt-1 leading-tight">Totalt<br/>spelade</p>
            </div>
          </div>
        </section>

        {/* Round list grouped by month */}
        {grouped.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-gray-400">Inga rundor spelade ännu.</p>
            <Link href="/rounds/new" className="mt-3 inline-block text-green-700 font-semibold text-sm">
              Starta en runda →
            </Link>
          </div>
        ) : (
          <section className="space-y-4">
            {grouped.map((group) => (
              <div key={group.label}>
                <h2 className="text-xs font-semibold text-gray-500 uppercase mb-2 capitalize">{group.label}</h2>
                <ul className="space-y-2">
                  {group.items.map((r) => (
                    <li key={r.id}>
                      <Link
                        href={`/rounds/${r.id}`}
                        className="flex items-center justify-between bg-white rounded-2xl shadow-md px-4 py-3 hover:shadow-md transition-shadow"
                      >
                        <div>
                          <p className="font-semibold text-sm text-gray-800">{r.courses?.name ?? "Okänd bana"}</p>
                          <p className="text-xs text-gray-400">
                            {FORMAT_LABEL[r.format] ?? r.format} · {formatDate(r.date)}
                          </p>
                        </div>
                        <span className="text-gray-400 text-sm">→</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        )}
      </main>
    </div>
  );
}
