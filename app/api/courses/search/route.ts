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

  // Fetch from golfcourseapi.com
  const apiKey = process.env.GOLF_COURSE_API_KEY;
  if (!apiKey) return NextResponse.json(cached ?? []);

  try {
    const res = await fetch(
      `https://api.golfcourseapi.com/v1/search?search_query=${encodeURIComponent(q)}`,
      { headers: { Authorization: `Key ${apiKey}` } }
    );
    if (!res.ok) return NextResponse.json([]);
    const json = await res.json();
    const courses = (json.courses ?? []).slice(0, 20).map((c: any) => ({
      name: c.club_name ?? c.course_name,
      location: [c.city, c.state, c.country].filter(Boolean).join(", "),
      holes_count: c.num_holes ?? 18,
      par_total: c.par ?? 72,
      external_id: String(c.id),
      source: "golfcourseapi",
    }));

    if (courses.length > 0) {
      const { data: inserted } = await supabase
        .from("courses")
        .upsert(courses, { onConflict: "external_id", ignoreDuplicates: false })
        .select("id, name, location, holes_count, par_total");
      return NextResponse.json(inserted ?? []);
    }
  } catch {}

  return NextResponse.json([]);
}
