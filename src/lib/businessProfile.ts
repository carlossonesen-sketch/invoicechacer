import { doc, getDoc, setDoc, onSnapshot, Timestamp, serverTimestamp, DocumentData } from "firebase/firestore";
import { db } from "./firebase";

export interface BusinessProfile {
  uid: string;
  companyName: string;
  companyEmail?: string;
  phone?: string;
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

  const profileRef = doc(db, "businessProfiles", uid);
  const profileSnap = await getDoc(profileRef);

  if (!profileSnap.exists()) {
    return null;
  }

  const data = profileSnap.data();
  return {
    uid: profileSnap.id,
    companyName: data.companyName || "",
    companyEmail: data.companyEmail,
    phone: data.phone,
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
          createdAt: data.createdAt || serverTimestamp(),
          updatedAt: data.updatedAt || serverTimestamp(),
        };

        callback(profile);
      },
      (error) => {
        console.error("Error subscribing to business profile:", error);
        callback(null, error.message || "Failed to load business profile");
      }
    );

    return unsubscribe;
  } catch (error: any) {
    console.error("Error setting up business profile subscription:", error);
    callback(null, error.message || "Failed to set up business profile subscription");
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
  }
): Promise<void> {
  if (!db) {
    throw new Error("Firebase not initialized. Please check your environment variables.");
  }

  const profileRef = doc(db, "businessProfiles", uid);
  const existingDoc = await getDoc(profileRef);

  const updateData: any = {
    companyName: data.companyName,
    companyEmail: data.companyEmail || null,
    phone: data.phone || null,
    updatedAt: serverTimestamp(),
  };

  // Only set createdAt if document doesn't exist
  if (!existingDoc.exists()) {
    updateData.createdAt = serverTimestamp();
  }

  await setDoc(profileRef, updateData, { merge: true });
}
