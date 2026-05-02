"use client";
import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

type Course = { id: string; name: string; location: string; holes_count: number; par_total: number };

function CoursesInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const returnTo = searchParams.get("returnTo") ?? "/rounds/new";

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Course[]>([]);
  const [loading, setLoading] = useState(false);
  const [recentCourses, setRecentCourses] = useState<Course[]>([]);
  const [favorites, setFavorites] = useState<Course[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [userId, setUserId] = useState<string | null>(null);
  const [pendingCourse, setPendingCourse] = useState<Course | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    async function loadUserData() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      // Fetch last 3 unique courses played
      const { data: roundsData } = await supabase
        .from("rounds")
        .select("course_id, courses(id, name, location, holes_count, par_total)")
        .eq("created_by", user.id)
        .order("created_at", { ascending: false })
        .limit(20);

      if (roundsData) {
        const seen = new Set<string>();
        const recent: Course[] = [];
        for (const r of roundsData as any[]) {
          const c = r.courses;
          if (c && !seen.has(c.id) && recent.length < 3) {
            seen.add(c.id);
            recent.push(c);
          }
        }
        setRecentCourses(recent);
      }

      // Fetch favorites
      const { data: favData } = await supabase
        .from("course_favorites")
        .select("course_id, courses(id, name, location, holes_count, par_total)")
        .eq("user_id", user.id);

      if (favData) {
        const favCourses = (favData as any[]).map((f) => f.courses).filter(Boolean);
        setFavorites(favCourses);
        setFavoriteIds(new Set(favCourses.map((c: Course) => c.id)));
      }
    }
    loadUserData();
  }, []);

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

  async function toggleFavorite(course: Course) {
    if (!userId) return;
    const supabase = createClient();
    const isFav = favoriteIds.has(course.id);
    if (isFav) {
      await supabase.from("course_favorites").delete().eq("user_id", userId).eq("course_id", course.id);
      setFavoriteIds((prev) => { const s = new Set(prev); s.delete(course.id); return s; });
      setFavorites((prev) => prev.filter((c) => c.id !== course.id));
    } else {
      await supabase.from("course_favorites").insert({ user_id: userId, course_id: course.id });
      setFavoriteIds((prev) => new Set([...prev, course.id]));
      setFavorites((prev) => [...prev, course]);
    }
  }

  function selectWithHole(course: Course, startingHole: number) {
    router.push(`${returnTo}?courseId=${course.id}&courseName=${encodeURIComponent(course.name)}&startingHole=${startingHole}`);
  }

  function CourseRow({ course }: { course: Course }) {
    const isPending = pendingCourse?.id === course.id;
    return (
      <li className="space-y-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPendingCourse(isPending ? null : course)}
            className="flex-1 flex items-center justify-between bg-white rounded-2xl shadow-md px-4 py-3 text-left hover:shadow-md transition-shadow"
          >
            <div>
              <p className="font-semibold text-gray-800 text-sm">{course.name}</p>
              <p className="text-xs text-gray-500">{course.location}</p>
            </div>
            <div className="text-right text-xs text-gray-500">
              <p>{course.holes_count} hål</p>
              <p>Par {course.par_total}</p>
            </div>
          </button>
          <button
            onClick={() => toggleFavorite(course)}
            className="text-xl leading-none px-1"
            aria-label={favoriteIds.has(course.id) ? "Ta bort favorit" : "Spara favorit"}
          >
            {favoriteIds.has(course.id) ? "★" : "☆"}
          </button>
        </div>
        {isPending && (
          <div className="bg-green-50 border border-green-200 rounded-2xl px-4 py-3">
            <p className="text-xs font-semibold text-gray-600 mb-2">Välj starthål</p>
            <div className="flex gap-2">
              {([1, 10] as const).map((h) => (
                <button
                  key={h}
                  onClick={() => selectWithHole(course, h)}
                  className="flex-1 bg-white border border-gray-200 rounded-xl py-2.5 text-sm font-semibold text-gray-700 hover:bg-green-700 hover:text-white hover:border-green-700 transition-colors shadow-sm"
                >
                  Hål {h}
                </button>
              ))}
            </div>
          </div>
        )}
      </li>
    );
  }

  const showDefault = query.length < 2;

  return (
    <div className="min-h-screen bg-green-100">
      <header className="bg-green-800 text-white px-4 py-4 sticky top-0 z-10">
        <h1 className="text-lg font-bold mb-3">Sök golfbana</h1>
        <input
          type="search"
          placeholder="Ex. Bro Hof, Arlanda..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-xl px-4 py-2 text-gray-900 text-sm focus:outline-none"
        />
      </header>

      <main className="px-4 py-4 max-w-lg mx-auto">
        {loading && <p className="text-sm text-gray-500 text-center py-8">Söker...</p>}

        {/* Default view: favorites + recent */}
        {showDefault && (
          <div className="space-y-6">
            {favorites.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-gray-500 uppercase mb-2">Favoriter ★</h2>
                <ul className="space-y-2">
                  {favorites.map((c) => <CourseRow key={c.id} course={c} />)}
                </ul>
              </section>
            )}

            {recentCourses.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-gray-500 uppercase mb-2">Senast spelade</h2>
                <ul className="space-y-2">
                  {recentCourses.map((c) => <CourseRow key={c.id} course={c} />)}
                </ul>
              </section>
            )}

            {favorites.length === 0 && recentCourses.length === 0 && (
              <p className="text-sm text-gray-400 text-center pt-8">Skriv minst 2 bokstäver för att söka bland svenska banor.</p>
            )}

            <div className="text-center pt-2">
              <button
                onClick={() => router.push("/courses/new")}
                className="inline-block border border-green-300 text-green-700 rounded-2xl px-5 py-2 text-sm font-medium"
              >
                + Skapa bana manuellt
              </button>
            </div>
          </div>
        )}

        {/* Search results */}
        {!showDefault && !loading && results.length === 0 && (
          <div className="text-center py-8 space-y-3">
            <p className="text-sm text-gray-500">Inga banor hittades för "{query}".</p>
            <button
              onClick={() => router.push("/courses/new")}
              className="inline-block bg-green-700 text-white rounded-2xl px-5 py-2 text-sm font-medium"
            >
              + Skapa bana manuellt
            </button>
          </div>
        )}

        {!showDefault && !loading && results.length > 0 && (
          <ul className="space-y-2">
            {results.map((c) => <CourseRow key={c.id} course={c} />)}
          </ul>
        )}
      </main>
    </div>
  );
}

export default function CoursesPage() {
  return <Suspense><CoursesInner /></Suspense>;
}
