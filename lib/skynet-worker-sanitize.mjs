export function safeToolResult(result){const data=JSON.stringify(result);if(!data||data.length>20000)throw Error('TOOL_RESULT_TOO_LARGE');return JSON.parse(data)}
