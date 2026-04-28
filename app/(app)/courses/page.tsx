"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";

type Course = { id: string; name: string; location: string; holes_count: number; par_total: number };

export default function CoursesPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Course[]>([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (query.length < 2) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      setLoading(true);
      const res = await fetch(`/api/courses/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setResults(data);
      setLoading(false);
    }, 400);
  }, [query]);

  return (
    <div className="min-h-screen bg-green-50">
      <header className="bg-green-800 text-white px-4 py-4 sticky top-0 z-10">
        <h1 className="text-lg font-bold mb-3">Sök golfbana</h1>
        <input
          type="search"
          placeholder="Ex. Bro Hof, Arlanda..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-xl px-4 py-2 text-gray-900 text-sm focus:outline-none"
          autoFocus
        />
      </header>

      <main className="px-4 py-4 max-w-lg mx-auto">
        {loading && <p className="text-sm text-gray-500 text-center py-8">Söker...</p>}

        {!loading && results.length === 0 && query.length >= 2 && (
          <div className="text-center py-8 space-y-3">
            <p className="text-sm text-gray-500">Inga banor hittades för "{query}".</p>
            <Link
              href="/courses/new"
              className="inline-block bg-green-700 text-white rounded-2xl px-5 py-2 text-sm font-medium"
            >
              + Skapa bana manuellt
            </Link>
          </div>
        )}

        {!loading && query.length < 2 && (
          <div className="text-center py-12 space-y-4">
            <p className="text-sm text-gray-400">Skriv minst 2 bokstäver för att söka bland svenska banor.</p>
            <Link
              href="/courses/new"
              className="inline-block border border-green-300 text-green-700 rounded-2xl px-5 py-2 text-sm font-medium"
            >
              + Skapa bana manuellt
            </Link>
          </div>
        )}

        <ul className="space-y-2">
          {results.map((c) => (
            <li key={c.id}>
              <Link
                href={`/rounds/new?courseId=${c.id}&courseName=${encodeURIComponent(c.name)}`}
                className="flex items-center justify-between bg-white rounded-2xl shadow px-4 py-3 hover:shadow-md transition-shadow"
              >
                <div>
                  <p className="font-semibold text-gray-800 text-sm">{c.name}</p>
                  <p className="text-xs text-gray-500">{c.location}</p>
                </div>
                <div className="text-right text-xs text-gray-500">
                  <p>{c.holes_count} hål</p>
                  <p>Par {c.par_total}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
