# @resonatehq/aws

**Resonate** — empowering **serverless** and **event-driven** architectures written as **procedural code**.

This package enables **AWS** developers to build resilient, event-driven workflows using plain JavaScript or TypeScript — powered by the **Resonate Server**, which orchestrates execution, state, and communication across Lambda functions.

---

## ✨ Features

* 🧠 **Procedural orchestration** — write workflows as generator functions.
* ☁️ **Serverless-native** — deploy to AWS Lambda or API Gateway.
* 🔁 **Durable execution** — Resonate Server manages state, retries, and continuation.
* 📡 **RPC between workflows** — simple function-to-function calls over HTTP.

---

## 🏗️ Architecture

Resonate applications are split into **two components**:

1. **Resonate Server** – coordinates execution, maintains workflow state, and handles retries.
2. **Function Workers** – your Lambda functions that perform the actual logic.

The AWS SDK (`@resonatehq/aws`) connects these workers to the Resonate Server, enabling distributed orchestration without needing a centralized monolith.

```text
+-----------------+        +-------------------------+
|   AWS Lambda    |  --->  |  Resonate Server (Core) |
|  (factorial)    | <---   |  State + Coordination   |
+-----------------+        +-------------------------+
```

---

## 🚀 Quick Start

### 1. Install

```bash
npm install @resonatehq/aws
```

---

### 2. Example: Recursive Workflow

```ts
import { type Context, Resonate } from "@resonatehq/aws";

const resonate = new Resonate();

function* factorial(ctx: Context, n: number): Generator<any, number, any> {
	if (n <= 1) {
		return 1;
	}
	return n * (yield ctx.rpc("factorial", n - 1));
}

resonate.register(factorial);

export const handler = resonate.httpHandler();
```

---

### 3. Deploy to AWS Lambda

You can deploy using the AWS CLI, CDK, or SAM.
Here’s an example using the AWS CLI with an HTTP API Gateway trigger:

```bash
aws lambda create-function \
  --function-name factorial \
  --runtime nodejs22.x \
  --role arn:aws:iam::<account-id>:role/<lambda-execution-role> \
  --handler index.handler \
  --zip-file fileb://function.zip
```

Then connect it to an API Gateway endpoint:

```bash
aws apigatewayv2 create-api \
  --name factorial-api \
  --protocol-type HTTP \
  --target arn:aws:lambda:<region>:<account-id>:function:factorial
```

---

### 4. Invoke via CLI

Once deployed, you can trigger workflows using the [Resonate CLI](https://github.com/resonatehq/cli):

```bash
resonate invoke \
  --server https://<resonate-server-url>.com \
  --func factorial \
  --arg 10 \
  --target https://<api-gateway-url>.amazonaws.com
```

Expected output:

```
3628800
```

---

## 🧠 How It Works

Resonate uses **generator functions** to represent workflows.
Each `yield` is a checkpoint: Resonate persists the state via the **Resonate Server** and resumes execution when the dependency (RPC, event, etc.) completes.

**Key Concepts:**

| Concept                  | Description                                               |
| ------------------------ | --------------------------------------------------------- |
| `Context`                | The execution context for a workflow.                     |
| `ctx.rpc()`              | Call another registered workflow (RPC-style).             |
| `resonate.register()`    | Register functions for orchestration.                     |
| `resonate.httpHandler()` | Expose an HTTP endpoint for AWS Lambda (via API Gateway). |

---

## 🧩 Related Packages

| Platform     | Package           |
| ------------ | ----------------- |
| AWS   | `@resonatehq/aws` |
| Google Cloud | `@resonatehq/gcp` |

---
