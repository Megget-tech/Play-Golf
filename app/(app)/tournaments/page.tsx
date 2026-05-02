"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";

type Tournament = { id: string; name: string; format: string; start_date: string | null };

const FORMAT_LABEL: Record<string, string> = {
  stroke: "Slagspel",
  scramble: "Scramble",
  ryder_cup: "Ryder Cup",
  matchplay: "Match / Ryder Cup",
};

const SWIPE_THRESHOLD = 80;

function SwipeableTournament({ t, onDelete }: { t: Tournament; onDelete: (id: string) => void }) {
  const [offsetX, setOffsetX] = useState(0);
  const [open, setOpen] = useState(false);
  const startX = useRef(0);
  const isDragging = useRef(false);

  function onTouchStart(e: React.TouchEvent) { startX.current = e.touches[0].clientX; isDragging.current = true; }
  function onTouchMove(e: React.TouchEvent) {
    if (!isDragging.current) return;
    const dx = e.touches[0].clientX - startX.current;
    setOffsetX(open ? Math.min(0, -SWIPE_THRESHOLD + dx) : Math.min(0, dx));
  }
  function onTouchEnd() {
    isDragging.current = false;
    if (open) {
      if (offsetX > -SWIPE_THRESHOLD / 2) { setOpen(false); setOffsetX(0); }
      else { setOpen(true); setOffsetX(-SWIPE_THRESHOLD); }
    } else {
      if (offsetX < -SWIPE_THRESHOLD / 2) { setOpen(true); setOffsetX(-SWIPE_THRESHOLD); }
      else { setOpen(false); setOffsetX(0); }
    }
  }

  const translateX = open && offsetX === 0 ? -SWIPE_THRESHOLD : offsetX;

  return (
    <li className="relative overflow-hidden rounded-2xl">
      <div className="absolute inset-y-0 right-0 w-20 flex items-center justify-end pr-2 bg-red-500 rounded-2xl">
        <button onClick={() => onDelete(t.id)} className="text-white text-sm font-semibold px-3 py-2">Radera</button>
      </div>
      <div
        className="relative bg-white shadow-md transition-transform touch-pan-y"
        style={{ transform: `translateX(${translateX}px)`, borderRadius: "1rem" }}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
        onClick={() => { if (open) { setOpen(false); setOffsetX(0); } }}
      >
        <Link
          href={open ? "#" : `/tournaments/${t.id}`}
          onClick={(e) => { if (open) e.preventDefault(); }}
          className="flex items-center justify-between px-4 py-3"
        >
          <div>
            <p className="font-semibold text-gray-800">{t.name}</p>
            <p className="text-xs text-gray-500">{FORMAT_LABEL[t.format] ?? t.format}</p>
          </div>
          <div className="flex items-center gap-3">
            {t.start_date && <p className="text-xs text-gray-400">{new Date(t.start_date).toLocaleDateString("sv-SE")}</p>}
            <span className="text-gray-400">→</span>
          </div>
        </Link>
      </div>
    </li>
  );
}

export default function TournamentsPage() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const { data } = await supabase
        .from("tournaments")
        .select("id, name, format, start_date")
        .eq("created_by", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      setTournaments(data ?? []);
      setLoading(false);
    }
    load();
  }, []);

  async function deleteTournament(id: string) {
    if (!confirm("Radera turneringen och all dess data?")) return;
    const res = await fetch(`/api/tournaments/${id}`, { method: "DELETE" });
    if (res.ok) setTournaments((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <div className="min-h-screen bg-green-100">
      <header className="bg-green-800 text-white px-4 py-4 flex items-center justify-between">
        <h1 className="text-lg font-bold">Turneringar</h1>
        <Link href="/tournaments/new" className="bg-white text-green-800 rounded-xl px-3 py-1.5 text-sm font-semibold">
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
        {!loading && tournaments.length > 0 && (
          <>
            <p className="text-xs text-gray-500 mb-2">Svajpa vänster för att radera</p>
            <ul className="space-y-2">
              {tournaments.map((t) => (
                <SwipeableTournament key={t.id} t={t} onDelete={deleteTournament} />
              ))}
            </ul>
          </>
        )}
      </main>
    </div>
  );
}
