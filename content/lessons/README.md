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
| `exercises` | 10–14 exercises. At least one each of `choice`, `gap`, `translate`, `listen`. |

## Exercise types

Every exercise except `match` needs an `explanation`: one or two Russian sentences saying why the
answer is right. This is what students value most, so make it teach something.

**`choice`** – a question with 3–4 `options`. `answer` is the position of the right one, counting from 0.

**`gap`** – a `sentence` with `___` exactly once, 3–4 `options`, `answer` position, optional Russian `translation`.

**`translate`** – a Russian `source` sentence and the English `answer` (2–12 words). The app cuts the
answer into word tiles and mixes in the `distractors` (2–5 single wrong words). List other correct
versions in `accept`.

**`listen`** – the app reads `audio` aloud (English). Then a `question` in Russian with 3–4 `options`
and the `answer` position.

**`match`** – 4–5 `pairs` of `en` and `ru` words to connect.

The app shuffles the options itself, so the position of the right answer in the file does not matter.

## Style

- Explanations and theory are in Russian; everything the student practises is in natural English.
- Focus on mistakes Russian speakers really make: articles, tenses, prepositions, word order.
- One lesson = one topic, about five minutes.
