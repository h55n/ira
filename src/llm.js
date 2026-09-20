// Minimal tool-loop over an OpenAI-compatible chat endpoint.
async function callLLM(messages, toolDefs, key) {
  const body = { model: process.env.LLM_MODEL || 'gpt-4o-mini', messages };
  if (toolDefs.length) body.tools = toolDefs;
  return fetch(`${process.env.LLM_BASE_URL || 'https://api.openai.com/v1'}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(r => r.json()).catch(e => ({ error: { code: 0, message: e.message } }));
}

export async function complete({ system, history, tools, onTool }) {
  const key = process.env.LLM_API_KEY;
  if (!key) {
    // No LLM key yet (dev): pattern-match the demo flow so the loop is testable.
    const last = history[history.length - 1]?.content || '';
    return `Suniye, maine aapka "${last}" note kiya - abhi LLM key set nahi hai, isliye ye ek stub jawab hai.`;
  }
  const toolDefs = tools.map(t => ({
    type: 'function',
    function: { name: t.name, description: t.desc, parameters: { type: 'object', properties: {} } },
  }));
  const messages = [{ role: 'system', content: system }, ...history];
  for (let hops = 0; hops < 6; hops++) {
    const errOf = r => Array.isArray(r) ? r[0]?.error : r?.error;
    let res = await callLLM(messages, toolDefs, key);
    for (let tries = 0; (errOf(res)?.code === 429 || errOf(res)?.code === 503) && tries < 3; tries++) {
      // free-tier RPM cap - back off and retry
      await new Promise(r => setTimeout(r, 30000));
      res = await callLLM(messages, toolDefs, key);
    }
    const msg = res.choices?.[0]?.message;
    if (!msg) throw new Error('llm error: ' + JSON.stringify(errOf(res) || res).slice(0, 200));
    if (msg.tool_calls?.length) {
      messages.push(msg);
      for (const tc of msg.tool_calls) {
        const out = await onTool(tc.function.name, JSON.parse(tc.function.arguments || '{}'));
        messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(out) });
      }
      continue;
    }
    return msg.content;
  }
  return 'Maaf kijiye, ek moment - could you repeat that?';
}
