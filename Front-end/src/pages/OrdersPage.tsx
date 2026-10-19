import { useAuth } from "../auth/useAuth";

export function OrdersPage() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-dvh bg-slate-50 p-6">
      <header className="mx-auto flex max-w-6xl items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Orders Console</h1>
        <div className="flex items-center gap-3 text-sm">
          <span className="rounded-full bg-slate-200 px-3 py-1 font-medium text-slate-700">
            {user?.role}
          </span>
          <button
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
            className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
          >
            Sign out
          </button>
        </div>
      </header>
      <p className="mx-auto mt-10 max-w-6xl text-slate-500">Orders list coming next.</p>
    </div>
  );
}