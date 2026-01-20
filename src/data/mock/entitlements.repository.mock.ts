"use client";

import { EntitlementsRepository } from "@/domain/repos/entitlements.repository";
import { storage } from "./local-storage-utils";

export class MockEntitlementsRepository implements EntitlementsRepository {
  isPro(): Promise<boolean> {
    const entitlements = storage.getItem<{ isPro: boolean }>(storage.keys.ENTITLEMENTS, { isPro: false });
    return Promise.resolve(entitlements.isPro);
  }

  setProForDev(value: boolean): Promise<void> {
    storage.setItem(storage.keys.ENTITLEMENTS, { isPro: value });
    return Promise.resolve();
  }
}
