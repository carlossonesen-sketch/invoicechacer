import Link from "next/link";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Invoice Chaser — Stop losing money to unpaid invoices",
  description:
    "Invoice Chaser automatically follows up on unpaid invoices so you can protect cash flow without awkward emails or phone calls.",
};

const primaryCtaClass =
  "inline-flex items-center justify-center font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 bg-blue-600 text-white hover:bg-blue-700 px-6 py-3 text-base sm:text-lg";

const secondaryCtaClass =
  "inline-flex items-center justify-center font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 bg-white/10 text-white ring-1 ring-white/30 hover:bg-white/15 px-6 py-3 text-base sm:text-lg";

const sectionCtaSecondaryClass =
  "inline-flex items-center justify-center font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 bg-gray-200 text-gray-900 hover:bg-gray-300 px-6 py-3 text-base sm:text-lg";

function CheckIcon() {
  return (
    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center" aria-hidden>
      <svg className="w-3 h-3 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
          clipRule="evenodd"
        />
      </svg>
    </span>
  );
}

function HeroCtaCluster() {
  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 sm:gap-4">
      <Link href="/login" className={primaryCtaClass}>
        Start Free
      </Link>
      <Link href="/pricing" className={secondaryCtaClass}>
        View pricing
      </Link>
    </div>
  );
}

/** Server-only nav: do not use app Header here — it imports Firebase and logs env warnings on the public homepage. */
function PublicMarketingHeader() {
  return (
    <header className="h-16 border-b border-gray-200 bg-white px-4 sm:px-6 flex items-center justify-between gap-4">
      <Link href="/" className="text-lg font-semibold text-gray-900 hover:text-gray-800 shrink-0">
        Invoice Chaser
      </Link>
      <nav className="flex items-center gap-4 shrink-0" aria-label="Site">
        <Link href="/login" className="text-sm font-medium text-gray-700 hover:text-gray-900">
          Log in
        </Link>
        <Link href="/pricing" className="text-sm font-medium text-gray-700 hover:text-gray-900">
          Pricing
        </Link>
      </nav>
    </header>
  );
}

