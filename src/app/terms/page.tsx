import Link from "next/link";

export const metadata = {
  title: "Terms of Service | Invoice Chaser",
  description: "Terms of Service for Invoice Chaser",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Terms of Service</h1>
        <p className="text-sm text-gray-500 mb-8">Last updated: January 2026</p>

        <div className="bg-white rounded-lg border border-gray-200 p-6 sm:p-8 space-y-8 text-gray-700 text-sm">
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">1. Introduction</h2>
            <p>
              Invoice Chaser is a SaaS platform that helps businesses manage and send invoice reminders.
              These Terms of Service (&quot;Terms&quot;) govern your use of the Invoice Chaser service
              (&quot;Service&quot;) operated by Our Entertainment LLC (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">2. Eligibility</h2>
            <p>
              You must be at least 18 years old to use the Service. By using the Service, you represent
              that you meet this requirement.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">3. Accounts</h2>
            <p>
              You are responsible for maintaining accurate account and invoice information. You are
              responsible for all activity under your account.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">4. Acceptable Use</h2>
            <p>
              You agree not to use the Service for any illegal activity, spam, harassment, fraud, or
              misuse. We may suspend or terminate your access for violations of acceptable use.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">5. Email Responsibility</h2>
            <p>
              You confirm that you have permission to contact invoice recipients. Invoice Chaser is not
              responsible for misuse of email features, including unsolicited or unauthorized messages
              sent through the Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">6. Subscriptions & Billing</h2>
            <p>
              Paid plans, trials, upgrades, and cancellations are managed through the app. You agree to
              pay applicable fees for your chosen plan.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">7. Suspension & Termination</h2>
            <p>
              We may suspend or terminate your account for violations of these Terms or for abuse of the
              Service. You may cancel your account at any time.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">8. Disclaimer of Warranties</h2>
            <p>
              The Service is provided &quot;as is&quot; and &quot;as available&quot; without warranties of any kind,
              express or implied, to the fullest extent permitted by law.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">9. Limitation of Liability</h2>
            <p>
              Our liability to you for any claim arising from or related to the Service is limited to
              the amount you paid us in the prior 12 months.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">10. Dispute Resolution</h2>
            <p>
              Any dispute arising from these Terms or the Service shall be resolved by binding arbitration.
              You agree to resolve disputes on an individual basis and waive any right to participate in
              class actions.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">11. Governing Law</h2>
            <p>
              These Terms are governed by the laws of the State of Wyoming, United States. Our Entertainment LLC
              is incorporated in Wyoming, United States, and operates from Arkansas, United States.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">12. Contact</h2>
            <p>
              For questions about these Terms, contact us at{" "}
              <a href="mailto:support@invoicechaser.online" className="text-blue-600 hover:text-blue-800">
                support@invoicechaser.online
              </a>
              .
            </p>
          </section>
        </div>

        <p className="mt-8 text-center">
          <Link href="/" className="text-blue-600 hover:text-blue-800 font-medium">
            Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}
