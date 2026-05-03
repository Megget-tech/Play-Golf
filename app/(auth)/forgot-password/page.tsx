"use client";
import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/update-password`,
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setSent(true);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-green-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-8">
        <h1 className="text-xl font-bold text-green-800 mb-1">Återställ lösenord</h1>

        {sent ? (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3">
              <p className="text-sm text-green-800 font-medium">E-post skickad!</p>
              <p className="text-sm text-green-700 mt-1">
                Kolla din inkorg och klicka på länken för att sätta ett nytt lösenord. Kontrollera även skräpposten.
              </p>
            </div>
            <Link href="/login" className="block text-center text-sm text-green-700 font-medium">
              ← Tillbaka till inloggning
            </Link>
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-500 mb-6">
              Ange din e-post så skickar vi en länk för att återställa lösenordet.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">E-post</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-green-700 text-white rounded-lg py-2 text-sm font-medium hover:bg-green-800 disabled:opacity-50"
              >
                {loading ? "Skickar..." : "Skicka återställningslänk"}
              </button>
            </form>
            <p className="mt-4 text-sm text-center">
              <Link href="/login" className="text-gray-400 hover:text-green-700">
                ← Tillbaka till inloggning
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
