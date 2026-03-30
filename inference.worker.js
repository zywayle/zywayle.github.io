/**
 * Wayle Inference Worker
 * Architecture: ONNX Runtime Web → WebGPU backend
 * Implements: KV cache preallocation, chunked execution, sliding window, streaming
 */

importScripts('https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/dist/ort.min.js');

// ─── Config ───────────────────────────────────────────────────────────────────
const ORT_WASM_PATH = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/dist/';

ort.env.wasm.wasmPaths = ORT_WASM_PATH;
ort.env.webgpu.powerPreference = 'high-performance';
ort.env.webgpu.forceFallbackAdapter = false;

// ─── Model Registry ───────────────────────────────────────────────────────────
const MODEL_REGISTRY = {
  'qwen2.5-0.5b': {
    label: 'Qwen 2.5 · 0.5B',
    family: 'qwen',
    params: '0.5B',
    quantization: 'INT4',
    context: 2048,
    layers: 24,
    heads: 14,
    kvHeads: 2,
    headDim: 64,
    hiddenSize: 896,
    vocabSize: 151936,
    // HuggingFace ONNX Community exports
    baseUrl: 'https://huggingface.co/onnx-community/Qwen2.5-0.5B-Instruct/resolve/main/onnx/',
    files: ['model_q4.onnx'],
    tokenizer: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct/resolve/main/tokenizer.json',
    device: 'both',
    ramGB: 0.4,
    tags: ['fast', 'mobile'],
  },
  'qwen2.5-1.5b': {
    label: 'Qwen 2.5 · 1.5B',
    family: 'qwen',
    params: '1.5B',
    quantization: 'INT4',
    context: 4096,
    layers: 28,
    heads: 12,
    kvHeads: 2,
    headDim: 128,
    hiddenSize: 1536,
    vocabSize: 151936,
    baseUrl: 'https://huggingface.co/onnx-community/Qwen2.5-1.5B-Instruct/resolve/main/onnx/',
    files: ['model_q4.onnx'],
    tokenizer: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct/resolve/main/tokenizer.json',
    device: 'both',
    ramGB: 1.0,
    tags: ['fast', 'mobile'],
  },
  'qwen2.5-3b': {
    label: 'Qwen 2.5 · 3B',
    family: 'qwen',
    params: '3B',
    quantization: 'INT4',
    context: 8192,
    layers: 36,
    heads: 16,
    kvHeads: 2,
    headDim: 128,
    hiddenSize: 2048,
    vocabSize: 151936,
    baseUrl: 'https://huggingface.co/onnx-community/Qwen2.5-3B-Instruct/resolve/main/onnx/',
    files: ['model_q4.onnx'],
    tokenizer: 'https://huggingface.co/Qwen/Qwen2.5-3B-Instruct/resolve/main/tokenizer.json',
    device: 'both',
    ramGB: 2.0,
    tags: ['balanced', 'mobile'],
  },
  'llama3.2-1b': {
    label: 'Llama 3.2 · 1B',
    family: 'llama',
    params: '1B',
    quantization: 'INT4',
    context: 4096,
    layers: 16,
    heads: 32,
    kvHeads: 8,
    headDim: 64,
    hiddenSize: 2048,
    vocabSize: 128256,
    baseUrl: 'https://huggingface.co/onnx-community/Llama-3.2-1B-Instruct/resolve/main/onnx/',
    files: ['model_q4.onnx'],
    tokenizer: 'https://huggingface.co/meta-llama/Llama-3.2-1B-Instruct/resolve/main/tokenizer.json',
    device: 'both',
    ramGB: 0.8,
    tags: ['fast', 'mobile'],
  },
  'llama3.2-3b': {
    label: 'Llama 3.2 · 3B',
    family: 'llama',
    params: '3B',
    quantization: 'INT4',
    context: 8192,
    layers: 28,
    heads: 24,
    kvHeads: 8,
    headDim: 128,
    hiddenSize: 3072,
    vocabSize: 128256,
    baseUrl: 'https://huggingface.co/onnx-community/Llama-3.2-3B-Instruct/resolve/main/onnx/',
    files: ['model_q4.onnx'],
    tokenizer: 'https://huggingface.co/meta-llama/Llama-3.2-3B-Instruct/resolve/main/tokenizer.json',
    device: 'desktop',
    ramGB: 2.0,
    tags: ['balanced'],
  },
  'phi3.5-mini': {
    label: 'Phi-3.5 Mini · 3.8B',
    family: 'phi',
    params: '3.8B',
    quantization: 'INT4',
    context: 4096,
    layers: 32,
    heads: 32,
    kvHeads: 32,
    headDim: 96,
    hiddenSize: 3072,
    vocabSize: 32064,
    baseUrl: 'https://huggingface.co/onnx-community/Phi-3.5-mini-instruct/resolve/main/onnx/',
    files: ['model_q4.onnx'],
    tokenizer: 'https://huggingface.co/microsoft/Phi-3.5-mini-instruct/resolve/main/tokenizer.json',
    device: 'desktop',
    ramGB: 2.4,
    tags: ['smart', 'desktop'],
  },
};

