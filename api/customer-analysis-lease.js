// A distributed lock MUST be provided by a transactional store before analysis is enabled.
// Blob get/put is not used as a substitute for atomic compare-and-swap.
export class LeaseUnavailable extends Error {constructor(){super('원자적 실행권 저장소가 연결되지 않았습니다.');this.code='LEASE_UNAVAILABLE'}}
export function leaseConfigured(){return false}
export async function acquireLease(){throw new LeaseUnavailable()}
export async function renewLease(){throw new LeaseUnavailable()}
export async function assertLease(){throw new LeaseUnavailable()}
export async function releaseLease(){return false}
