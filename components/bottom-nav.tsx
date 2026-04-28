"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/dashboard", label: "Hem", icon: "🏠" },
  { href: "/courses", label: "Banor", icon: "🗺️" },
  { href: "/rounds/new", label: "Spela", icon: "⛳" },
  { href: "/profile", label: "Profil", icon: "👤" },
];

export default function BottomNav() {
  const path = usePathname();
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex z-50">
      {links.map((l) => {
        const active = path === l.href;
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`flex-1 flex flex-col items-center py-2 text-xs gap-0.5 ${
              active ? "text-green-700 font-semibold" : "text-gray-500"
            }`}
          >
            <span className="text-xl">{l.icon}</span>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
