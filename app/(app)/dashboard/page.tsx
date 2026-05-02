"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";

type Round = { id: string; date: string; format: string; courses: { name: string } | null };

const FORMAT_LABEL: Record<string, string> = {
  stroke: "Slagspel", scramble: "Scramble", matchplay: "Match",
};

const SWIPE_THRESHOLD = 72;

function SwipeableRound({ round, onDelete }: { round: Round; onDelete: (id: string) => void }) {
  const [offsetX, setOffsetX] = useState(0);
  const [open, setOpen] = useState(false);
  const startX = useRef(0);
  const isDragging = useRef(false);

  function onTouchStart(e: React.TouchEvent) {
    startX.current = e.touches[0].clientX;
    isDragging.current = true;
  }
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
      <div className="absolute inset-y-0 right-0 w-18 flex items-center justify-end pr-2 bg-red-500 rounded-2xl">
        <button onClick={() => onDelete(round.id)} className="text-white text-sm font-semibold px-3 py-2">Radera</button>
      </div>
      <div
        className="relative bg-white shadow transition-transform touch-pan-y"
        style={{ transform: `translateX(${translateX}px)`, borderRadius: "1rem" }}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
        onClick={() => { if (open) { setOpen(false); setOffsetX(0); } }}
      >
        <Link
          href={open ? "#" : `/rounds/${round.id}`}
          onClick={(e) => { if (open) e.preventDefault(); }}
          className="flex items-center justify-between px-4 py-3"
        >
          <div>
            <p className="font-semibold text-sm text-gray-800">{round.courses?.name ?? "Okänd bana"}</p>
            <p className="text-xs text-gray-400">{FORMAT_LABEL[round.format] ?? round.format} · {new Date(round.date).toLocaleDateString("sv-SE")}</p>
          </div>
          <span className="text-gray-400">→</span>
        </Link>
      </div>
    </li>
  );
}

export default function DashboardPage() {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [name, setName] = useState("");
  const [hcp, setHcp] = useState<number | null>(null);
  const [totalRounds, setTotalRounds] = useState(0);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("name, handicap_index")
        .eq("id", user.id)
        .single();
      setName(profile?.name ?? "");
      setHcp(profile?.handicap_index ?? null);

      const { count } = await supabase
        .from("rounds")
        .select("*", { count: "exact", head: true })
        .eq("created_by", user.id);
      setTotalRounds(count ?? 0);

      const { data } = await supabase
        .from("rounds")
        .select("id, date, format, courses(name)")
        .eq("created_by", user.id)
        .order("created_at", { ascending: false })
        .limit(3);
      setRounds((data ?? []) as unknown as Round[]);
    }
    load();
  }, []);

  async function deleteRound(id: string) {
    if (!confirm("Radera rundan?")) return;
    const res = await fetch(`/api/rounds/${id}`, { method: "DELETE" });
    if (res.ok) setRounds((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <div className="min-h-screen bg-green-100">
      <header className="bg-green-800 text-white px-4 pt-4 pb-5">
        <div className="flex items-center justify-between mb-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/golfo-logo.png" alt="Golfo" className="h-9 w-auto" />
          {hcp !== null && (
            <div className="text-right">
              <p className="text-xs opacity-60">Handicap</p>
              <p className="text-2xl font-bold leading-tight">{hcp}</p>
            </div>
          )}
        </div>
        <p className="text-sm opacity-75">Välkommen tillbaka,</p>
        <p className="text-xl font-bold">{name || "Golfaren"}</p>
      </header>

      <main className="px-4 py-5 max-w-lg mx-auto space-y-5">
        {/* Quick actions */}
        <div className="grid grid-cols-2 gap-3">
          <Link href="/rounds/new"
            className="col-span-2 bg-green-700 text-white rounded-2xl shadow-md p-4 flex items-center gap-3 hover:bg-green-800 transition-colors">
            <span className="text-3xl">⛳</span>
            <div>
              <p className="font-bold text-base">Ny runda</p>
              <p className="text-xs opacity-80">Spela med kompisar</p>
            </div>
          </Link>
          <Link href="/tournaments/new"
            className="bg-white rounded-2xl shadow-md p-4 flex flex-col gap-1.5 hover:shadow-md transition-shadow">
            <span className="text-2xl">🏆</span>
            <p className="font-semibold text-gray-800 text-sm">Ny turnering</p>
            <p className="text-xs text-gray-500">Scramble, Ryder Cup</p>
          </Link>
          <Link href="/tournaments"
            className="bg-white rounded-2xl shadow-md p-4 flex flex-col gap-1.5 hover:shadow-md transition-shadow">
            <span className="text-2xl">📋</span>
            <p className="font-semibold text-gray-800 text-sm">Turneringar</p>
            <p className="text-xs text-gray-500">Dina aktiva tävlingar</p>
          </Link>
        </div>

        {/* Recent rounds */}
        {rounds.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-semibold text-gray-500 uppercase">Senaste rundor</h2>
              <p className="text-xs text-gray-400">Svajpa vänster för att radera</p>
            </div>
            <ul className="space-y-2">
              {rounds.map((r) => (
                <SwipeableRound key={r.id} round={r} onDelete={deleteRound} />
              ))}
            </ul>
            {totalRounds > 3 && (
              <Link href="/rounds"
                className="mt-3 flex items-center justify-center gap-1 text-sm text-green-700 font-semibold py-2">
                Se alla rundor ({totalRounds} st) →
              </Link>
            )}
          </section>
        )}

        {rounds.length === 0 && (
          <div className="text-center py-8">
            <p className="text-gray-400 text-sm">Inga rundor spelade ännu.</p>
            <Link href="/rounds/new" className="mt-3 inline-block text-green-700 font-semibold text-sm">Spela din första runda →</Link>
          </div>
        )}
      </main>
    </div>
  );
}
