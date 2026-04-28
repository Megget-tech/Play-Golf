import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

async function searchOverpass(q: string) {
  const query = `[out:json][timeout:10];
area["ISO3166-1"="SE"]->.sweden;
(
  way["leisure"="golf_course"]["name"~"${q}",i](area.sweden);
  relation["leisure"="golf_course"]["name"~"${q}",i](area.sweden);
  node["leisure"="golf_course"]["name"~"${q}",i](area.sweden);
);
out tags center 20;`;

  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    body: `data=${encodeURIComponent(query)}`,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) return [];
  const json = await res.json();
  return (json.elements ?? []).map((e: any) => {
    const tags = e.tags ?? {};
    const center = e.center ?? {};
    const holes = parseInt(tags.holes ?? "") || 18;
    const par = parseInt(tags.par ?? "") || (holes === 9 ? 36 : 72);
    const city = tags["addr:city"] ?? tags["addr:county"] ?? "";
    return {
      name: tags.name ?? "Okänd bana",
      location: city,
      holes_count: holes,
      par_total: par,
      external_id: `osm_${e.type}_${e.id}`,
      source: "openstreetmap",
    };
  });
}

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

  try {
    const courses = await searchOverpass(q);
    if (courses.length === 0) return NextResponse.json([]);

    const { data: inserted } = await supabase
      .from("courses")
      .upsert(courses, { onConflict: "external_id" })
      .select("id, name, location, holes_count, par_total");

    return NextResponse.json(inserted ?? []);
  } catch (e) {
    console.error("Overpass error:", e);
    return NextResponse.json([]);
  }
}
