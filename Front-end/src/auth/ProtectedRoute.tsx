import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./useAuth";

export function ProtectedRoute() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <span className="size-8 animate-spin rounded-full border-4 border-slate-300 border-t-slate-700" />
      </div>
    );
  }

  return user ? <Outlet /> : <Navigate to="/login" replace />;
}