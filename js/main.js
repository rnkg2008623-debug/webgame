'use strict';
document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const timeEl = document.getElementById('time');
  const startBtn = document.getElementById('start');
  let score, timeLeft, star, running = false, timer;

  function spawn() {
    star = { x: 30 + Math.random() * (canvas.width - 60), y: 30 + Math.random() * (canvas.height - 60), r: 22 };
  }
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!running) return;
    ctx.font = star.r * 2 + 'px serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('⭐', star.x, star.y);
  }
  function end() {
    running = false; clearInterval(timer); draw();
    ctx.fillStyle = '#fff'; ctx.font = '28px system-ui'; ctx.textAlign = 'center';
    ctx.fillText('終了! スコア ' + score, canvas.width / 2, canvas.height / 2);
    startBtn.textContent = 'もう一度';
  }
  function start() {
    score = 0; timeLeft = 30; running = true;
    scoreEl.textContent = score; timeEl.textContent = timeLeft;
    spawn(); draw();
    clearInterval(timer);
    timer = setInterval(() => {
      timeEl.textContent = --timeLeft;
      if (timeLeft <= 0) end();
    }, 1000);
  }
  canvas.addEventListener('pointerdown', e => {
    if (!running) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * canvas.width / rect.width;
    const y = (e.clientY - rect.top) * canvas.height / rect.height;
    if (Math.hypot(x - star.x, y - star.y) <= star.r * 1.3) {
      scoreEl.textContent = ++score; spawn(); draw();
    }
  });
  startBtn.addEventListener('click', start);
});
