export const AUTO_READ_TOOLS=Object.freeze(['github.read','gabia.inspect']);
export function autoReadAllowed(name){return AUTO_READ_TOOLS.includes(name)}
