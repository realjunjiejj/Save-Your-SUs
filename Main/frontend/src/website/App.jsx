import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import HomePage from "./HomePage";
import LoginPage from "./LoginPage";

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof window !== "undefined" && window.location.hash.includes("access_token")) {
          await supabase.auth.getSessionFromUrl({ storeSession: true });
          window.history.replaceState({}, document.title, window.location.pathname);
        }

        const { data } = await supabase.auth.getSession();
        setSession(data?.session ?? null);
      } catch (err) {
        console.error("Auth init error:", err);
      } finally {
        setLoading(false);
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <p>Loading...</p>
      </div>
    );
  }

  if (!session?.user) {
    return <LoginPage />;
  }

  return <HomePage session={session} />;
}
