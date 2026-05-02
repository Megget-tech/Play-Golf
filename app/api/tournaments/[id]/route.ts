import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Ej inloggad" }, { status: 401 });

  const { data: t } = await supabase.from("tournaments").select("created_by").eq("id", id).single();
  if (!t || t.created_by !== user.id) {
    return NextResponse.json({ error: "Ej behörig" }, { status: 403 });
  }

  // Get session IDs for this tournament
  const { data: sessions } = await supabase.from("ryder_cup_sessions").select("id").eq("tournament_id", id);
  const sessionIds = (sessions ?? []).map((s) => s.id);

  if (sessionIds.length > 0) {
    const { data: matches } = await supabase.from("ryder_cup_matches").select("id").in("session_id", sessionIds);
    const matchIds = (matches ?? []).map((m) => m.id);
    if (matchIds.length > 0) {
      await supabase.from("ryder_cup_hole_results").delete().in("match_id", matchIds);
    }
    await supabase.from("ryder_cup_matches").delete().in("session_id", sessionIds);
    await supabase.from("ryder_cup_sessions").delete().eq("tournament_id", id);
  }

  await supabase.from("ryder_cup_teams").delete().eq("tournament_id", id);
  // Unlink rounds instead of deleting them
  await supabase.from("rounds").update({ tournament_id: null }).eq("tournament_id", id);
  const { error } = await supabase.from("tournaments").delete().eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
