# `@resonate/aws`

## Resonate AWS FaaS Handler

A lightweight shim enabling serverless [Resonate](https://resonatehq.io) Workers inside AWS Lambda. This package provides the shim that translates AWS Function URL requests into Resonate tasks and routes them to the Resonate SDK.

## Why this exists

Durable execution platforms such as Resonate require a long-lived worker that can claim, execute and resume tasks. AWS Lambda is great for elastic compute, but it expects handlers to be short-lived and stateless. `@resonatehq/aws` enables a Resonate worker to reinitialize and disappear as needed, while still providing durability. In other words, this shim enables Serverless Workers capable of Durable Execution.

## Features at a glance

- Simple registration API – just `register()` your workflow functions.
- Works with Lambda Function URLs or API Gateway (anywhere the `LambdaFunctionURLHandler` type is accepted).
- TypeScript-first, ships with `.d.ts` definitions.
- Compatible with Resonate SDK `>=0.8.3`..

## Getting started

Install the package alongside the Resonate SDK in your Lambda project:

```bash
# Using bun
bun add @resonatehq/aws @resonatehq/sdk

# Using npm
npm install @resonatehq/aws @resonatehq/sdk
```

### Registering workflows

You just need to import and use the `@resonatehq/aws` package to register workflows instead of the normal sdk.

```ts
import { Resonate } from "@resonatehq/aws";

const resonate = new Resonate();

async function hello(name: string) {
  return `Hello, ${name}!`;
}

// Register by name
resonate.register("hello", hello, { version: 1 });
```

### Expected request shape

Lambda receives POST requests from Resonate with a body similar to:

```json
{
  "type": "invoke",
  "href": {
    "base": "https://api.resonatehq.io"
  },
  "task": {
    "name": "hello",
    "arguments": ["World"]
  }
}
```

Responses from the handler include:

- `status: "completed"` with a `result` payload when the task finishes.
- `status: "suspended"` when the task yielded and will be resumed later.
- HTTP errors (`400` or `500`) for invalid payloads or runtime failures.

## Local development

This repository ships the TypeScript source (`src/index.ts`) and builds to `dist/`. Helpful commands:

| Command         | Description                                              |
| --------------- | -------------------------------------------------------- |
| `bun run build` | Compile TypeScript to JavaScript (`dist/`).              |
| `bun run check` | Run [Biome](https://biomejs.dev/) linting/format checks. |
| `bun run fmt`   | Auto-format source files with Biome.                     |

> Use `npm run …` if you prefer npm scripts over Bun.

When iterating locally you can run a quick smoke test by invoking the generated handler directly:

```ts
import { handler } from "./lambda";

await handler({
  requestContext: { http: { method: "POST", path: "/" } },
  headers: { host: "localhost", "x-forwarded-proto": "http" },
  body: JSON.stringify({
    type: "invoke",
    href: { base: "http://localhost:3000" },
    task: { name: "hello" },
  }),
} as any);
```
