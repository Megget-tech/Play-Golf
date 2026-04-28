import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  if (q.length < 2) return NextResponse.json([]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, name, handicap_index")
    .ilike("name", `%${q}%`)
    .limit(10);
  return NextResponse.json(data ?? []);
}
