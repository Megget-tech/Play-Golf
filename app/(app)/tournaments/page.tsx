"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";

type Tournament = { id: string; name: string; format: string; start_date: string | null };

const FORMAT_LABEL: Record<string, string> = {
  stroke: "Slagspel",
  scramble: "Scramble",
  matchplay: "Match / Ryder Cup",
};

export default function TournamentsPage() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    createClient()
      .from("tournaments")
      .select("id, name, format, start_date")
      .order("created_at", { ascending: false })
      .limit(30)
      .then(({ data }) => { setTournaments(data ?? []); setLoading(false); });
  }, []);

  return (
    <div className="min-h-screen bg-green-50">
      <header className="bg-green-800 text-white px-4 py-4 flex items-center justify-between">
        <h1 className="text-lg font-bold">Turneringar</h1>
        <Link href="/tournaments/new" className="bg-white text-green-800 rounded-xl px-3 py-1 text-sm font-semibold">
          + Ny
        </Link>
      </header>
      <main className="px-4 py-4 max-w-lg mx-auto">
        {loading && <p className="text-center text-gray-400 py-12">Laddar...</p>}
        {!loading && tournaments.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500 mb-4">Inga turneringar än.</p>
            <Link href="/tournaments/new" className="bg-green-700 text-white rounded-2xl px-6 py-2 text-sm font-medium">
              Skapa din första turnering
            </Link>
          </div>
        )}
        <ul className="space-y-2">
          {tournaments.map((t) => (
            <li key={t.id}>
              <Link
                href={`/tournaments/${t.id}`}
                className="flex items-center justify-between bg-white rounded-2xl shadow px-4 py-3 hover:shadow-md transition-shadow"
              >
                <div>
                  <p className="font-semibold text-gray-800">{t.name}</p>
                  <p className="text-xs text-gray-500">{FORMAT_LABEL[t.format] ?? t.format}</p>
                </div>
                {t.start_date && (
                  <p className="text-xs text-gray-400">{new Date(t.start_date).toLocaleDateString("sv-SE")}</p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
