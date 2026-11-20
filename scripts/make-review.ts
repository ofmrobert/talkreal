/**
 * Makes one page per level for a teacher to check the lessons: `npm run content:review`.
 * The pages land in review/ (not part of the app). Each is a single file that can be sent
 * by email or Telegram and opened in any browser. The teacher marks every lesson as fine or
 * not, writes notes, and sends the notes back with one button; nothing is uploaded anywhere.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Exercise, Lesson } from '../src/shared/lesson'

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1']
const TYPE_NAMES: Record<Exercise['type'], string> = {
  choice: 'Выбор ответа',
  gap: 'Пропуск',
  translate: 'Перевод из плиток',
  listen: 'На слух',
  match: 'Пары',
  type: 'Перевод с клавиатуры',
  speak: 'Говорение',
  dictation: 'Диктант',
}

const esc = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const options = (list: string[], answer: number) => `<ol class="opts">${list.map((o, i) => `<li class="${i === answer ? 'right' : ''}">${esc(o)}${i === answer ? ' ✓' : ''}</li>`).join('')}</ol>`
const row = (label: string, value: string | undefined, cls = '') => (value ? `<p class="${cls}"><span class="lbl">${label}</span> ${esc(value)}</p>` : '')

function exercise(e: Exercise): string {
  switch (e.type) {
    case 'choice':
      return row('Вопрос', e.prompt) + options(e.options, e.answer)
    case 'gap':
      return row('Предложение', e.sentence, 'en') + row('Перевод', e.translation) + options(e.options, e.answer)
    case 'translate':
      return row('С русского', e.source) + row('Ответ', e.answer, 'en right') + row('Также верно', e.accept?.join(' · ')) + row('Лишние плитки', e.distractors.join(' · '))
    case 'listen':
      return row('Звучит', e.audio, 'en') + row('Вопрос', e.question) + options(e.options, e.answer)
    case 'match':
      return `<table>${e.pairs.map((p) => `<tr><td class="en">${esc(p.en)}</td><td>${esc(p.ru)}</td></tr>`).join('')}</table>`
    case 'type':
      return row('С русского', e.source) + row('Ответ', e.answer, 'en right') + row('Также верно', e.accept?.join(' · '))
    case 'speak':
      return row('Произнести', e.text, 'en') + row('Перевод', e.translation)
    case 'dictation':
      return row('Звучит', e.audio, 'en') + row('Перевод', e.translation)
  }
}

function lessonHtml(lesson: Lesson): string {
  const theory = lesson.theory
    .map(
      (card) => `<div class="card"><h4>${esc(card.title)}</h4><p>${esc(card.body)}</p>
<table>${card.examples.map((x) => `<tr><td class="en">${esc(x.en)}</td><td>${esc(x.ru)}</td></tr>`).join('')}</table>${card.tip ? `<p class="tip">💡 ${esc(card.tip)}</p>` : ''}</div>`,
    )
    .join('')
  const vocab = lesson.vocab.length ? `<table>${lesson.vocab.map((v) => `<tr><td class="en">${esc(v.en)}</td><td>${esc(v.ru)}</td><td class="en dim">${esc(v.example)}</td></tr>`).join('')}</table>` : '<p class="dim">Нет слов.</p>'
  const exercises = lesson.exercises
    .map((e, i) => {
      const explanation = 'explanation' in e && e.explanation ? `<p class="why"><span class="lbl">Объяснение</span> ${esc(e.explanation)}</p>` : ''
      return `<div class="ex" data-ex="${lesson.id}#${i + 1}"><h5>${i + 1}. ${TYPE_NAMES[e.type]}</h5>${exercise(e)}${explanation}
<input class="exnote" placeholder="Замечание к заданию ${i + 1} (если есть)" data-key="${lesson.id}#${i + 1}"></div>`
    })
    .join('')
  return `<section class="lesson" id="${lesson.id}" data-lesson="${lesson.id}" data-title="${esc(lesson.title.ru)}">
<header><span class="num">${lesson.order}</span><div><h2>${esc(lesson.title.ru)}</h2><p class="dim">${esc(lesson.id)} · ${esc(lesson.title.en)}</p></div><span class="state"></span></header>
<p class="goal">🎯 ${esc(lesson.goal.ru)}</p>
<details><summary>Открыть урок</summary>
<h3>Правило</h3>${theory}
<h3>Слова</h3>${vocab}
<h3>Задания (${lesson.exercises.length})</h3>${exercises}
</details>
<div class="verdict">
<label><input type="radio" name="v-${lesson.id}" value="ok"> ✅ Всё хорошо</label>
<label><input type="radio" name="v-${lesson.id}" value="fix"> ✏️ Нужно исправить</label>
<textarea class="note" data-key="${lesson.id}" rows="2" placeholder="Общие замечания к уроку: ошибки в английском или русском, неестественные фразы, слишком сложно или слишком просто для уровня…"></textarea>
</div></section>`
}

const CSS = `
*{box-sizing:border-box}body{margin:0;font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#fff8f0;color:#1f1b3a}
main{max-width:860px;margin:0 auto;padding:16px 16px 80px}h1{font-size:28px;margin:8px 0 4px}h2{font-size:19px;margin:0}h3{font-size:15px;text-transform:uppercase;letter-spacing:.05em;color:#c8401f;margin:20px 0 8px}h4{margin:0 0 4px;font-size:16px}h5{margin:0 0 6px;font-size:14px;color:#5f5a78}
p{margin:4px 0}.dim{color:#7d7894;font-size:14px}.intro{background:#fff;border-radius:16px;padding:14px 16px;margin:12px 0}.intro li{margin:4px 0}
.bar{position:sticky;top:0;z-index:5;background:#1f1b3a;color:#fff;border-radius:0 0 16px 16px;padding:10px 14px;display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.bar b{flex:1;min-width:160px}button{font:inherit;font-weight:700;border:0;border-radius:12px;padding:9px 14px;background:#ff6b4a;color:#fff;cursor:pointer}button.ghost{background:#3b3668}
.lesson{background:#fff;border-radius:20px;padding:16px;margin:14px 0;border:3px solid transparent}.lesson.ok{border-color:#2ec4a0}.lesson.fix{border-color:#ff6b4a}
.lesson>header{display:flex;gap:12px;align-items:center}.num{flex:none;width:40px;height:40px;border-radius:12px;background:#ff6b4a;color:#fff;font-weight:800;display:flex;align-items:center;justify-content:center}
.lesson>header>div{flex:1;min-width:0}.state{font-weight:800;font-size:14px}.ok .state::after{content:"✅ проверено";color:#178a6e}.fix .state::after{content:"✏️ исправить";color:#c8401f}
.goal{margin:10px 0}details{margin:8px 0}summary{cursor:pointer;font-weight:800;color:#5a3fd6;padding:6px 0}
.card,.ex{background:#fff8f0;border-radius:14px;padding:12px 14px;margin:8px 0}.tip{color:#5f5a78}
table{border-collapse:collapse;width:100%;margin:6px 0}td{padding:5px 8px;border-bottom:1px solid #f0e6da;vertical-align:top}.en{font-weight:600}
.lbl{display:inline-block;min-width:104px;font-size:12px;font-weight:800;text-transform:uppercase;color:#7d7894}
.opts{margin:6px 0 6px 20px;padding:0}.right{color:#0f7a5f;font-weight:800}.why{background:#e6f7f2;border-radius:10px;padding:6px 10px;margin-top:8px}
.verdict{display:flex;flex-wrap:wrap;gap:8px 18px;align-items:center;margin-top:10px;font-weight:700}textarea,.exnote{width:100%;font:inherit;border:2px solid #e8ddd0;border-radius:12px;padding:8px 10px;background:#fff}.exnote{margin-top:8px;font-size:14px}
textarea:focus,.exnote:focus{outline:0;border-color:#ff6b4a}
@media print{.bar,.verdict,.exnote{display:none}details{display:block}details>summary{display:none}}
`

const JS = `
const KEY='talkreal-review-'+LEVEL;let data={};try{data=JSON.parse(localStorage.getItem(KEY)||'{}')}catch(e){}
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(data))}catch(e){}};
const lessons=[...document.querySelectorAll('.lesson')];
function paint(){let done=0;for(const l of lessons){const v=(data.v||{})[l.dataset.lesson];l.classList.toggle('ok',v==='ok');l.classList.toggle('fix',v==='fix');if(v)done++}document.getElementById('count').textContent='Проверено '+done+' из '+lessons.length}
for(const r of document.querySelectorAll('input[type=radio]')){const id=r.name.slice(2);if((data.v||{})[id]===r.value)r.checked=true;r.addEventListener('change',()=>{data.v=data.v||{};data.v[id]=r.value;save();paint()})}
for(const f of document.querySelectorAll('.note,.exnote')){f.value=(data.n||{})[f.dataset.key]||'';f.addEventListener('input',()=>{data.n=data.n||{};data.n[f.dataset.key]=f.value;save()})}
function report(){const out=['Talkreal — проверка уроков, уровень '+LEVEL,'Дата: '+new Date().toLocaleDateString('ru-RU'),''];
for(const l of lessons){const id=l.dataset.lesson,v=(data.v||{})[id],n=data.n||{};const ex=Object.keys(n).filter(k=>k.startsWith(id+'#')&&n[k].trim()).sort((a,b)=>a.split('#')[1]-b.split('#')[1]);
if(!v&&!((n[id]||'').trim())&&!ex.length)continue;out.push(id+' «'+l.dataset.title+'»: '+(v==='ok'?'всё хорошо':v==='fix'?'НУЖНО ИСПРАВИТЬ':'не отмечено'));if((n[id]||'').trim())out.push('  Урок: '+n[id].trim());for(const k of ex)out.push('  Задание '+k.split('#')[1]+': '+n[k].trim());out.push('')}
const left=lessons.filter(l=>!(data.v||{})[l.dataset.lesson]).map(l=>l.dataset.lesson);if(left.length)out.push('Ещё не проверены: '+left.join(', '));return out.join('\\n')}
document.getElementById('copy').onclick=async()=>{try{await navigator.clipboard.writeText(report());alert('Замечания скопированы. Вставьте их в сообщение и отправьте.')}catch(e){prompt('Скопируйте текст:',report())}};
document.getElementById('file').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([report()],{type:'text/plain;charset=utf-8'}));a.download='talkreal-review-'+LEVEL+'.txt';a.click()};
document.getElementById('open').onclick=()=>{const all=[...document.querySelectorAll('details')];const on=all.some(d=>!d.open);all.forEach(d=>d.open=on)};
paint();
`

const root = join(process.cwd(), 'content', 'lessons')
const out = join(process.cwd(), 'review')
mkdirSync(out, { recursive: true })
let total = 0
for (const level of LEVELS) {
  const lessons = readdirSync(join(root, level))
    .filter((file) => file.endsWith('.json'))
    .map((file) => JSON.parse(readFileSync(join(root, level, file), 'utf8')) as Lesson)
    .sort((a, b) => a.order - b.order)
  const exercises = lessons.reduce((sum, lesson) => sum + lesson.exercises.length, 0)
  total += lessons.length
  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Talkreal · проверка уроков ${level}</title><style>${CSS}</style></head><body>
<div class="bar"><b id="count"></b><button id="open" class="ghost">Открыть / свернуть все</button><button id="copy">Скопировать замечания</button><button id="file" class="ghost">Скачать замечания</button></div>
<main><h1>Проверка уроков · уровень ${level}</h1><p class="dim">${lessons.length} уроков · ${exercises} заданий · Talkreal, английский для русскоязычных взрослых</p>
<div class="intro"><b>Что нужно проверить</b><ul>
<li><b>Английский</b>: всё ли правильно и естественно (британская орфография), нет ли фраз, которые носитель так не скажет.</li>
<li><b>Русский</b>: понятны ли объяснения, нет ли ошибок и кальки.</li>
<li><b>Ответы</b>: верный ответ помечен ✓. Действительно ли он единственный верный? Нет ли второго подходящего варианта?</li>
<li><b>Уровень</b>: подходит ли урок для ${level}, не слишком ли он простой или сложный.</li>
</ul><p>Отметьте каждый урок «Всё хорошо» или «Нужно исправить» и напишите замечания. Отметки сохраняются в этом браузере. В конце нажмите «Скопировать замечания» и отправьте текст.</p></div>
${lessons.map(lessonHtml).join('\n')}
</main><script>const LEVEL=${JSON.stringify(level)};${JS}</script></body></html>`
  writeFileSync(join(out, `talkreal-review-${level}.html`), html)
  console.log(`${level}: ${lessons.length} lessons, ${exercises} exercises → review/talkreal-review-${level}.html (${Math.round(html.length / 1024)} KB)`)
}
console.log(`${total} lessons in ${LEVELS.length} files.`)
