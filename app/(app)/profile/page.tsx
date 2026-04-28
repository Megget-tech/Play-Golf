"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

type Profile = { name: string; handicap_index: number };

export default function ProfilePage() {
  const router = useRouter();
  const supabase = createClient();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [rounds, setRounds] = useState(0);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      const { data } = await supabase.from("profiles").select("name, handicap_index").eq("id", user.id).single();
      setProfile(data);
      const { count } = await supabase.from("rounds").select("*", { count: "exact", head: true }).eq("created_by", user.id);
      setRounds(count ?? 0);
    }
    load();
  }, []);

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div className="min-h-screen bg-green-50">
      <header className="bg-green-800 text-white px-4 py-4">
        <h1 className="text-lg font-bold">Min profil</h1>
      </header>
      <main className="px-4 py-6 max-w-lg mx-auto space-y-4">
        {profile ? (
          <>
            <div className="bg-white rounded-2xl shadow px-4 py-5 text-center">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center text-3xl mx-auto mb-3">
                👤
              </div>
              <h2 className="text-xl font-bold text-gray-800">{profile.name}</h2>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-2xl shadow px-4 py-4 text-center">
                <p className="text-3xl font-bold text-green-700">{profile.handicap_index}</p>
                <p className="text-xs text-gray-500 mt-1">Handicap</p>
              </div>
              <div className="bg-white rounded-2xl shadow px-4 py-4 text-center">
                <p className="text-3xl font-bold text-green-700">{rounds}</p>
                <p className="text-xs text-gray-500 mt-1">Spelade rundor</p>
              </div>
            </div>
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
