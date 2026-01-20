"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Header } from "@/components/layout/header";
import { AppLayout } from "@/components/layout/app-layout";

const tiers = [
  {
    id: "starter",
    name: "Starter",
    price: 10,
    description: "Perfect for solo owners",
    limits: {
      invoices: "50 unpaid invoices",
      activeChases: "25 active auto-chases",
      emailsPerMonth: "500 auto-emails",
      remindersPerInvoice: "5 max reminders",
      autoStop: "Auto-stops after 60 days overdue",
    },
  },
  {
    id: "pro",
    name: "Pro",
    price: 25,
    description: "Best for growing teams",
    popular: true,
    limits: {
      invoices: "200 unpaid invoices",
      activeChases: "100 active auto-chases",
      emailsPerMonth: "2,000 auto-emails",
      remindersPerInvoice: "10 max reminders",
      autoStop: "Auto-stops after 60 days overdue",
    },
  },
  {
    id: "business",
    name: "Business",
    price: 79,
    description: "For high-volume operations",
    limits: {
      invoices: "Unlimited unpaid invoices",
      activeChases: "Unlimited active auto-chases",
      emailsPerMonth: "10,000 auto-emails",
      remindersPerInvoice: "15 max reminders",
      autoStop: "Auto-stops after 60 days overdue",
    },
  },
];

const features = [
  "Auto reminders that stop when paid/replied",
  "Smart spacing so you don't spam customers",
  "Chase history per invoice",
  "Company profile + templates (templates coming soon)",
];

const faqs = [
  {
    question: "Does it keep emailing forever?",
    answer:
      "No—each plan has hard limits on reminders per invoice and emails per month. Plus, we automatically stop chasing invoices that are 60+ days overdue to protect your customer relationships.",
  },
  {
    question: "Will this annoy my customers?",
    answer:
      "Not at all. Our emails use a polite, professional tone and are spaced out intelligently. We stop immediately when they pay or reply, so you never spam them.",
  },
  {
    question: "What if I have repeat customers?",
    answer:
      "Customer profiles are coming soon! For now, each invoice is tracked independently, and you'll have full chase history to see patterns.",
  },
  {
    question: "Can I cancel anytime?",
    answer:
      "Yes, absolutely. Cancel your subscription anytime with no long-term contracts or cancellation fees.",
  },
];

export default function PricingPage() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    if (!auth) return;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setIsLoggedIn(!!user);
    });
    return () => unsubscribe();
  }, []);

  function handleStartTrial() {
    if (isLoggedIn) {
      router.push("/trial");
    } else {
      router.push("/login?redirect=/trial");
    }
  }

  function handleSeeHowItWorks() {
    const faqSection = document.getElementById("faq");
    if (faqSection) {
      faqSection.scrollIntoView({ behavior: "smooth" });
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="Invoice Chaser" />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Stop awkward payment follow-ups. Get paid faster—automatically.
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
            Invoice Chaser sends polite reminders, escalates when needed, and stops when they pay or reply.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button onClick={handleStartTrial} size="lg">
              Start free trial
            </Button>
            <Button onClick={handleSeeHowItWorks} variant="secondary" size="lg">
              See how it works
            </Button>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          {tiers.map((tier) => (
            <div
              key={tier.id}
              className={`bg-white rounded-lg border-2 p-8 ${
                tier.popular
                  ? "border-blue-500 shadow-lg relative"
                  : "border-gray-200"
              }`}
            >
              {tier.popular && (
                <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                  <span className="bg-blue-500 text-white px-4 py-1 rounded-full text-sm font-medium">
                    Most Popular
                  </span>
                </div>
              )}
              <div className="text-center mb-6">
                <h3 className="text-2xl font-bold text-gray-900 mb-2">
                  {tier.name}
                </h3>
                <p className="text-gray-600 mb-4">{tier.description}</p>
                <div className="mb-4">
                  <span className="text-5xl font-bold text-gray-900">
                    ${tier.price}
                  </span>
                  <span className="text-gray-600">/mo</span>
                </div>
              </div>
              <div className="space-y-3 mb-8">
                <div className="text-sm text-gray-600">
                  <strong className="text-gray-900">Plan Limits:</strong>
                </div>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-start">
                    <span className="text-blue-500 mr-2">✓</span>
                    <span>{tier.limits.invoices}</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-blue-500 mr-2">✓</span>
                    <span>{tier.limits.activeChases}</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-blue-500 mr-2">✓</span>
                    <span>{tier.limits.emailsPerMonth}</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-blue-500 mr-2">✓</span>
                    <span>{tier.limits.remindersPerInvoice}</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-blue-500 mr-2">✓</span>
                    <span>{tier.limits.autoStop}</span>
                  </li>
                </ul>
              </div>
              <Button
                onClick={handleStartTrial}
                variant={tier.popular ? undefined : "secondary"}
                className="w-full"
              >
                Start free trial
              </Button>
            </div>
          ))}
        </div>

        {/* What You Get */}
        <div className="bg-white rounded-lg border border-gray-200 p-8 mb-16">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">
            What you get with every plan
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl mx-auto">
            {features.map((feature, index) => (
              <div key={index} className="flex items-start">
                <span className="text-green-500 mr-3 text-xl">✓</span>
                <span className="text-gray-700">{feature}</span>
              </div>
            ))}
          </div>
        </div>

        {/* FAQ Section */}
        <div id="faq" className="mb-16">
          <h2 className="text-3xl font-bold text-gray-900 mb-8 text-center">
            Frequently Asked Questions
          </h2>
          <div className="max-w-3xl mx-auto space-y-6">
            {faqs.map((faq, index) => (
              <div
                key={index}
                className="bg-white rounded-lg border border-gray-200 p-6"
              >
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {faq.question}
                </h3>
                <p className="text-gray-600">{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Footer CTA */}
        <div className="bg-blue-600 rounded-lg p-12 text-center text-white">
          <h2 className="text-3xl font-bold mb-4">
            Start free trial in 60 seconds
          </h2>
          <p className="text-blue-100 mb-6 text-lg">
            No credit card required. Get started today and see how Invoice Chaser helps you get paid faster.
          </p>
          <Button
            onClick={handleStartTrial}
            variant="secondary"
            size="lg"
            className="bg-white text-blue-600 hover:bg-gray-100"
          >
            Start free trial
          </Button>
        </div>
      </main>
    </div>
  );
}
