import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest) {
  const { name, handicap_index, golf_id } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Namn krävs" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Ej inloggad" }, { status: 401 });

  const id = randomUUID();
  const { data, error } = await supabase
    .from("profiles")
    .insert({
      id,
      name: name.trim(),
      handicap_index: handicap_index ?? null,
      golf_id: golf_id?.trim() || null,
      is_guest: true,
    })
    .select("id, name, handicap_index")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
