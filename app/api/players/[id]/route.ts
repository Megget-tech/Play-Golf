import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { name, handicap_index, golf_id } = await req.json();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Ej inloggad" }, { status: 401 });

  // Only allow editing guest profiles created by this user
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_guest, created_by")
    .eq("id", id)
    .single();

  if (!profile?.is_guest || profile.created_by !== user.id) {
    return NextResponse.json({ error: "Ej behörig" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({
      ...(name?.trim() && { name: name.trim() }),
      handicap_index: handicap_index ?? null,
      ...(golf_id !== undefined && { golf_id: golf_id?.trim() || null }),
    })
    .eq("id", id)
    .select("id, name, handicap_index")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
