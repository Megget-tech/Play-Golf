"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    // Supabase fires PASSWORD_RECOVERY when the user arrives via the reset link
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setReady(true);
      }
    });
    // Also check if there's already a session (e.g. page reload)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError("Lösenorden matchar inte."); return; }
    if (password.length < 6) { setError("Lösenordet måste vara minst 6 tecken."); return; }
    setLoading(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setDone(true);
      setTimeout(() => router.push("/dashboard"), 2000);
    }
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-green-50 px-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-8 text-center">
          <p className="text-gray-500 text-sm">Verifierar länk...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-green-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-8">
        <h1 className="text-xl font-bold text-green-800 mb-1">Nytt lösenord</h1>

        {done ? (
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 mt-4">
            <p className="text-sm text-green-800 font-medium">Lösenordet är uppdaterat!</p>
            <p className="text-sm text-green-700 mt-1">Du skickas vidare automatiskt...</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-500 mb-6">Ange ditt nya lösenord nedan.</p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nytt lösenord</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={6}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bekräfta lösenord</label>
                <input
                  type="password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  minLength={6}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-green-700 text-white rounded-lg py-2 text-sm font-medium hover:bg-green-800 disabled:opacity-50"
              >
                {loading ? "Sparar..." : "Spara nytt lösenord"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
