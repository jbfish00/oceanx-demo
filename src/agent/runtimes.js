// Runtime adapters — each exposes the same async signature so the orchestrator
// can walk a chain of {runtime, model, label} entries without caring which
// silicon serves the request. Adding a new runtime is a single export.

const OLLAMA_URL = 'http://localhost:11434/api/generate';
const OPENVINO_URL = 'http://localhost:1234/v1/chat/completions';

// Ollama: existing path. POSTs to Ollama's native generate endpoint with
// JSON-mode coercion. Battle-tested in this demo since v1.
export const ollamaRuntime = {
  name: 'ollama',
  async generate({ prompt, model }) {
    const response = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, stream: false, format: 'json' }),
    });
    if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
    const data = await response.json();
    return cleanJson(data.response || '');
  },
};

// OpenVINO via LM Studio: OpenAI-compatible chat-completions endpoint on :1234.
// LM Studio's OpenVINO runtime targets the Intel NPU or Arc iGPU depending on
// how the model was loaded in LM Studio (Device: NPU vs GPU).
export const openvinoRuntime = {
  name: 'openvino',
  async generate({ prompt, model }) {
    const response = await fetch(OPENVINO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        max_tokens: 1024,
        response_format: { type: 'json_object' },
      }),
    });
    if (!response.ok) throw new Error(`LM Studio HTTP ${response.status}`);
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || '';
    return cleanJson(content);
  },
};

const RUNTIMES = {
  ollama: ollamaRuntime,
  openvino: openvinoRuntime,
};

export function getRuntime(name) {
  const r = RUNTIMES[name];
  if (!r) throw new Error(`Unknown runtime: ${name}`);
  return r;
}

function cleanJson(raw) {
  return String(raw).replace(/```json/gi, '').replace(/```/g, '').trim();
}
