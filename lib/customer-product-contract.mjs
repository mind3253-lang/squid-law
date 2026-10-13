/**
 * SQUIDLAW customer-facing product invariants. Owner-approved decisions,
 * not defaults an assistant may change when a server hits a timeout.
 *
 * Operational size/time limits belong INSIDE staged extraction/workers.
 * They must not silently turn into customer-facing document size tiers.
 */
export const CUSTOMER_PRODUCT_CONTRACT=Object.freeze({
 analysisConcurrency:1,
 billingUnit:'verified_source_page',
 submission:'one_customer_action_for_entire_case',
 queue:'global_fifo_with_position_and_estimated_wait',
 execution:'durable_checkpoints_with_retry_and_resume',
 customerFileSizeTier:'not_a_pricing_or_product_boundary'
});

export function customerProcessingPolicy(){
 return CUSTOMER_PRODUCT_CONTRACT;
}
