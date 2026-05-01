"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";

const actions = [
  { href: "/rounds/new", label: "Ny runda", icon: "⛳", desc: "Spela med kompisar" },
  { href: "/tournaments/new", label: "Ny turnering", icon: "🏆", desc: "Scramble, Ryder Cup m.m." },
  { href: "/courses", label: "Banor", icon: "🗺️", desc: "Sök och ladda ner banor" },
  { href: "/tournaments", label: "Turneringar", icon: "📋", desc: "Dina aktiva tävlingar" },
];

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
    if (open) {
      setOffsetX(Math.min(0, -SWIPE_THRESHOLD + dx));
    } else {
      setOffsetX(Math.min(0, dx));
    }
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
      {/* Delete button behind */}
      <div className="absolute inset-y-0 right-0 w-18 flex items-center justify-end pr-2 bg-red-500 rounded-2xl">
        <button
          onClick={() => onDelete(round.id)}
          className="text-white text-sm font-semibold px-3 py-2"
        >
          Radera
        </button>
      </div>

      {/* Card */}
      <div
        className="relative bg-white shadow transition-transform touch-pan-y"
        style={{ transform: `translateX(${translateX}px)`, borderRadius: "1rem" }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
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

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase.from("profiles").select("name").eq("id", user.id).single();
      setName(profile?.name ?? "");

      const { data } = await supabase
        .from("rounds")
        .select("id, date, format, courses(name)")
        .eq("created_by", user.id)
        .order("created_at", { ascending: false })
        .limit(5);
      setRounds((data ?? []) as unknown as Round[]);
    }
    load();
  }, []);

  async function deleteRound(id: string) {
    if (!confirm("Radera rundan?")) return;
    const res = await fetch(`/api/rounds/${id}`, { method: "DELETE" });
    if (res.ok) {
      setRounds((prev) => prev.filter((r) => r.id !== id));
    }
  }

  return (
    <div className="min-h-screen bg-green-50">
      <header className="bg-green-800 text-white px-4 py-5">
        <p className="text-sm opacity-75">Välkommen tillbaka,</p>
        <h1 className="text-2xl font-bold">{name || "Golfaren"} ⛳</h1>
      </header>

      <main className="px-4 py-5 max-w-lg mx-auto space-y-6">
        <div className="grid grid-cols-2 gap-3">
          {actions.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="bg-white rounded-2xl shadow p-4 flex flex-col gap-2 hover:shadow-md transition-shadow"
            >
              <span className="text-3xl">{a.icon}</span>
              <span className="font-semibold text-gray-800 text-sm">{a.label}</span>
              <span className="text-xs text-gray-500">{a.desc}</span>
            </Link>
          ))}
        </div>

        {rounds.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-gray-500 uppercase mb-2">Senaste rundor</h2>
            <p className="text-xs text-gray-400 mb-2">Svajpa vänster för att radera</p>
            <ul className="space-y-2">
              {rounds.map((r) => (
                <SwipeableRound key={r.id} round={r} onDelete={deleteRound} />
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
