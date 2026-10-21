import {toolsForScopes} from './skynet-worker-tool-registry.mjs';
export function dispatchToolAllowed(job,tool){return toolsForScopes(job.scopes||[]).some(t=>t.name===tool)}
export function dispatchAction(job,request){if(!request)return {status:'manual_task'};if(request.status!=='ready')return request;if(!dispatchToolAllowed(job,request.tool))return {status:'scope_required',tool:request.tool};if(request.tool==='github.commit'||request.tool==='gabia.deploy')return {...request,status:'approval_required'};return request}
