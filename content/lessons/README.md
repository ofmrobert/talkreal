# How to write a Talkreal lesson

Each lesson is one `.json` file in the folder of its level: `content/lessons/a2/a2-03.json`.
Copy an existing lesson, change the texts, and run the checker:

```
npm run content:check
```

It lists every problem in plain words. A lesson with problems is not shown in the app.

## The parts of a lesson

| Field | What it is |
|---|---|
| `id` | Level + number, e.g. `a2-03`. Must match the file name. |
| `level` | `A1`, `A2`, `B1`, `B2` or `C1` |
| `order` | Position in the course: 1, 2, 3 … No repeats inside a level. |
| `title`, `goal` | Shown on the course map. Each needs `ru` and `en`. |
| `theory` | 1–4 rule cards shown before the exercises: `title`, `body`, `examples` (each `en` + `ru`), optional `tip`. Written in Russian. |
| `vocab` | 4–10 words: `en`, `ru`, optional `example` sentence in English. |
| `exercises` | 10–16 exercises. At least one each of `choice`, `gap`, `translate`, `listen`. Aim for one `type`, one `speak` and one `dictation` too. |

## Exercise types

Every exercise except `match`, `speak` and `dictation` needs an `explanation`: one or two Russian
sentences saying why the answer is right. This is what students value most, so make it teach something.

**`choice`** – a question with 3–4 `options`. `answer` is the position of the right one, counting from 0.

**`gap`** – a `sentence` with `___` exactly once, 3–4 `options`, `answer` position, optional Russian `translation`.

**`translate`** – a Russian `source` sentence and the English `answer` (2–12 words). The app cuts the
answer into word tiles and mixes in the `distractors` (2–5 single wrong words). List other correct
versions in `accept`.

**`listen`** – the app reads `audio` aloud (English). Then a `question` in Russian with 3–4 `options`
and the `answer` position.

**`match`** – 4–5 `pairs` of `en` and `ru` words to connect.

**`type`** – a Russian `source` sentence and the English `answer`, which the student types on the
keyboard. There are no tiles to help, so list every other correct version in `accept`. Short forms
are matched for you: `don't` = `do not`, `I'm` = `I am`, `we'll` = `we will`. The one exception is
`'s` (`it's` / `it is`): list both. Keep these sentences short, so there are few ways to say them.

**`speak`** – the student says the English `text` aloud (2–12 words) and the app listens. Add the
Russian `translation`. On phones that cannot recognise speech the exercise is left out.

**`dictation`** – the app reads `audio` aloud (2–12 words) and the student types it. Add the Russian
`translation`. Write numbers as words and avoid names and words with two spellings (colour / color).

The app shuffles the options itself, so the position of the right answer in the file does not matter.

## Style

- Explanations and theory are in Russian; everything the student practises is in natural English.
- Focus on mistakes Russian speakers really make: articles, tenses, prepositions, word order.
- One lesson = one topic, about five minutes.

## Review

Students see a lesson's words and the exercises they got wrong again on later days. This happens by
itself: every word in `vocab` joins the review cycle when the lesson is finished. A word with an
`example` sentence that contains the word gets a harder "write the word" exercise later on, so
examples are worth adding.
