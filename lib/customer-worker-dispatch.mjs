import {shouldDispatchCustomerWorker} from './customer-worker-owner.mjs';
// Gabia worker consumes the durable queue without remote serverless dispatch.
export function scheduleCustomerWorker(){return shouldDispatchCustomerWorker()}
