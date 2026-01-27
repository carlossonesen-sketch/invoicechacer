/**
 * GET /api/business-profile — read business profile (exists + profile data)
 * POST /api/business-profile — upsert business profile (onboarding fields)
 * Auth: Bearer or session cookie via getAuthenticatedUserId.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore, initFirebaseAdmin } from "@/lib/firebase-admin";
import { getAuthenticatedUserId } from "@/lib/api/auth";
import { Timestamp, FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";

try {
  initFirebaseAdmin();
} catch {
  /* ignore at module load */
}

/** Profile shape returned by GET; matches BusinessProfile with ISO dates */
interface BusinessProfileJson {
  uid: string;
  companyName: string;
  companyEmail?: string;
  phone?: string;
  logoUrl?: string;
  defaultPaymentLink?: string;
  createdAt: string;
  updatedAt: string;
}

function toProfileJson(uid: string, data: Record<string, unknown>): BusinessProfileJson {
  const toIso = (v: unknown): string => {
    if (!v) return new Date().toISOString();
    if (v instanceof Timestamp) return v.toDate().toISOString();
    if (typeof v === "string") return v;
    if (typeof v === "object" && v !== null && "toDate" in v && typeof (v as { toDate: () => Date }).toDate === "function") {
      return (v as { toDate: () => Date }).toDate().toISOString();
    }
    return new Date().toISOString();
  };
  return {
    uid,
    companyName: (data.companyName as string) || "",
    companyEmail: data.companyEmail as string | undefined,
    phone: data.phone as string | undefined,
    logoUrl: data.logoUrl as string | undefined,
    defaultPaymentLink: data.defaultPaymentLink as string | undefined,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}

export async function GET(request: NextRequest) {
  try {
    initFirebaseAdmin();
    const uid = await getAuthenticatedUserId(request);

    const db = getAdminFirestore();
    if (!db) {
      return NextResponse.json(
        { error: "SERVER_ERROR", message: "Firebase Admin not initialized" },
        { status: 500 }
      );
    }

    const profileRef = db.collection("businessProfiles").doc(uid);
    const snap = await profileRef.get();

    if (!snap.exists) {
      return NextResponse.json({ exists: false });
    }

    const data = snap.data() as Record<string, unknown> | undefined;
    if (!data) {
      return NextResponse.json({ exists: false });
    }

    const profile = toProfileJson(snap.id, data);
    const trialEndsAt = data.trialEndsAt;
    const trialEndsAtIso =
      trialEndsAt instanceof Timestamp
        ? trialEndsAt.toDate().toISOString()
        : typeof trialEndsAt === "string"
          ? trialEndsAt
          : trialEndsAt && typeof trialEndsAt === "object" && "toDate" in trialEndsAt
            ? (trialEndsAt as { toDate: () => Date }).toDate().toISOString()
            : undefined;
    return NextResponse.json({
      exists: true,
      profile,
      trialEndsAt: trialEndsAtIso ?? null,
      subscriptionStatus: (data.subscriptionStatus as string) ?? null,
      plan: (data.plan as string) ?? null,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    if (msg.startsWith("UNAUTHORIZED")) {
      return NextResponse.json({ error: "UNAUTHORIZED", message: msg }, { status: 401 });
    }
    console.error("[business-profile] GET Error:", msg);
    return NextResponse.json(
      { error: "SERVER_ERROR", message: "Failed to load business profile" },
      { status: 500 }
    );
  }
}

/** POST body for upsert */
interface PostBody {
  companyName?: string;
  companyEmail?: string;
  phone?: string;
  logoUrl?: string | null;
  defaultPaymentLink?: string | null;
}

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

export async function POST(request: NextRequest) {
  try {
    initFirebaseAdmin();
    const uid = await getAuthenticatedUserId(request);

    let body: PostBody;
    try {
      body = (await request.json()) as PostBody;
    } catch {
      return NextResponse.json(
        { error: "INVALID_INPUT", message: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const companyName = typeof body.companyName === "string" ? body.companyName.trim() : "";
    if (!companyName) {
      return NextResponse.json(
        { error: "INVALID_INPUT", message: "companyName is required" },
        { status: 400 }
      );
    }

    const companyEmail = typeof body.companyEmail === "string" ? body.companyEmail.trim() || undefined : undefined;
    if (companyEmail !== undefined && companyEmail !== "" && !isValidEmail(companyEmail)) {
      return NextResponse.json(
        { error: "INVALID_INPUT", message: "Invalid company email" },
        { status: 400 }
      );
    }

    const phone = typeof body.phone === "string" ? body.phone.trim() || undefined : undefined;
    const logoUrl = body.logoUrl === null || body.logoUrl === undefined
      ? undefined
      : (typeof body.logoUrl === "string" ? body.logoUrl.trim() || null : null);
    const defaultPaymentLink = body.defaultPaymentLink === null || body.defaultPaymentLink === undefined
      ? undefined
      : (typeof body.defaultPaymentLink === "string" ? body.defaultPaymentLink.trim() || null : null);

    const db = getAdminFirestore();
    if (!db) {
      return NextResponse.json(
        { error: "SERVER_ERROR", message: "Firebase Admin not initialized" },
        { status: 500 }
      );
    }

    const profileRef = db.collection("businessProfiles").doc(uid);
    const existing = await profileRef.get();

    const updateData: Record<string, unknown> = {
      companyName,
      companyEmail: companyEmail ?? null,
      phone: phone ?? null,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (logoUrl !== undefined) updateData.logoUrl = logoUrl;
    if (defaultPaymentLink !== undefined) updateData.defaultPaymentLink = defaultPaymentLink;
    if (!existing.exists) {
      updateData.createdAt = FieldValue.serverTimestamp();
      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + 7);
      updateData.trialStartedAt = FieldValue.serverTimestamp();
      updateData.trialEndsAt = Timestamp.fromDate(trialEnd);
      updateData.trialStatus = "active";
      updateData.subscriptionStatus = "trial";
      updateData.plan = "trial";
    }

    await profileRef.set(updateData, { merge: true });

    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    if (msg.startsWith("UNAUTHORIZED")) {
      return NextResponse.json({ error: "UNAUTHORIZED", message: msg }, { status: 401 });
    }
    console.error("[business-profile] POST Error:", msg);
    return NextResponse.json(
      { error: "SERVER_ERROR", message: "Failed to save business profile" },
      { status: 500 }
    );
  }
}
