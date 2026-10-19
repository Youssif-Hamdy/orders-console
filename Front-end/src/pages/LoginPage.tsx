import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { z } from "zod";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/useAuth";

const schema = z.object({
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

type FieldErrors = { email?: string; password?: string };

function messageFor(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return "Wrong email or password.";
    if (err.status === 429) return "Too many attempts. Please try again in a few minutes.";
    if (err.status === 400) return "Please check the details you entered.";
  }
  if (err instanceof TypeError) return "Can't reach the server. Check your connection.";
  return "Something went wrong. Please try again.";
}

const inputClass = (hasError: boolean) =>
  `w-full rounded-xl border bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/40 outline-none transition focus:bg-white/15 focus:ring-2 ${
    hasError
      ? "border-red-400/70 focus:ring-red-400/40"
      : "border-white/20 focus:border-white/50 focus:ring-white/30"
  }`;

export function LoginPage() {
  const { user, login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  if (user) return <Navigate to="/" replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      const fieldErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if ((key === "email" || key === "password") && !fieldErrors[key]) {
          fieldErrors[key] = issue.message;
        }
      }
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    try {
      await login.mutateAsync(parsed.data);
    } catch (err) {
      setFormError(messageFor(err));
    }
  };

  return (
    <main className="relative isolate grid min-h-dvh place-items-center overflow-hidden p-4">
      <div className="auth-bg" aria-hidden="true" />
      <div
        className="absolute inset-0 -z-10 bg-gradient-to-b from-black/30 via-black/20 to-black/50"
        aria-hidden="true"
      />

      <div className="animate-card-in w-full max-w-md rounded-3xl border border-white/20 bg-white/10 p-8 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-10">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/25">
            <svg viewBox="0 0 24 24" className="size-6 text-white" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" />
              <path d="m3 8 9 5 9-5M12 13v8" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Orders Console</h1>
          <p className="mt-1 text-sm text-white/70">Sign in to continue</p>
        </div>

        <form onSubmit={onSubmit} noValidate className="space-y-5">
          {formError && (
            <div role="alert" className="rounded-xl border border-red-400/40 bg-red-500/15 px-4 py-3 text-sm text-red-100">
              {formError}
            </div>
          )}

          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-white/90">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? "email-error" : undefined}
              className={inputClass(!!errors.email)}
            />
            {errors.email && (
              <p id="email-error" className="mt-1.5 text-xs text-red-200">
                {errors.email}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-white/90">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={!!errors.password}
                aria-describedby={errors.password ? "password-error" : undefined}
                className={`${inputClass(!!errors.password)} pr-16`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-3 my-auto h-fit rounded-md px-2 py-1 text-xs font-medium text-white/70 transition hover:text-white focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            {errors.password && (
              <p id="password-error" className="mt-1.5 text-xs text-red-200">
                {errors.password}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={login.isPending}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-lg transition hover:bg-white/90 focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-70"
          >
            {login.isPending && (
              <span className="size-4 animate-spin rounded-full border-2 border-slate-400 border-t-slate-900" />
            )}
            {login.isPending ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}