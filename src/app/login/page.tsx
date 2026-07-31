import { BarChart3, Link2, MessagesSquare, TrendingUp } from "lucide-react";
import type { Metadata } from "next";

import { LoginForm } from "@/features/auth/login-form";

export const metadata: Metadata = { title: "Sign in" };

const HIGHLIGHTS = [
  {
    icon: TrendingUp,
    title: "Rank tracking",
    body: "Month-by-month positions for every keyword, with movement at a glance.",
  },
  {
    icon: Link2,
    title: "Link building",
    body: "Every backlink logged with anchor, authority, index status and owner.",
  },
  {
    icon: BarChart3,
    title: "Search Console",
    body: "Clicks, impressions and CTR trended against the work delivered.",
  },
  {
    icon: MessagesSquare,
    title: "Client portal",
    body: "Clients see live progress and talk to the team in one place.",
  },
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <main className="surface-app min-h-dvh lg:grid lg:grid-cols-[1.1fr_1fr]">
      {/* ── Marketing panel ── */}
      <section className="relative hidden overflow-hidden p-12 lg:flex lg:flex-col lg:justify-between">
        <div
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            background:
              "radial-gradient(115% 90% at 8% 6%, var(--accent-soft) 0%, transparent 55%), radial-gradient(90% 80% at 92% 98%, color-mix(in oklab, var(--color-mint-500) 16%, transparent) 0%, transparent 60%)",
          }}
          aria-hidden
        />

        <div className="relative">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-[var(--accent)] text-[15px] font-bold text-[var(--on-accent)]">
              S
            </span>
            <span className="text-strong text-[15px] font-semibold tracking-tight">
              SEO Dashboard
            </span>
          </div>
        </div>

        <div className="relative max-w-lg">
          <h1 className="text-[34px] leading-[1.15] font-semibold tracking-tight">
            Every SEO campaign,
            <br />
            in one clean workspace.
          </h1>
          <p className="text-muted mt-4 text-[15px] leading-6">
            Replace the spreadsheet. Track rankings, links, on-page work and
            Search Console performance per client — and give each client a
            portal they can actually read.
          </p>

          <div className="mt-10 grid gap-3 sm:grid-cols-2">
            {HIGHLIGHTS.map(({ icon: Icon, title, body }) => (
              <div key={title} className="panel-flat p-4">
                <Icon className="mb-2.5 size-[18px] text-[var(--accent)]" />
                <p className="text-strong text-[13.5px] font-semibold">{title}</p>
                <p className="text-muted mt-1 text-[12.5px] leading-[1.45]">{body}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-faint relative text-[12px]">
          Built for agencies running multiple client campaigns.
        </p>
      </section>

      {/* ── Form panel ── */}
      <section className="flex min-h-dvh items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <div className="flex items-center gap-2.5">
              <span className="grid size-9 place-items-center rounded-xl bg-[var(--accent)] text-[15px] font-bold text-[var(--on-accent)]">
                S
              </span>
              <span className="text-strong text-[15px] font-semibold">
                SEO Dashboard
              </span>
            </div>
          </div>

          <h2 className="text-[22px] leading-7 font-semibold tracking-tight">
            Sign in
          </h2>
          <p className="text-muted mt-1.5 text-[13.5px]">
            Use the credentials your account manager sent you.
          </p>

          <LoginForm next={next} />

          <p className="text-faint mt-8 text-center text-[12px] leading-5">
            Trouble signing in? Contact your account manager to have your
            password reset.
          </p>
        </div>
      </section>
    </main>
  );
}
