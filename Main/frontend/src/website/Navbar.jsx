import logo from "./brand-logo.png";

export default function Navbar({ session, onSignOut }) {
  const email = session?.user?.email;
  return (
    <header className="border-b bg-white shadow-sm">
      <div className="mx-auto flex max-w-7xl items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <img
            src={logo}
            alt="Save Your S/Us logo"
            className="h-12 w-16 object-contain"
          />
          <p className="text-lg font-bold text-indigo-600">Save Your S/Us</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden rounded-full bg-gray-100 px-4 py-2 text-sm sm:block">{email}</div>
          <button
            type="button"
            onClick={onSignOut}
            className="rounded-full bg-indigo-600 px-4 py-2 font-bold text-white hover:bg-indigo-700"
          >
            Sign Out
          </button>
        </div>
      </div>
    </header>
  );
}