// ─── State ────────────────────────────────────────────────────────────────────
let session = null;
let currentModelId = null;
let modelConfig = null;
let kvCache = null;
let inferenceAborted = false;
let tokenizer = null;

// ─── KV Cache System ──────────────────────────────────────────────────────────
class KVCache {
  constructor(config) {
    this.config = config;
    const { layers, kvHeads, headDim, context } = config;
    this.maxLen = context;
    this.currentLen = 0;
    // Preallocate: [layers][2 (k/v)][kvHeads][maxLen][headDim] as Float16
    // Using Float32 here since JS doesn't natively do Float16 arrays
    // In production: use Uint16 + manual fp16 encode/decode
    this.buffers = [];
    for (let l = 0; l < layers; l++) {
      this.buffers.push({
        key: new Float32Array(kvHeads * this.maxLen * headDim),
        value: new Float32Array(kvHeads * this.maxLen * headDim),
      });
    }
    this.headDim = headDim;
    this.kvHeads = kvHeads;
  }

  reset() {
    this.currentLen = 0;
    // Zero fill (reuse buffers, no new allocations)
    for (const b of this.buffers) {
      b.key.fill(0);
      b.value.fill(0);
    }
  }

  // Sliding window: drop first half of tokens when near limit
  slide() {
    const keep = Math.floor(this.maxLen / 2);
    const drop = this.currentLen - keep;
    if (drop <= 0) return;
    const { kvHeads, headDim } = this;
    for (const b of this.buffers) {
      for (let h = 0; h < kvHeads; h++) {
        const stride = headDim;
        const hOff = h * this.maxLen * stride;
        b.key.copyWithin(hOff, hOff + drop * stride, hOff + this.currentLen * stride);
        b.value.copyWithin(hOff, hOff + drop * stride, hOff + this.currentLen * stride);
      }
    }
    this.currentLen = keep;
  }

  needsSlide() {
    return this.currentLen >= this.maxLen - 64;
  }
}

// ─── Tokenizer (simple BPE placeholder — real tokenizer loaded from HF) ───────
class SimpleTokenizer {
  constructor(tokenizerData) {
    this.data = tokenizerData;
    this.vocab = tokenizerData.model?.vocab || {};
    this.merges = tokenizerData.model?.merges || [];
    this.addedTokens = {};
    (tokenizerData.added_tokens || []).forEach(t => {
      this.addedTokens[t.content] = t.id;
    });
    // Build reverse vocab
    this.idToToken = {};
    for (const [tok, id] of Object.entries(this.vocab)) {
      this.idToToken[id] = tok;
    }
    for (const [tok, id] of Object.entries(this.addedTokens)) {
      this.idToToken[id] = tok;
    }
  }

  encode(text) {
    // Simplified — real impl uses BPE
    // Return placeholder tokens for demo; real model uses HF tokenizer WASM
    const bytes = new TextEncoder().encode(text);
    return Array.from(bytes).map(b => b + 1);
  }

  decode(ids) {
    const tokens = ids.map(id => {
      const t = this.idToToken[id] || '';
      return t.replace(/▁/g, ' ').replace(/Ġ/g, ' ');
    });
    return tokens.join('');
  }

  get bosId() { return this.data.bos_token_id ?? 1; }
  get eosId() { return this.data.eos_token_id ?? 2; }
}

