import { useState } from "react";
import { supabase } from "../supabaseClient";
import Navbar from "./Navbar";

export default function HomePage({ session }) {
  const [signOutError, setSignOutError] = useState("");

  const handleSignOut = async () => {
    setSignOutError("");
    const { error } = await supabase.auth.signOut({ scope: "local" });

    if (error) {
      setSignOutError("Could not sign out. Please try again.");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar session={session} onSignOut={handleSignOut} />

      <main className="mx-auto max-w-7xl p-6">
        {signOutError ? (
          <p className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{signOutError}</p>
        ) : null}

        <div className="gap-6 lg:flex">
          <aside className="mb-6 rounded-3xl border bg-white p-6 shadow-sm lg:mb-0 lg:w-64">
            <h2 className="text-lg font-bold">History</h2>
            <div className="mt-6 flex h-32 items-center justify-center rounded-2xl border">
              <p className="text-lg font-bold text-red-600">Coming soon</p>
            </div>
          </aside>

          <div className="flex-1">
            <section className="mb-6 rounded-3xl border bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold">Upload PDF</h2>
              <div className="mt-6 flex h-44 items-center justify-center rounded-3xl border-2 border-dashed">
                <p className="text-xl font-bold text-red-600">Coming soon</p>
              </div>
            </section>

            <section className="rounded-3xl border bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold">Generate Flow Chart / Summary Sheet</h2>
              <div className="mt-6 flex h-32 items-center justify-center rounded-3xl border">
                <p className="text-xl font-bold text-red-600">Coming soon</p>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
