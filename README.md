# @resonatehq/aws

`@resonatehq/aws` is the official binding to deploy Distributed Async Await, Resonate's durable execution framework, to [AWS Lambda](https://aws.amazon.com/pm/lambda). Run long-running, stateful applications on short-lived, stateless infrastructure.

**Examples:**

- [Durable Countdown]()
- [Durable, Recursive Research Agent]()

## Architecture

When the Durable Function awaits a pending Durable Promise (for example on `yield* context.rpc()` or `context.sleep`), the AWS Lambda function **terminates**. When the Durable Promise completes, the Resonate Server resumes the Durable Function by invoking the AWS Lambda function again.


```ts
function* factorial(context: Context, n: number): Generator {
  if (n <= 0)  { 
    return 1;
  }
  else {
    return n * (yield* context.rpc(factorial, n - 1));
  }
}
```

Illustration of executing `factorial(2)` on AWS Lambda:

![Resonate on Serverless](./public/resonate.svg)

## Quick Start

```bash
npm install @resonatehq/aws
```

See [AWS Lambda documentation](https://docs.aws.amazon.com/lambda/latest/dg/welcome.html) to learn how to develop and deploy AWS Lambda functions and see Resonate's AWS Lambda examples for a step by step tutorial

- [Durable Countdown]()
- [Durable, Recursive Research Agent]()
