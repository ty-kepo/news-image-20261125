# Sum up 25 November's world news in one image

Entry for the make.fun bounty "Sum up 25 November's world news in one image"
(news-image-20261125) by Ty-kepo.

## What it is

A Node 22 program (`main.ts`, standard library only, no network) that draws
one 1024x1024 PNG image summing up the world's news of Wednesday 25 November
2026: 32 dated stories from every region, drawn as a newspaper front page
with a world map, numbered markers, and a markets strip.

## How to run

```sh
node main.ts
```

It writes `entry.png` (1024x1024, under 1 MiB) to the output directory.
Running it twice produces byte-identical output.

## Stories

See `STORIES.md` for the full sourced list of the 32 stories and the
items that were excluded for failing the 25 November 2026 date rule.
