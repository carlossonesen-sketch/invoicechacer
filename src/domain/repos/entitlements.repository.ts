export interface EntitlementsRepository {
  isPro(): Promise<boolean>;
  setProForDev(value: boolean): Promise<void>;
}