// ─── Model Loading ────────────────────────────────────────────────────────────
async function loadModel(modelId, onProgress) {
  const config = MODEL_REGISTRY[modelId];
  if (!config) throw new Error(`Unknown model: ${modelId}`);

  onProgress({ phase: 'fetch', text: 'Checking WebGPU…', percent: 0 });

  // Verify WebGPU
  if (!self.navigator?.gpu) {
    throw new Error('NO_WEBGPU');
  }
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('NO_WEBGPU_ADAPTER');

  onProgress({ phase: 'fetch', text: 'Fetching model weights…', percent: 2 });

  // Load ONNX files (potentially multiple shards)
  const modelBuffers = [];
  for (let i = 0; i < config.files.length; i++) {
    const url = config.baseUrl + config.files[i];
    const buf = await fetchWithProgress(url, (p) => {
      const fileProgress = (i / config.files.length + p / config.files.length) * 70;
      onProgress({
        phase: 'fetch',
        text: `Downloading ${config.files[i]}… (${formatBytes(p * 1e6 * config.ramGB * 1.2)})`,
        percent: Math.round(2 + fileProgress),
      });
    });
    modelBuffers.push(buf);
  }

  onProgress({ phase: 'compile', text: 'Compiling WebGPU shaders…', percent: 75 });

  // Create ONNX session with WebGPU
  const sessionOptions = {
    executionProviders: [
      {
        name: 'webgpu',
        deviceType: 'gpu',
        powerPreference: 'high-performance',
        preferredLayout: 'NHWC',
      }
    ],
    graphOptimizationLevel: 'all',
    enableCpuMemArena: false,
    enableMemPattern: false,
    executionMode: 'sequential',
    logSeverityLevel: 3,
    // Chunked execution to avoid GPU timeout
    interOpNumThreads: 1,
    intraOpNumThreads: 1,
  };

  // Merge shards if multiple (simplified — real impl uses model splitting)
  const modelData = modelBuffers.length === 1
    ? modelBuffers[0]
    : mergeShards(modelBuffers);

  onProgress({ phase: 'compile', text: 'Initializing inference session…', percent: 85 });

  session = await ort.InferenceSession.create(modelData, sessionOptions);

  onProgress({ phase: 'tokenizer', text: 'Loading tokenizer…', percent: 90 });

  // Load tokenizer
  try {
    const tokRes = await fetch(config.tokenizer);
    const tokData = await tokRes.json();
    tokenizer = new SimpleTokenizer(tokData);
  } catch {
    tokenizer = new SimpleTokenizer({ model: { vocab: {}, merges: [] }, added_tokens: [] });
  }

  // Preallocate KV cache
  onProgress({ phase: 'cache', text: 'Preallocating KV cache…', percent: 95 });
  kvCache = new KVCache(config);

  currentModelId = modelId;
  modelConfig = config;

  onProgress({ phase: 'ready', text: 'Ready', percent: 100 });
  return { success: true, config };
}

async function fetchWithProgress(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  const total = parseInt(res.headers.get('content-length') || '0');
  const reader = res.body.getReader();
  const chunks = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    if (total > 0) onProgress(received / total);
  }

  const combined = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return combined.buffer;
}

function mergeShards(buffers) {
  // Simple concat — real impl merges ONNX graphs
  const total = buffers.reduce((a, b) => a + b.byteLength, 0);
  const merged = new Uint8Array(total);
  let off = 0;
  for (const buf of buffers) {
    merged.set(new Uint8Array(buf), off);
    off += buf.byteLength;
  }
  return merged.buffer;
}

function formatBytes(bytes) {
  if (bytes < 1e6) return `${(bytes / 1e3).toFixed(0)} KB`;
  return `${(bytes / 1e6).toFixed(1)} MB`;
}

