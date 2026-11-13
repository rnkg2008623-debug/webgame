'use strict';
// WebGPU 背景: Layer1(背景) + Layer2(砕けたガラス) をテクスチャで合成し、
// 視差・霧・花びら・マウス追従の光を重ねる。Layer3(立ち絵)は DOM 側。
const WGSL = /* wgsl */`
struct U { res: vec2f, time: f32, pad: f32, mouse: vec2f, img: vec2f };
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var tex1: texture_2d<f32>;
@group(0) @binding(3) var tex2: texture_2d<f32>;

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
  if (r < 0.7) { return 0.0; }
  let o = vec2f(hash(id + 3.1), hash(id + 7.7)) - 0.5;
  let d = (f - o * 0.6) * vec2f(1.0, 2.2);
  let tw = 0.5 + 0.5 * sin(t * 2.0 + r * 40.0);
  return smoothstep(0.09, 0.0, length(d)) * (0.4 + 0.6 * tw);
}
// 画面全体を覆うように画像UVを計算(object-fit: cover)
fn coverUV(uv: vec2f, zoom: f32, shift: vec2f) -> vec2f {
  let asp = u.res.x / u.res.y;
  let ia = u.img.x / u.img.y;
  var s = vec2f(1.0, ia / asp);
  if (asp < ia) { s = vec2f(asp / ia, 1.0); }
  return (uv - 0.5) * s / zoom + 0.5 + shift;
}
@fragment fn fs(@builtin(position) fp: vec4f) -> @location(0) vec4f {
  let uv = fp.xy / u.res;
  let asp = u.res.x / u.res.y;
  let p = vec2f(uv.x * asp, uv.y);
  let t = u.time;
  let m = (u.mouse - 0.5);

  // Layer1: ゆっくり呼吸するように拡縮 + 弱い視差
  let breathe = 1.04 + 0.01 * sin(t * 0.2);
  let c1 = textureSampleLevel(tex1, samp, coverUV(uv, breathe, m * 0.012), 0.0).rgb;
  var col = c1;

  // 霧(明るい靄を下から流す)
  let m1 = fbm(p * 2.2 + vec2f(t * 0.03, -t * 0.02));
  let m2 = fbm(p * 4.0 - vec2f(t * 0.05, t * 0.01) + m1 * 2.0);
  col += vec3f(0.62, 0.56, 0.85) * m2 * 0.16 * smoothstep(0.2, 1.0, uv.y);

  // Layer2: 視差を強めにして手前感を出す
  let c2 = textureSampleLevel(tex2, samp, coverUV(uv, 1.0 + 0.01 * sin(t * 0.3 + 1.0), m * 0.03), 0.0);
  let glint = 0.85 + 0.35 * noise(p * 14.0 + vec2f(t * 0.6, 0.0));
  col = col * (1.0 - c2.a) + c2.rgb * glint;

  // 花びら・きらめき
  let pe = petals(p, t, 9.0, 1.0) + petals(p, t * 1.4, 16.0, 2.0) * 0.8;
  col += vec3f(1.0, 0.97, 1.0) * pe * 0.7;

  // マウス追従の紫の光
  let md = length((uv - u.mouse) * vec2f(asp, 1.0));
  col += vec3f(0.55, 0.40, 1.0) * smoothstep(0.35, 0.0, md) * 0.22;

  col *= 1.0 - 0.3 * smoothstep(0.6, 1.1, length((uv - 0.5) * vec2f(1.1, 1.0)));
  return vec4f(col, 1.0);
}`;

async function loadTexture(device, url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('load failed: ' + url);
  const bmp = await createImageBitmap(await res.blob(), { premultiplyAlpha: 'premultiply' });
  const tex = device.createTexture({
    size: [bmp.width, bmp.height], format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
  });
  device.queue.copyExternalImageToTexture({ source: bmp, flipY: false }, { texture: tex, premultipliedAlpha: true }, [bmp.width, bmp.height]);
  return { tex, w: bmp.width, h: bmp.height };
}

async function initGPU(canvas) {
  if (!navigator.gpu) throw new Error('WebGPU unsupported');
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error('no adapter');
  const device = await adapter.requestDevice();
  const ctx = canvas.getContext('webgpu');
  const format = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format, alphaMode: 'opaque' });

  const [l1, l2] = await Promise.all([
    loadTexture(device, 'assets/bg1.webp'),
    loadTexture(device, 'assets/bg2.webp'),
  ]);

  const mod = device.createShaderModule({ code: WGSL });
  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: mod, entryPoint: 'vs' },
    fragment: { module: mod, entryPoint: 'fs', targets: [{ format }] },
  });
  const buf = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
  const bind = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: buf } },
      { binding: 1, resource: sampler },
      { binding: 2, resource: l1.tex.createView() },
      { binding: 3, resource: l2.tex.createView() },
    ],
  });

  const mouse = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };
  addEventListener('pointermove', e => { mouse.tx = e.clientX / innerWidth; mouse.ty = e.clientY / innerHeight; });

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.max(1, Math.floor(innerWidth * dpr));
    canvas.height = Math.max(1, Math.floor(innerHeight * dpr));
  }
  addEventListener('resize', resize); resize();

  const t0 = performance.now();
  function frame() {
    mouse.x += (mouse.tx - mouse.x) * 0.05; mouse.y += (mouse.ty - mouse.y) * 0.05;
    device.queue.writeBuffer(buf, 0, new Float32Array([canvas.width, canvas.height, (performance.now() - t0) / 1000, 0, mouse.x, mouse.y, l1.w, l1.h]));
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
