import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user_id, team } = await req.json();
  const supabase = await createClient();
  const { error } = await supabase
    .from("round_players")
    .upsert({ round_id: id, user_id, team: team ?? null }, { onConflict: "round_id,user_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
