# Quickstart

Get the pipeline running locally in under 5 minutes.

## Prerequisites

- Node.js 18+
- npm

## Install

```bash
npm install
```

## Run the pipeline

```bash
npx tsx src/cli/index.ts run \
  --source ./fixtures \
  --specs ./specs
```

This reads all `.html` files from `./fixtures`, processes them through the full pipeline, and writes migration spec JSON files to `./specs`.

## Launch the review UI

```bash
npx tsx src/cli/index.ts review \
  --specs ./specs \
  --source ./fixtures
```

Open `http://localhost:3000` in your browser.

## Try the demo fixture

```bash
npx tsx src/cli/index.ts run \
  --source ./demo/fixtures \
  --specs ./demo/specs

npx tsx src/cli/index.ts review \
  --specs ./demo/specs \
  --source ./demo/fixtures
```

## Run the tests

```bash
npx vitest run
```

## CLI reference

```
migrator run    --source <dir> [--specs <dir>]
migrator review --specs <dir> --source <dir> [--port <number>]
migrator export --specs <dir> --output <dir>   # Phase 2, not yet implemented
```
