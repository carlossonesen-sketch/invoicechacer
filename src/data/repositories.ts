// Central export point for repositories
// Later, swap these implementations for Firebase versions

import { InvoiceRepository } from "@/domain/repos/invoice.repository";
import { BusinessProfileRepository } from "@/domain/repos/business-profile.repository";
import { EntitlementsRepository } from "@/domain/repos/entitlements.repository";
import { MockInvoiceRepository } from "./mock/invoice.repository.mock";
import { MockBusinessProfileRepository } from "./mock/business-profile.repository.mock";
import { MockEntitlementsRepository } from "./mock/entitlements.repository.mock";

export const invoiceRepo: InvoiceRepository = new MockInvoiceRepository();
export const businessProfileRepo: BusinessProfileRepository = new MockBusinessProfileRepository();
export const entitlementsRepo: EntitlementsRepository = new MockEntitlementsRepository();
