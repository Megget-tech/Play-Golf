"use client";
import Link from "next/link";

const actions = [
  { href: "/rounds/new", label: "Ny runda", icon: "⛳", desc: "Spela en runda med kompisar" },
  { href: "/tournaments/new", label: "Ny turnering", icon: "🏆", desc: "Scramble, Ryder Cup m.m." },
  { href: "/courses", label: "Banor", icon: "🗺️", desc: "Sök och ladda ner banor" },
  { href: "/profile", label: "Min profil", icon: "👤", desc: "Handicap och statistik" },
];

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-green-50">
      <header className="bg-green-800 text-white px-4 py-4">
        <h1 className="text-xl font-bold">Play Golf</h1>
      </header>
      <main className="px-4 py-6 max-w-lg mx-auto">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Vad vill du göra?</h2>
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
      </main>
    </div>
  );
}
