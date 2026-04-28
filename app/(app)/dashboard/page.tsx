"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";

const actions = [
  { href: "/rounds/new", label: "Ny runda", icon: "⛳", desc: "Spela med kompisar" },
  { href: "/tournaments/new", label: "Ny turnering", icon: "🏆", desc: "Scramble, Ryder Cup m.m." },
  { href: "/courses", label: "Banor", icon: "🗺️", desc: "Sök och ladda ner banor" },
  { href: "/tournaments", label: "Turneringar", icon: "📋", desc: "Dina aktiva tävlingar" },
];

type Round = { id: string; date: string; format: string; courses: { name: string } | null };

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

  const FORMAT_LABEL: Record<string, string> = {
    stroke: "Slagspel", scramble: "Scramble", matchplay: "Match",
  };

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
            <ul className="space-y-2">
              {rounds.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/rounds/${r.id}`}
                    className="flex items-center justify-between bg-white rounded-2xl shadow px-4 py-3"
                  >
                    <div>
                      <p className="font-semibold text-sm text-gray-800">{r.courses?.name ?? "Okänd bana"}</p>
                      <p className="text-xs text-gray-400">{FORMAT_LABEL[r.format] ?? r.format} · {new Date(r.date).toLocaleDateString("sv-SE")}</p>
                    </div>
                    <span className="text-gray-400">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
