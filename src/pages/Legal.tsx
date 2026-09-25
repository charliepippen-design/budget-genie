import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

// Public legal pages (/terms, /refund-policy, /privacy), linked from the landing and pricing pages.
// Payment providers review these during merchant onboarding: keep the operator details accurate.

const LEGAL = {
  product: 'MediaPlan Pro',
  site: 'mediaplannerpro.com',
  operator: 'MediaPlan Pro',
  contactEmail: 'info@mediaplannerpro.com',
  governingLaw: 'Italy',
  lastUpdated: 'September 25, 2026',
};

type LegalDoc = 'terms' | 'refund' | 'privacy';

const TITLES: Record<LegalDoc, string> = {
  terms: 'Terms of Service',
  refund: 'Refund & Cancellation Policy',
  privacy: 'Privacy Policy',
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
      <div className="space-y-3 text-gray-700 leading-7">{children}</div>
    </section>
  );
}

const Email = () => (
  <a className="text-blue-600 underline" href={`mailto:${LEGAL.contactEmail}`}>
    {LEGAL.contactEmail}
  </a>
);

function Terms() {
  return (
    <>
      <Section title="1. Who we are">
        <p>
          {LEGAL.product} ({LEGAL.site}) is an online media planning tool operated by {LEGAL.operator} ("we", "us").
          By creating an account or using the service you agree to these terms.
        </p>
      </Section>
      <Section title="2. The service">
        <p>
          {LEGAL.product} helps you build and model advertising budgets. An AI assistant helps you describe your
          brief; plan figures (spend, CPA, conversions, ROAS, LTV) are estimates produced by a planning model from
          your inputs and industry benchmarks.
        </p>
        <p>
          Estimates are not a guarantee of campaign results. You are responsible for your advertising decisions and
          for complying with the advertising rules that apply to your business and markets.
        </p>
      </Section>
      <Section title="3. Accounts">
        <p>
          You must provide accurate account information and keep your login secure. You must be at least 18 years
          old and use the service for business or professional purposes.
        </p>
      </Section>
      <Section title="4. Subscriptions and payment">
        <p>
          Paid plans are billed monthly in advance, in US dollars, at the price shown on the pricing page at the
          time of purchase. Subscriptions renew automatically each month until cancelled. Payments are processed by
          our payment provider; we do not store your card details.
        </p>
        <p>
          We may change prices for future billing periods with at least 30 days' notice by email. Cancellation and
          refunds are covered by our <Link className="text-blue-600 underline" to="/refund-policy">Refund &amp; Cancellation Policy</Link>.
        </p>
      </Section>
      <Section title="5. Acceptable use">
        <p>
          You may not misuse the service: no attempts to break or overload it, no automated scraping, no reselling
          of access, no unlawful content, and no use to plan advertising that is illegal in the target market.
          We may suspend accounts that break these rules.
        </p>
      </Section>
      <Section title="6. Your content">
        <p>
          You keep all rights to the briefs, plans and files you create or upload. You give us permission to process
          them only to run the service for you.
        </p>
      </Section>
      <Section title="7. Availability and liability">
        <p>
          We work to keep the service available but do not guarantee uninterrupted access. The service is provided
          "as is". To the extent permitted by law, our total liability for any claim is limited to the amount you
          paid us in the 3 months before the claim. Nothing in these terms limits rights you have under mandatory
          consumer law.
        </p>
      </Section>
      <Section title="8. Termination">
        <p>
          You can stop using the service and cancel at any time. We may end or suspend access for serious or
          repeated breaches of these terms.
        </p>
      </Section>
      <Section title="9. Changes and governing law">
        <p>
          We may update these terms; material changes will be announced by email or in the app. These terms are
          governed by the laws of {LEGAL.governingLaw}.
        </p>
      </Section>
      <Section title="10. Contact">
        <p>
          Questions about these terms: <Email />.
        </p>
      </Section>
    </>
  );
}

function Refund() {
  return (
    <>
      <Section title="Cancel any time">
        <p>
          You can cancel your subscription at any time from your account settings or by emailing <Email />.
          Cancellation stops the next renewal. You keep access to your paid plan until the end of the billing period
          you already paid for. No further charges are made after cancellation.
        </p>
      </Section>
      <Section title="14-day money-back guarantee">
        <p>
          If you are not satisfied with your first paid month, email us within 14 days of that first payment and we
          will refund it in full. No questions asked.
        </p>
      </Section>
      <Section title="Renewals">
        <p>
          Monthly renewals are not refunded for partial months, except where required by law or where a billing error
          or a service outage on our side prevented you from using the service. In those cases contact us and we will
          refund or credit the affected period.
        </p>
      </Section>
      <Section title="How refunds are paid">
        <p>
          Approved refunds are returned to the original payment method within 5–10 business days. The time it takes to
          appear on your statement depends on your bank.
        </p>
      </Section>
      <Section title="Contact">
        <p>
          For any billing question, write to <Email /> with the email address of your account. We reply within 2
          business days.
        </p>
      </Section>
    </>
  );
}

function Privacy() {
  return (
    <>
      <Section title="What we collect">
        <ul className="list-disc pl-6 space-y-2">
          <li>Account data: your name and email address, handled by our sign-in provider (Clerk).</li>
          <li>Planning data: the briefs, budgets and plans you create. Plans are stored in your browser.</li>
          <li>AI chat messages: sent to our AI provider (Google Gemini) only to generate replies.</li>
          <li>Billing data: handled by our payment provider. We do not see or store full card numbers.</li>
          <li>Basic technical logs (such as IP address and request times) kept by our hosting provider (Vercel) for security.</li>
        </ul>
      </Section>
      <Section title="Why we use it">
        <p>
          To provide the service, manage your subscription, keep the service secure, and reply to you. We do not sell
          your data and we do not use it for third-party advertising.
        </p>
      </Section>
      <Section title="Retention">
        <p>
          We keep account and billing records while your account is active and as long as the law requires for tax
          and accounting. You can ask us to delete your account at any time.
        </p>
      </Section>
      <Section title="Your rights">
        <p>
          You can ask to access, correct, export or delete your personal data, or object to its use, by writing to{' '}
          <Email />. You can also complain to your local data protection authority.
        </p>
      </Section>
      <Section title="Contact">
        <p>
          {LEGAL.operator}, <Email />.
        </p>
      </Section>
    </>
  );
}

export default function Legal({ doc }: { doc: LegalDoc }) {
  return (
    <div className="min-h-screen bg-white py-12 px-4">
      <article className="max-w-3xl mx-auto space-y-8">
        <header className="space-y-2">
          <Link to="/" className="text-sm text-blue-600 underline">
            ← {LEGAL.product}
          </Link>
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900">{TITLES[doc]}</h1>
          <p className="text-sm text-gray-500">Last updated: {LEGAL.lastUpdated}</p>
        </header>
        {doc === 'terms' && <Terms />}
        {doc === 'refund' && <Refund />}
        {doc === 'privacy' && <Privacy />}
        <LegalLinks />
      </article>
    </div>
  );
}

export function LegalLinks({ className = 'text-gray-500' }: { className?: string }) {
  return (
    <nav className={`flex flex-wrap justify-center gap-4 text-sm ${className}`}>
      <Link to="/terms" className="hover:underline">Terms of Service</Link>
      <Link to="/refund-policy" className="hover:underline">Refund Policy</Link>
      <Link to="/privacy" className="hover:underline">Privacy Policy</Link>
    </nav>
  );
}
