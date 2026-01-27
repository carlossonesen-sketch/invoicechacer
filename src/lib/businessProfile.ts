import { doc, getDoc, setDoc, onSnapshot, Timestamp, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";
import { logFirestoreInstrumentation } from "./firestoreInstrumentation";

export interface BusinessProfile {
  uid: string;
  companyName: string;
  companyEmail?: string;
  phone?: string;
  logoUrl?: string;
  defaultPaymentLink?: string;
  createdAt: Timestamp | string;
  updatedAt: Timestamp | string;
}

/**
 * Get business profile (one-time fetch)
 */
export async function getBusinessProfile(uid: string): Promise<BusinessProfile | null> {
  if (!db) {
    throw new Error("Firebase not initialized. Please check your environment variables.");
  }

  if (process.env.NEXT_PUBLIC_DEV_TOOLS === "1") {
    console.log("[DEV getBusinessProfile] uid:", uid, "docPath:", `businessProfiles/${uid}`);
  }

  const profileRef = doc(db, "businessProfiles", uid);
  let profileSnap;
  try {
    profileSnap = await getDoc(profileRef);
  } catch (error) {
    logFirestoreInstrumentation("businessProfile:getDoc", error, { docPath: `businessProfiles/${uid}` });
    throw error;
  }

  if (!profileSnap.exists()) {
    return null;
  }

  const data = profileSnap.data();
  return {
    uid: profileSnap.id,
    companyName: data.companyName || "",
    companyEmail: data.companyEmail,
    phone: data.phone,
    logoUrl: data.logoUrl,
    defaultPaymentLink: data.defaultPaymentLink,
    createdAt: data.createdAt || serverTimestamp(),
    updatedAt: data.updatedAt || serverTimestamp(),
  } as BusinessProfile;
}

/**
 * Subscribe to business profile changes (optional, if helpful)
 */
export function subscribeBusinessProfile(
  uid: string,
  callback: (profile: BusinessProfile | null, error?: string) => void
): () => void {
  if (!db) {
    callback(null, "Firebase not initialized. Please check your environment variables.");
    return () => {};
  }

  try {
    const profileRef = doc(db, "businessProfiles", uid);

    const unsubscribe = onSnapshot(
      profileRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          callback(null);
          return;
        }

        const data = snapshot.data();
        const profile: BusinessProfile = {
          uid: snapshot.id,
          companyName: data.companyName || "",
          companyEmail: data.companyEmail,
          phone: data.phone,
          logoUrl: data.logoUrl,
          defaultPaymentLink: data.defaultPaymentLink,
          createdAt: data.createdAt || serverTimestamp(),
          updatedAt: data.updatedAt || serverTimestamp(),
        };

        callback(profile);
      },
      (error) => {
        logFirestoreInstrumentation("businessProfile:subscribe", error, { docPath: `businessProfiles/${uid}` });
        callback(null, error.message || "Failed to load business profile");
      }
    );

    return unsubscribe;
  } catch (error: unknown) {
    logFirestoreInstrumentation("businessProfile:subscribe setup", error, { docPath: `businessProfiles/${uid}` });
    callback(null, error instanceof Error ? error.message : "Failed to set up business profile subscription");
    return () => {};
  }
}

/**
 * Upsert business profile
 */
export async function upsertBusinessProfile(
  uid: string,
  data: {
    companyName: string;
    companyEmail?: string;
    phone?: string;
    logoUrl?: string | null;
    defaultPaymentLink?: string | null;
  }
): Promise<void> {
  if (!db) {
    throw new Error("Firebase not initialized. Please check your environment variables.");
  }

  const profileRef = doc(db, "businessProfiles", uid);
  const existingDoc = await getDoc(profileRef);

  const updateData: Record<string, unknown> = {
    companyName: data.companyName,
    companyEmail: data.companyEmail || null,
    phone: data.phone || null,
    logoUrl: data.logoUrl !== undefined ? (data.logoUrl?.trim() || null) : undefined,
    defaultPaymentLink: data.defaultPaymentLink !== undefined ? (data.defaultPaymentLink?.trim() || null) : undefined,
    updatedAt: serverTimestamp(),
  };

  // Only set createdAt if document doesn't exist
  if (!existingDoc.exists()) {
    updateData.createdAt = serverTimestamp();
  }

  // Omit undefined so Firestore does not receive undefined
  if (updateData.logoUrl === undefined) delete updateData.logoUrl;
  if (updateData.defaultPaymentLink === undefined) delete updateData.defaultPaymentLink;

  await setDoc(profileRef, updateData, { merge: true });
}