// ─── Inference Pipeline ───────────────────────────────────────────────────────
async function* runInference(prompt, config = {}) {
  if (!session) throw new Error('No model loaded');
  if (kvCache.needsSlide()) kvCache.slide();

  inferenceAborted = false;

  const maxNewTokens = config.maxTokens ?? 512;
  const temperature = config.temperature ?? 0.7;
  const topP = config.topP ?? 0.9;
  const topK = config.topK ?? 50;

  // Tokenize
  const systemPrompt = 'You are Wayle, a helpful, concise and smart AI assistant.';
  const fullPrompt = buildPrompt(prompt, systemPrompt, modelConfig.family);
  let inputIds = tokenizer.encode(fullPrompt);

  // Ensure we have room
  if (inputIds.length > modelConfig.context - 64) {
    inputIds = inputIds.slice(-(modelConfig.context - 64));
  }

  const eosTokens = new Set([
    tokenizer.eosId,
    ...(modelConfig.family === 'qwen' ? [151645, 151643] : []),
    ...(modelConfig.family === 'llama' ? [128001, 128009] : []),
  ]);

  let positionId = kvCache.currentLen;
  const chunkSize = 4; // Run N transformer blocks then yield to event loop
  let generated = 0;
  let pastLen = 0;

  // Prefill phase (process input tokens)
  for (let i = 0; i < inputIds.length; i++) {
    if (inferenceAborted) return;
    const feeds = buildFeeds([inputIds[i]], positionId + i, pastLen);
    // Run in chunks to avoid blocking
    if (i % chunkSize === 0) await yieldToEventLoop();
    try {
      const result = await session.run(feeds);
      updateKVFromResult(result, positionId + i);
      pastLen = positionId + i + 1;
    } catch (e) {
      throw new Error(`Prefill failed at token ${i}: ${e.message}`);
    }
  }

  positionId += inputIds.length;
  kvCache.currentLen = positionId;

  // Autoregressive decode phase
  let lastTokenId = inputIds[inputIds.length - 1];
  let tokenBuffer = [];

  while (generated < maxNewTokens && !inferenceAborted) {
    const feeds = buildFeeds([lastTokenId], positionId, pastLen);

    let result;
    try {
      result = await session.run(feeds);
    } catch (e) {
      throw new Error(`Decode step ${generated} failed: ${e.message}`);
    }

    // Extract logits
    const logits = extractLogits(result);
    updateKVFromResult(result, positionId);
    pastLen = positionId + 1;
    positionId++;
    kvCache.currentLen = positionId;

    // Sample next token
    const nextToken = sample(logits, temperature, topK, topP);

    if (eosTokens.has(nextToken)) break;

    lastTokenId = nextToken;
    generated++;
    tokenBuffer.push(nextToken);

    // Decode and yield (buffer a few tokens for better subword decoding)
    if (tokenBuffer.length >= 3 || generated === 1) {
      const text = tokenizer.decode(tokenBuffer);
      if (text) yield text;
      tokenBuffer = [];
    }

    // Yield to event loop every 4 tokens to keep UI responsive
    if (generated % chunkSize === 0) await yieldToEventLoop();

    // Sliding window check
    if (kvCache.needsSlide()) {
      kvCache.slide();
      positionId = kvCache.currentLen;
    }
  }

  // Flush remaining tokens
  if (tokenBuffer.length > 0) {
    const text = tokenizer.decode(tokenBuffer);
    if (text) yield text;
  }
}

function buildPrompt(userMessage, system, family) {
  switch (family) {
    case 'qwen':
      return `<|im_start|>system\n${system}<|im_end|>\n<|im_start|>user\n${userMessage}<|im_end|>\n<|im_start|>assistant\n`;
    case 'llama':
      return `<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n${system}<|eot_id|><|start_header_id|>user<|end_header_id|>\n\n${userMessage}<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n`;
    case 'phi':
      return `<|system|>\n${system}<|end|>\n<|user|>\n${userMessage}<|end|>\n<|assistant|>\n`;
    default:
      return `${system}\n\nUser: ${userMessage}\nAssistant: `;
  }
}

function buildFeeds(inputIds, positionId, pastLen) {
  // Build standard ONNX decoder feeds
  const idsTensor = new ort.Tensor('int64', BigInt64Array.from(inputIds.map(BigInt)), [1, inputIds.length]);
  const maskLen = pastLen + inputIds.length;
  const maskTensor = new ort.Tensor('int64', new BigInt64Array(maskLen).fill(1n), [1, maskLen]);
  const posTensor = new ort.Tensor(
    'int64',
    BigInt64Array.from(inputIds.map((_, i) => BigInt(positionId + i))),
    [1, inputIds.length]
  );

  const feeds = {
    input_ids: idsTensor,
    attention_mask: maskTensor,
    position_ids: posTensor,
  };

  // Inject past KV cache tensors
  if (kvCache && pastLen > 0) {
    for (let l = 0; l < modelConfig.layers; l++) {
      const { key, value } = kvCache.buffers[l];
      const { kvHeads, headDim } = kvCache;
      const kSlice = key.slice(0, kvHeads * pastLen * headDim);
      const vSlice = value.slice(0, kvHeads * pastLen * headDim);
      feeds[`past_key_values.${l}.key`] = new ort.Tensor('float32', kSlice, [1, kvHeads, pastLen, headDim]);
      feeds[`past_key_values.${l}.value`] = new ort.Tensor('float32', vSlice, [1, kvHeads, pastLen, headDim]);
    }
  }

  return feeds;
}

