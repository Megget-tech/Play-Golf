import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Ej inloggad" }, { status: 401 });

  // Verify ownership
  const { data: round } = await supabase.from("rounds").select("created_by").eq("id", id).single();
  if (!round || round.created_by !== user.id) {
    return NextResponse.json({ error: "Ej behörig" }, { status: 403 });
  }

  // Delete in dependency order
  await supabase.from("scores").delete().eq("round_id", id);
  await supabase.from("round_players").delete().eq("round_id", id);
  const { error } = await supabase.from("rounds").delete().eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
