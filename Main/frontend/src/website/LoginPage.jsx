import { supabase } from "../supabaseClient";
import logo from "./brand-logo.png";

export default function LoginPage() {
  const handleSignIn = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined },
    });
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-4xl overflow-hidden rounded-3xl border bg-white shadow-md md:flex">
        <div className="flex w-full items-center justify-center p-8 md:w-1/2">
          <img
            src={logo}
            alt="Save Your S/Us logo"
            className="w-full max-w-sm"
          />
        </div>

        <div className="w-full border-t bg-indigo-50 p-10 md:w-1/2 md:border-l md:border-t-0">
          <p className="text-sm font-bold uppercase text-indigo-600">Welcome to</p>
          <h1 className="mt-4 text-3xl font-bold">Save Your S/Us</h1>
          <p className="mt-5 text-gray-600">
            Turn lecture notes into revision diagrams and summaries.
          </p>
          <button
            type="button"
            onClick={handleSignIn}
            className="mt-8 w-full rounded-xl bg-indigo-600 p-3 font-bold text-white hover:bg-indigo-700"
          >
            Sign in with Google
          </button>
        </div>
      </div>
    </main>
  );
}
