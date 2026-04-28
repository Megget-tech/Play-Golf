import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  if (!q || q.length < 2) return NextResponse.json([]);

  const supabase = await createClient();

  // Check cache first
  const { data: cached } = await supabase
    .from("courses")
    .select("id, name, location, holes_count, par_total")
    .ilike("name", `%${q}%`)
    .limit(20);

  if (cached && cached.length > 0) return NextResponse.json(cached);

  const apiKey = process.env.GOLF_COURSE_API_KEY;
  if (!apiKey) return NextResponse.json([]);

  try {
    const res = await fetch(
      `https://api.golfcourseapi.com/v1/search?search_query=${encodeURIComponent(q)}`,
      { headers: { Authorization: `Key ${apiKey}` } }
    );
    if (!res.ok) return NextResponse.json([]);
    const json = await res.json();
    const raw: any[] = json.courses ?? [];
    if (raw.length === 0) return NextResponse.json([]);

    const courses = raw.slice(0, 20).map((c: any) => {
      const loc = c.location ?? {};
      const tees = c.tees?.male ?? c.tees?.female ?? [];
      const firstTee = tees[0] ?? {};
      const holes: { par: number; yardage?: number }[] = firstTee.holes ?? [];
      const parTotal = firstTee.par_total ?? (holes.reduce((s: number, h: any) => s + (h.par ?? 4), 0) || 72);
      const holesCount = firstTee.number_of_holes ?? (holes.length || 18);

      return {
        name: c.club_name ?? c.course_name ?? "Okänd bana",
        location: [loc.city, loc.state, loc.country].filter(Boolean).join(", "),
        holes_count: holesCount,
        par_total: parTotal,
        external_id: String(c.id),
        source: "golfcourseapi",
        _holes: holes.map((h: any, i: number) => ({
          hole_number: i + 1,
          par: h.par ?? 4,
          distance_m: h.yardage ? Math.round(h.yardage * 0.9144) : null,
        })),
      };
    });

    const { data: inserted, error } = await supabase
      .from("courses")
      .upsert(
        courses.map(({ _holes, ...c }) => c),
        { onConflict: "external_id" }
      )
      .select("id, name, location, holes_count, par_total, external_id");

    if (inserted && inserted.length > 0) {
      // Save hole data for each course
      const holeRows = inserted.flatMap((course) => {
        const match = courses.find((c) => c.external_id === course.external_id);
        return (match?._holes ?? []).map((h: any) => ({ course_id: course.id, ...h }));
      });
      if (holeRows.length > 0) {
        await supabase.from("holes").upsert(holeRows, { onConflict: "course_id,hole_number" });
      }
      return NextResponse.json(inserted);
    }
  } catch (e) {
    console.error("Golf API error:", e);
  }

  return NextResponse.json([]);
}
