import { BusinessProfile } from "../types";

export interface BusinessProfileRepository {
  get(): Promise<BusinessProfile | null>;
  save(profile: BusinessProfile): Promise<void>;
}
