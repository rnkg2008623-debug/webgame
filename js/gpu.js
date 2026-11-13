'use strict';
// WebGPU 背景: 霧・刃のような光の筋・舞う花びら・マウス追従の光
const WGSL = /* wgsl */`
struct U { res: vec2f, time: f32, pad: f32, mouse: vec2f, pad2: vec2f };
@group(0) @binding(0) var<uniform> u: U;

@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  var p = array<vec2f,3>(vec2f(-1,-1), vec2f(3,-1), vec2f(-1,3));
  return vec4f(p[i], 0, 1);
}
fn hash(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453); }
fn noise(p: vec2f) -> f32 {
  let i = floor(p); let f = fract(p); let w = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2f(1,0)), w.x), mix(hash(i+vec2f(0,1)), hash(i+vec2f(1,1)), w.x), w.y);
}
fn fbm(p0: vec2f) -> f32 {
  var p = p0; var a = 0.5; var s = 0.0;
  for (var k = 0; k < 5; k++) { s += a * noise(p); p = p * 2.03 + 11.7; a *= 0.5; }
  return s;
}
fn petals(p: vec2f, t: f32, scale: f32, seed: f32) -> f32 {
  var q = p * scale;
  q.y += t * 0.35 * (0.6 + seed);
  q.x += sin(q.y * 0.8 + seed * 9.0) * 0.4 + t * 0.12;
  let id = floor(q); let f = fract(q) - 0.5;
  let r = hash(id + seed);
  if (r < 0.6) { return 0.0; }
  let o = vec2f(hash(id + 3.1), hash(id + 7.7)) - 0.5;
  let d = (f - o * 0.6) * vec2f(1.0, 2.2);
  let tw = 0.5 + 0.5 * sin(t * 2.0 + r * 40.0);
  return smoothstep(0.09, 0.0, length(d)) * (0.5 + 0.5 * tw);
}
@fragment fn fs(@builtin(position) fp: vec4f) -> @location(0) vec4f {
  let uv = fp.xy / u.res;
  let asp = u.res.x / u.res.y;
  let p = vec2f(uv.x * asp, uv.y);
  let t = u.time;

  // 霧
  let m1 = fbm(p * 2.2 + vec2f(t * 0.03, -t * 0.02));
  let m2 = fbm(p * 4.0 - vec2f(t * 0.04, t * 0.01) + m1 * 2.0);

  // ベース: 左中央が明るく、周辺は暗い紫灰色
  let c = vec2f(0.30 * asp, 0.42);
  let d = length((p - c) * vec2f(0.8, 1.0));
  var col = mix(vec3f(0.90, 0.87, 0.98), vec3f(0.17, 0.15, 0.24), smoothstep(0.10, 1.05, d));
  col = mix(col, vec3f(0.60, 0.52, 0.85), m2 * 0.35);
  col += (m1 - 0.5) * 0.18;

  // 斜めに走る鋭い光の筋(割れたガラス/髪束のイメージ)
  let dir = normalize(vec2f(1.0, -0.55));
  let s = dot(p, dir) * 7.0 + m1 * 3.0;
  let streak = pow(abs(sin(s * 3.14159)), 40.0) * smoothstep(0.9, 0.2, d);
  col += vec3f(0.85, 0.80, 1.0) * streak * 0.35;

  // 花びら・きらめき
  let pe = petals(p, t, 9.0, 1.0) + petals(p, t * 1.4, 16.0, 2.0) * 0.8;
  col += vec3f(1.0, 0.97, 1.0) * pe * 0.8;

  // マウス追従の紫の光
  let md = length((uv - u.mouse) * vec2f(asp, 1.0));
  col += vec3f(0.55, 0.40, 1.0) * smoothstep(0.35, 0.0, md) * 0.28;

  // ビネット
  col *= 1.0 - 0.45 * smoothstep(0.55, 1.1, length((uv - 0.5) * vec2f(1.1, 1.0)));
  return vec4f(col, 1.0);
}`;

async function initGPU(canvas) {
  if (!navigator.gpu) throw new Error('WebGPU unsupported');
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error('no adapter');
  const device = await adapter.requestDevice();
  const ctx = canvas.getContext('webgpu');
  const format = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format, alphaMode: 'opaque' });

  const mod = device.createShaderModule({ code: WGSL });
  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: mod, entryPoint: 'vs' },
    fragment: { module: mod, entryPoint: 'fs', targets: [{ format }] },
  });
  const buf = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const bind = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: buf } }] });

  const mouse = { x: 0.3, y: 0.4, tx: 0.3, ty: 0.4 };
  addEventListener('pointermove', e => { mouse.tx = e.clientX / innerWidth; mouse.ty = e.clientY / innerHeight; });

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.max(1, Math.floor(innerWidth * dpr));
    canvas.height = Math.max(1, Math.floor(innerHeight * dpr));
  }
  addEventListener('resize', resize); resize();

  const t0 = performance.now();
  function frame() {
    mouse.x += (mouse.tx - mouse.x) * 0.06; mouse.y += (mouse.ty - mouse.y) * 0.06;
    device.queue.writeBuffer(buf, 0, new Float32Array([canvas.width, canvas.height, (performance.now() - t0) / 1000, 0, mouse.x, mouse.y, 0, 0]));
    const enc = device.createCommandEncoder();
    const pass = enc.beginRenderPass({ colorAttachments: [{ view: ctx.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }] });
    pass.setPipeline(pipeline); pass.setBindGroup(0, bind); pass.draw(3); pass.end();
    device.queue.submit([enc.finish()]);
    requestAnimationFrame(frame);
  }
  frame();
  device.lost.then(() => canvas.classList.remove('on'));
  await device.queue.onSubmittedWorkDone();
  canvas.classList.add('on');
}

window.startBackground = () => {
  const canvas = document.getElementById('bg');
  return initGPU(canvas)
    .catch(err => { console.warn('WebGPU を使えないため CSS 背景で表示します:', err.message); canvas.remove(); });
};