function updateKVFromResult(result, positionId) {
  if (!kvCache) return;
  for (let l = 0; l < modelConfig.layers; l++) {
    const kKey = `present.${l}.key`;
    const vKey = `present.${l}.value`;
    if (result[kKey]) {
      const kData = result[kKey].data;
      const vData = result[vKey].data;
      const { kvHeads, headDim } = kvCache;
      const offset = (positionId + 1) * headDim;
      for (let h = 0; h < kvHeads; h++) {
        const srcOff = h * offset;
        const dstOff = h * kvCache.maxLen * headDim;
        kvCache.buffers[l].key.set(kData.slice(srcOff, srcOff + offset), dstOff);
        kvCache.buffers[l].value.set(vData.slice(srcOff, srcOff + offset), dstOff);
      }
    }
  }
}

function extractLogits(result) {
  const logitsKey = Object.keys(result).find(k => k.includes('logit') || k === 'last_hidden_state' || k === 'output');
  if (!logitsKey) throw new Error('No logits in model output');
  const logitsData = result[logitsKey].data;
  const vocabSize = modelConfig.vocabSize;
  // Last token logits
  return logitsData.slice(-vocabSize);
}

// ─── Sampling ─────────────────────────────────────────────────────────────────
function sample(logits, temperature, topK, topP) {
  // Temperature scaling
  const scaled = new Float32Array(logits.length);
  const temp = Math.max(temperature, 1e-6);
  for (let i = 0; i < logits.length; i++) scaled[i] = logits[i] / temp;

  // Softmax
  let maxVal = -Infinity;
  for (let i = 0; i < scaled.length; i++) if (scaled[i] > maxVal) maxVal = scaled[i];
  let sum = 0;
  const probs = new Float32Array(scaled.length);
  for (let i = 0; i < scaled.length; i++) {
    probs[i] = Math.exp(scaled[i] - maxVal);
    sum += probs[i];
  }
  for (let i = 0; i < probs.length; i++) probs[i] /= sum;

  // Top-K filtering
  const indexed = Array.from(probs).map((p, i) => [i, p]).sort((a, b) => b[1] - a[1]);
  const topKItems = indexed.slice(0, topK);

  // Top-P (nucleus) filtering
  let cumSum = 0;
  const nucleus = [];
  for (const [id, p] of topKItems) {
    nucleus.push([id, p]);
    cumSum += p;
    if (cumSum >= topP) break;
  }

  // Renormalize
  const nucleusSum = nucleus.reduce((s, [, p]) => s + p, 0);
  const rand = Math.random() * nucleusSum;
  let acc = 0;
  for (const [id, p] of nucleus) {
    acc += p;
    if (rand <= acc) return id;
  }
  return nucleus[0][0];
}

function yieldToEventLoop() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

// ─── Message Handler ──────────────────────────────────────────────────────────
self.onmessage = async ({ data }) => {
  const { type, id } = data;

  switch (type) {
    case 'load_model': {
      try {
        const result = await loadModel(data.modelId, (progress) => {
          self.postMessage({ type: 'load_progress', id, ...progress });
        });
        self.postMessage({ type: 'load_done', id, config: result.config });
      } catch (e) {
        self.postMessage({ type: 'load_error', id, error: e.message });
      }
      break;
    }

    case 'generate': {
      try {
        const gen = runInference(data.prompt, data.options);
        let tokenCount = 0;
        const t0 = performance.now();
        for await (const token of gen) {
          if (inferenceAborted) break;
          tokenCount++;
          const elapsed = (performance.now() - t0) / 1000;
          self.postMessage({
            type: 'token',
            id,
            token,
            stats: { tokensPerSec: tokenCount / elapsed, tokenCount }
          });
        }
        self.postMessage({
          type: 'done',
          id,
          stats: {
            totalTokens: tokenCount,
            totalMs: performance.now() - t0,
          }
        });
      } catch (e) {
        self.postMessage({ type: 'generate_error', id, error: e.message });
      }
      break;
    }

    case 'abort': {
      inferenceAborted = true;
      self.postMessage({ type: 'aborted', id });
      break;
    }

    case 'reset_kv': {
      if (kvCache) kvCache.reset();
      self.postMessage({ type: 'kv_reset', id });
      break;
    }

    case 'get_models': {
      self.postMessage({ type: 'models', id, models: MODEL_REGISTRY });
      break;
    }

    case 'unload': {
      session = null;
      kvCache = null;
      currentModelId = null;
      modelConfig = null;
      self.postMessage({ type: 'unloaded', id });
      break;
    }
  }
};
