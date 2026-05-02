"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

type Profile = { name: string; handicap_index: number; golf_id: string | null; avatar_url: string | null };

export default function ProfilePage() {
  const router = useRouter();
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [rounds, setRounds] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [handicap, setHandicap] = useState("");
  const [golfId, setGolfId] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      setUserId(user.id);
      const { data } = await supabase
        .from("profiles")
        .select("name, handicap_index, golf_id, avatar_url")
        .eq("id", user.id)
        .single();
      if (data) {
        setProfile(data);
        setHandicap(String(data.handicap_index ?? ""));
        setGolfId(data.golf_id ?? "");
      }
      const { count } = await supabase
        .from("rounds")
        .select("*", { count: "exact", head: true })
        .eq("created_by", user.id);
      setRounds(count ?? 0);
    }
    load();
  }, []);

  async function saveProfile() {
    if (!userId) return;
    setSaving(true);
    const hcp = parseFloat(handicap.replace(",", "."));
    await supabase.from("profiles").update({
      handicap_index: isNaN(hcp) ? 54.0 : Math.min(54, Math.max(0, hcp)),
      golf_id: golfId.trim() || null,
    }).eq("id", userId);
    const { data } = await supabase.from("profiles").select("name, handicap_index, golf_id, avatar_url").eq("id", userId).single();
    setProfile(data);
    setSaving(false);
    setEditing(false);
  }

  async function uploadAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${userId}/avatar.${ext}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
      await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("id", userId);
      setProfile((p) => p ? { ...p, avatar_url: publicUrl } : p);
    }
    setUploading(false);
  }

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div className="min-h-screen bg-green-100">
      <header className="bg-green-800 text-white px-4 py-4">
        <h1 className="text-lg font-bold">Min profil</h1>
      </header>

      <main className="px-4 py-6 max-w-lg mx-auto space-y-4">
        {profile ? (
          <>
            {/* Avatar */}
            <div className="bg-white rounded-2xl shadow-md px-4 py-5 flex flex-col items-center gap-3">
              <div className="relative">
                {profile.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt="Profilbild"
                    className="w-20 h-20 rounded-full object-cover border-4 border-green-100"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center text-4xl">
                    👤
                  </div>
                )}
                <button
                  onClick={() => fileRef.current?.click()}
                  className="absolute bottom-0 right-0 bg-green-700 text-white rounded-full w-7 h-7 flex items-center justify-center text-sm shadow"
                >
                  {uploading ? "…" : "✎"}
                </button>
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={uploadAvatar} />
              <h2 className="text-xl font-bold text-gray-800">{profile.name}</h2>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-2xl shadow-md px-4 py-4 text-center">
                <p className="text-3xl font-bold text-green-700">{profile.handicap_index}</p>
                <p className="text-xs text-gray-500 mt-1">Handicap</p>
              </div>
              <div className="bg-white rounded-2xl shadow-md px-4 py-4 text-center">
                <p className="text-3xl font-bold text-green-700">{rounds}</p>
                <p className="text-xs text-gray-500 mt-1">Spelade rundor</p>
              </div>
            </div>

            {/* Edit section */}
            {!editing ? (
              <div className="bg-white rounded-2xl shadow-md px-4 py-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500">Golf ID</p>
                    <p className="font-medium text-gray-800">{profile.golf_id || "—"}</p>
                  </div>
                  <button
                    onClick={() => setEditing(true)}
                    className="text-sm text-green-700 font-semibold border border-green-200 rounded-xl px-3 py-1"
                  >
                    Redigera
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-md px-4 py-4 space-y-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase">Handicap</label>
                  <input
                    type="number"
                    min="0"
                    max="54"
                    step="0.1"
                    value={handicap}
                    onChange={(e) => setHandicap(e.target.value)}
                    className="w-full mt-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase">Golf ID</label>
                  <input
                    type="text"
                    placeholder="Ex. 123456-789"
                    value={golfId}
                    onChange={(e) => setGolfId(e.target.value)}
                    className="w-full mt-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditing(false)}
                    className="flex-1 border border-gray-200 rounded-xl py-2 text-sm text-gray-600"
                  >
                    Avbryt
                  </button>
                  <button
                    onClick={saveProfile}
                    disabled={saving}
                    className="flex-1 bg-green-700 text-white rounded-xl py-2 text-sm font-semibold disabled:opacity-50"
                  >
                    {saving ? "Sparar..." : "Spara"}
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-12 text-gray-400">Laddar...</div>
        )}

        <button
          onClick={logout}
          className="w-full bg-white border border-red-200 text-red-600 rounded-2xl py-3 text-sm font-medium shadow"
        >
          Logga ut
        </button>
      </main>
    </div>
  );
}
