"use client";

import { BusinessProfile } from "@/domain/types";
import { BusinessProfileRepository } from "@/domain/repos/business-profile.repository";
import { storage } from "./local-storage-utils";

export class MockBusinessProfileRepository implements BusinessProfileRepository {
  get(): Promise<BusinessProfile | null> {
    const profile = storage.getItem<BusinessProfile | null>(storage.keys.BUSINESS_PROFILE, null);
    return Promise.resolve(profile);
  }

  save(profile: BusinessProfile): Promise<void> {
    storage.setItem(storage.keys.BUSINESS_PROFILE, profile);
    return Promise.resolve();
  }
}
