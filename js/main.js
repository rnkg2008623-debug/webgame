'use strict';
document.addEventListener('DOMContentLoaded', () => {
  const stage = document.getElementById('stage');
  const toast = document.getElementById('toast');
  const items = [...document.querySelectorAll('.item')];
  const names = { persona: 'ペルソナ', equip: '装備', skills: 'スキル', status: 'ステータス', party: 'パーティ', requests: '依頼', calendar: 'カレンダー', system: 'システム' };

  // 1672x941 のステージを画面に合わせて拡縮
  const fit = () => stage.style.setProperty('--s', Math.min(innerWidth / 1672, innerHeight / 941));
  addEventListener('resize', fit); fit();

  // パーティ表示
  const members = [
    { lv: 38, hp: 412, sp: 208, cls: '' },
    { lv: 37, hp: 398, sp: 220, cls: 'k' },
    { lv: 36, hp: 348, sp: 198, cls: '' },
  ];
  document.getElementById('party').innerHTML = members.map(m => `
    <div class="member"><div class="shape"></div><div class="face ${m.cls}"></div>
      <div class="lv"><small>Lv.</small>${m.lv}</div>
      <div class="bar hp">HP <span>${m.hp} / ${m.hp}</span></div>
      <div class="bar sp">SP <span>${m.sp} / ${m.sp}</span></div></div>`).join('');

  // 選択・決定
  let sel = 0;
  const select = i => { sel = (i + items.length) % items.length; items.forEach((el, k) => el.classList.toggle('sel', k === sel)); };
  let timer;
  const say = msg => { toast.textContent = msg; toast.classList.add('show'); clearTimeout(timer); timer = setTimeout(() => toast.classList.remove('show'), 1400); };
  const decide = i => say('決定: ' + names[items[i].dataset.id]);
  items.forEach((el, i) => {
    el.addEventListener('mouseenter', () => select(i));
    el.addEventListener('click', () => { select(i); decide(i); });
  });
  addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (k === 'arrowright' || k === 'arrowdown') select(sel + 1);
    else if (k === 'arrowleft' || k === 'arrowup') select(sel - 1);
    else if (k === 'z' || k === 'enter') decide(sel);
    else if (k === 'x') say('戻る');
    else if (k === 'c') say('メニューガイド');
  });
  select(0);

  window.startBackground();
});
