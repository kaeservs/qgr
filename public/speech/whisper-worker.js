// What is said in a clip, heard on the team's own computer: OpenAI's Whisper
// (base, which knows many languages) run by transformers.js, on WebGPU where
// the browser has it and WebAssembly otherwise. Nothing is sent anywhere and
// nothing is paid for: the model (about 80 MB) is fetched once from Hugging
// Face and the browser keeps it, and the clip's sound never leaves this tab.
// The page decodes the sound (16 kHz, one channel) and sends it here; this
// answers with Whisper's timed passages, which lib/transcribe.ts turns into
// caption lines.
//
// transformers.js is pinned to a release at least two weeks old when it was
// taken (4.3.0, 2026-09-16), loaded as its own browser build.
const LIBRARY = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0/dist/transformers.min.js';
const MODEL = 'onnx-community/whisper-base';

let lib = null;
let transcriber = null;
let device = null;

/** The model's files as they download: the share of all of them so far, or null while sizes are unknown. */
function downloads(post) {
  const files = new Map();
  return (p) => {
    if (!p || typeof p.file !== 'string') return;
    if (p.status === 'progress' && typeof p.total === 'number' && p.total > 0) files.set(p.file, { loaded: p.loaded || 0, total: p.total });
    else if (p.status === 'done' && files.has(p.file)) files.set(p.file, { loaded: files.get(p.file).total, total: files.get(p.file).total });
    else return;
    let loaded = 0;
    let total = 0;
    files.forEach((f) => {
      loaded += f.loaded;
      total += f.total;
    });
    post({ type: 'loading', share: total > 0 ? Math.min(1, loaded / total) : null });
  };
}

async function load(post, onlyWasm) {
  if (!lib) lib = await import(LIBRARY);
  lib.env.allowLocalModels = false;
  const progress_callback = downloads(post);
  const gpu = !onlyWasm && self.navigator && self.navigator.gpu ? await self.navigator.gpu.requestAdapter().catch(() => null) : null;
  if (gpu) {
    try {
      transcriber = await lib.pipeline('automatic-speech-recognition', MODEL, {
        device: 'webgpu',
        dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' },
        progress_callback,
      });
      device = 'webgpu';
      return;
    } catch (err) {
      // Some graphics chips cannot run it: WebAssembly runs anywhere.
    }
  }
  transcriber = await lib.pipeline('automatic-speech-recognition', MODEL, { device: 'wasm', dtype: 'q8', progress_callback });
  device = 'wasm';
}

/** How far through the clip Whisper is, by the 30-second windows it has finished. */
function windows(audio, post) {
  const total = Math.max(1, Math.ceil(Math.max(0, audio.length / 16000 - 30) / 20) + 1);
  let done = 0;
  try {
    return new lib.WhisperTextStreamer(transcriber.tokenizer, {
      skip_prompt: true,
      callback_function: () => {},
      on_finalize: () => {
        done += 1;
        post({ type: 'listening', share: Math.min(1, done / total) });
      },
    });
  } catch (err) {
    return undefined;
  }
}

async function listen(audio, post) {
  post({ type: 'listening', share: null });
  const streamer = windows(audio, post);
  const options = { return_timestamps: true, chunk_length_s: 30, stride_length_s: 5, task: 'transcribe' };
  if (streamer) options.streamer = streamer;
  return transcriber(audio, options);
}

self.onmessage = async (event) => {
  const { id, audio } = event.data || {};
  const post = (message) => self.postMessage({ id, ...message });
  let stage = 'loading';
  try {
    if (!(audio instanceof Float32Array)) throw new Error('No sound was sent.');
    if (!transcriber) {
      post({ type: 'loading', share: null });
      await load(post, false);
    }
    stage = 'listening';
    let out;
    try {
      out = await listen(audio, post);
    } catch (err) {
      if (device !== 'webgpu') throw err;
      // WebGPU loaded but could not run it: once more on WebAssembly.
      transcriber = null;
      await load(post, true);
      out = await listen(audio, post);
    }
    post({ type: 'done', device, chunks: Array.isArray(out && out.chunks) ? out.chunks : [] });
  } catch (err) {
    post({ type: 'failed', stage, error: String((err && err.message) || err || 'Whisper could not run here.').slice(0, 300) });
  }
};
