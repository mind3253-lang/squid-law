import {TOOL_SCOPES} from './skynet-tool-policy.mjs';
export function availableTools(){return Object.entries(TOOL_SCOPES).map(([name,scope])=>({name,scope}))}
export function toolKnown(name){return Object.hasOwn(TOOL_SCOPES,name)}
