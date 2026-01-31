import Link from "next/link";

export const metadata = {
  title: "Privacy Policy | Invoice Chaser",
  description: "Privacy Policy for Invoice Chaser",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-500 mb-8">Last updated: January 2026</p>

        <div className="bg-white rounded-lg border border-gray-200 p-6 sm:p-8 space-y-8 text-gray-700 text-sm">
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">1. Information We Collect</h2>
            <p>
              We collect account information (such as email and name), invoice and customer data that
              you enter, and usage and diagnostic data to provide and improve the service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">2. How We Use Information</h2>
            <p>
              We use your information to provide and improve the service, send system and invoice-related
              emails, and for product improvement within the scope of this policy.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">3. Email Handling</h2>
            <p>
              Invoice emails are sent on your behalf. We process and deliver messages you choose to send
              through the Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">4. Data Storage & Security</h2>
            <p>
              Your data is stored using secure cloud infrastructure. We take reasonable measures to
              protect your data.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">5. Data Sharing</h2>
            <p>
              We do not sell your personal data. Data is shared only with service providers required to
              operate the app (e.g., hosting, email delivery).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">6. User Rights</h2>
            <p>
              You may request access to or deletion of your data by emailing{" "}
              <a href="mailto:support@invoicechaser.online" className="text-blue-600 hover:text-blue-800">
                support@invoicechaser.online
              </a>
              . Data deletion is available upon request.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">7. Cookies / Analytics</h2>
            <p>
              We use basic analytics and cookies for product improvement and to operate the service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">8. Policy Changes</h2>
            <p>
              Material changes to this policy will be communicated. Continued use of the Service after
              changes constitutes acceptance of the updated policy.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">9. Contact</h2>
            <p>
              For privacy-related questions, contact us at{" "}
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
