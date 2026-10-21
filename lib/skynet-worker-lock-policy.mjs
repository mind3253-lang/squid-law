export function writeLockRequired(tool){return ['github.patch','github.commit','gabia.deploy','file.export'].includes(tool)}
export function canRunWithoutDistributedLock(tool){return ['github.read','github.search','gabia.inspect','gabia.logs','web.search','file.inspect'].includes(tool)}
