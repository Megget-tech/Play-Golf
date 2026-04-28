import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  const { name, location, holes_count, par_total, holes } = await req.json();
  if (!name || !holes_count) return NextResponse.json({ error: "Saknar namn eller hålantal" }, { status: 400 });

  const supabase = await createClient();
  const { data: course, error } = await supabase
    .from("courses")
    .insert({ name, location: location ?? "", holes_count, par_total: par_total ?? 72, source: "manual" })
    .select("id")
    .single();

  if (error || !course) return NextResponse.json({ error: error?.message }, { status: 400 });

  if (holes && holes.length > 0) {
    await supabase.from("holes").insert(
      holes.map((h: any, i: number) => ({
        course_id: course.id,
        hole_number: i + 1,
        par: h.par ?? 4,
        stroke_index: h.stroke_index ?? null,
      }))
    );
  }

  return NextResponse.json({ id: course.id });
}