export default async function HomePage() {
  const cookieStore = await cookies();
  const hasSession = !!(
    cookieStore.get("invoicechaser_session")?.value || cookieStore.get("invoicechaser_auth")?.value
  );
  if (hasSession) {
    redirect("/dashboard");
  }

  const problemPoints = [
    "Late and unpaid invoices squeeze your cash flow—rent, payroll, and supplies still come due.",
    "Chasing payments steals time you should spend on real work, not inbox detective work.",
    "Asking for money can feel uncomfortable, so invoices sit… and sit.",
  ];

  const steps = [
    { step: 1, title: "Add your invoice", body: "Record who owes you, for what, and when it was due." },
    { step: 2, title: "Automatic reminders go out", body: "Polite, timed follow-ups go out on your behalf—no manual nudging." },
    { step: 3, title: "You get paid", body: "Clients pay, you move on. Less stress, steadier cash in the door." },
  ];

  const benefits = [
    { title: "Get paid faster", text: "Consistent follow-ups bring overdue balances back onto your timeline." },
    { title: "Stop manual follow-ups", text: "Spend your week on customers and delivery—not reminder emails." },
    { title: "Protect cash flow", text: "Fewer surprises in your bank account, so you can plan with confidence." },
    { title: "Stay professional", text: "Clear, calm wording keeps relationships intact while you collect what you earned." },
  ];

  const sampleScenarios = [
    {
      who: "Mike R.",
      role: "Contractor",
      quote:
        "I used to wait weeks for checks after jobs wrapped. Now reminders go out like clockwork and I spend nights at home instead of on the phone.",
    },
    {
      who: "Sarah L.",
      role: "Freelance designer",
      quote:
        "I hated pinging clients about invoices. Having something else send the nudges keeps things friendly—and I get deposits sooner.",
    },
    {
      who: "James T.",
      role: "Small agency owner",
      quote:
        "We had too many small balances aging in a spreadsheet. Automated chases brought a lot of that cash back without sounding pushy.",
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <PublicMarketingHeader />

      {/* Hero */}
      <section className="bg-gradient-to-br from-blue-600 via-blue-700 to-blue-800 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-16 sm:pt-16 sm:pb-20 text-center">
          <p className="text-sm font-medium text-blue-100 uppercase tracking-wide">For small business owners</p>
          <h1 className="mt-3 text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-balance">
            Stop Losing Money to Unpaid Invoices
          </h1>
          <p className="mt-5 text-lg sm:text-xl text-blue-100 max-w-2xl mx-auto leading-relaxed text-pretty">
            Invoice Chaser automatically follows up on unpaid invoices so you can protect cash flow without awkward
            emails or phone calls.
          </p>
          <div className="mt-10 flex flex-col items-center gap-3">
            <HeroCtaCluster />
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-center gap-1 sm:gap-4 text-sm text-blue-100">
              <span>No credit card required</span>
              <span className="hidden sm:inline" aria-hidden>
                ·
              </span>
              <span>Takes less than 2 minutes</span>
            </div>
          </div>
        </div>
      </section>

      {/* Problem */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
        <h2 className="text-2xl sm:text-3xl font-semibold text-gray-900 text-center text-balance">
          Unpaid invoices are more than an annoyance
        </h2>
        <p className="mt-3 text-center text-gray-600 max-w-2xl mx-auto leading-relaxed">
          If you run a small business, you have probably felt this already: you did the work, sent the bill, and then
          silence.
        </p>
        <ul className="mt-8 space-y-4 max-w-2xl mx-auto">
          {problemPoints.map((text) => (
            <li key={text} className="flex items-start gap-3 text-gray-700 leading-relaxed">
              <CheckIcon />
              <span>{text}</span>
            </li>
          ))}
        </ul>
        <div className="mt-10 flex justify-center">
          <Link href="/login" className={primaryCtaClass}>
            Start Getting Paid Faster
          </Link>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-white border-y border-gray-200" id="how-it-works">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
          <h2 className="text-2xl sm:text-3xl font-semibold text-gray-900 text-center">How it works</h2>
          <p className="mt-2 text-center text-gray-600 max-w-2xl mx-auto">
            Three simple steps from invoice to money in your account.
          </p>
          <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-10 sm:gap-8">
            {steps.map(({ step, title, body }) => (
              <div key={step} className="text-center sm:text-left">
                <div className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-blue-100 text-blue-800 font-semibold text-lg">
                  {step}
                </div>
                <h3 className="mt-4 text-lg font-semibold text-gray-900">{title}</h3>
                <p className="mt-2 text-sm sm:text-base text-gray-600 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
        <h2 className="text-2xl sm:text-3xl font-semibold text-gray-900 text-center">What you can expect</h2>
        <p className="mt-2 text-center text-gray-600 max-w-2xl mx-auto">
          Built for owners who want steadier payments without burning goodwill.
        </p>
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-6">
          {benefits.map(({ title, text }) => (
            <div
              key={title}
              className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm hover:shadow-md transition-shadow"
            >
              <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
              <p className="mt-2 text-gray-600 leading-relaxed">{text}</p>
            </div>
          ))}
        </div>
        <div className="mt-12 rounded-xl bg-blue-600 px-6 py-10 sm:px-10 text-center text-white">
          <p className="text-lg font-semibold">Ready to take invoice chasing off your plate?</p>
          <p className="mt-2 text-blue-100 text-sm sm:text-base">No credit card required · Takes less than 2 minutes</p>
          <div className="mt-6 flex justify-center">
            <Link
              href="/login"
              className="inline-flex items-center justify-center font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-white bg-white text-blue-700 hover:bg-blue-50 px-6 py-3 text-base sm:text-lg"
            >
              Start Free
            </Link>
          </div>
        </div>
      </section>

      {/* Sample scenarios (not real reviews) */}
      <section className="bg-gray-100 border-t border-gray-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
          <h2 className="text-2xl sm:text-3xl font-semibold text-gray-900 text-center">Sample customer scenarios</h2>
          <p className="mt-3 text-center text-sm sm:text-base text-gray-600 max-w-2xl mx-auto leading-relaxed">
            Illustrative examples for common situations. These are{" "}
            <span className="font-medium text-gray-800">not verified reviews</span> or endorsements—just realistic
            stories many small businesses recognize.
          </p>
          <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6">
            {sampleScenarios.map(({ who, role, quote }) => (
              <figure
                key={who}
                className="rounded-xl border border-gray-200 bg-white p-6 flex flex-col shadow-sm"
              >
                <figcaption className="text-sm font-semibold text-gray-900">
                  {who} <span className="font-normal text-gray-500">— {role}</span>
                </figcaption>
                <blockquote className="mt-4 text-gray-700 text-sm leading-relaxed flex-1">&ldquo;{quote}&rdquo;</blockquote>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* Demo placeholder */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20" id="demo">
        <div className="rounded-2xl border-2 border-dashed border-gray-300 bg-white px-6 py-12 sm:px-10 text-center">
          <h2 className="text-2xl sm:text-3xl font-semibold text-gray-900">See how it works</h2>
          <p className="mt-3 text-gray-600 max-w-xl mx-auto leading-relaxed">
            A short product walkthrough will live here. For now, the fastest way to see Invoice Chaser is to create a
            free account and add your first invoice—it only takes a couple of minutes.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/login" className={primaryCtaClass}>
              Start Free
            </Link>
            <Link href="/pricing" className={sectionCtaSecondaryClass}>
              Compare plans
            </Link>
          </div>
        </div>
      </section>

      {/* Final CTA + footer links */}
      <section className="bg-gradient-to-br from-blue-600 to-blue-800 text-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-16 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-balance">Protect your cash flow—starting today</h2>
          <p className="mt-3 text-blue-100 leading-relaxed">
            Join small business owners who let automated follow-ups handle the awkward part, so they can focus on the
            work that pays the bills.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3">
            <Link
              href="/login"
              className="inline-flex items-center justify-center font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-300 bg-white text-blue-700 hover:bg-blue-50 px-8 py-3 text-lg"
            >
              Start Free
            </Link>
            <p className="text-sm text-blue-100">No credit card required · Takes less than 2 minutes</p>
          </div>
        </div>
      </section>

      <footer className="border-t border-gray-200 bg-white py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-600">
          <p>© {new Date().getFullYear()} Invoice Chaser</p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link href="/pricing" className="hover:text-gray-900 font-medium">
              Pricing
            </Link>
            <Link href="/login" className="hover:text-gray-900 font-medium">
              Log in
            </Link>
            <Link href="/terms" className="hover:text-gray-900">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-gray-900">
              Privacy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
