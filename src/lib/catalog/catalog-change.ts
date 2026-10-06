import { forgetRawProducts } from "./raw-product-cache";
import { clearAcsStageFiveCache } from "./acs/stage-five-listing";
import { clearGeneratedStageFiveCache } from "./acs/stage-five-preview";

/**
 * A store webhook said this product changed (or went away). Every cached view built from the old
 * version is marked out of date: the stored product read is dropped, and the Stage 5 preview and ACS
 * mirror refresh on their next read while still answering instantly from what they hold.
 */
export function noteStoreProductChanged(connectionId: string, externalId: string): void {
  forgetRawProducts(connectionId, [externalId]);
  clearGeneratedStageFiveCache(connectionId);
  clearAcsStageFiveCache(connectionId);
}
