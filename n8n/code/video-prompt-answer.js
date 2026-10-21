// What the page asking is told: the prompt and why, or why there is none.
// What it cost was kept before this (video_prompt_used), whatever came back.
const read = $('Read the prompt').first().json;
return [{ json: read.ok ? { ok: true, prompt: read.prompt, why: read.why } : { ok: false, error: read.error } }];
