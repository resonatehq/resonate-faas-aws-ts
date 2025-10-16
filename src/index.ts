import { WallClock } from "@resonatehq/sdk/dist/src/clock";
import { HttpNetwork } from "@resonatehq/sdk/dist/src/core";
import { JsonEncoder } from "@resonatehq/sdk/dist/src/encoder";
import { Handler } from "@resonatehq/sdk/dist/src/handler";
import { NoopHeartbeat } from "@resonatehq/sdk/dist/src/heartbeat";
import { Registry } from "@resonatehq/sdk/dist/src/registry";
import {
	ResonateInner,
	type Task,
} from "@resonatehq/sdk/dist/src/resonate-inner";
import type { Func } from "@resonatehq/sdk/dist/src/types";
import type {
	APIGatewayProxyEventV2,
	APIGatewayProxyResultV2,
	Handler as LambdaHandler,
} from "aws-lambda";

export class Resonate {
	private registry = new Registry();

	public register<F extends Func>(
		name: string,
		func: F,
		options?: {
			version?: number;
		},
	): void;
	public register<F extends Func>(
		func: F,
		options?: {
			version?: number;
		},
	): void;
	public register<F extends Func>(
		nameOrFunc: string | F,
		funcOrOptions?:
			| F
			| {
					version?: number;
			  },
		maybeOptions: {
			version?: number;
		} = {},
	): void {
		const { version = 1 } =
			(typeof funcOrOptions === "object" ? funcOrOptions : maybeOptions) ?? {};
		const func =
			typeof nameOrFunc === "function" ? nameOrFunc : (funcOrOptions as F);
		const name = typeof nameOrFunc === "string" ? nameOrFunc : func.name;

		this.registry.add(func, name, version);
	}

	public httpHandler(): LambdaHandler<
		APIGatewayProxyEventV2,
		APIGatewayProxyResultV2
	> {
		return async (
			event: APIGatewayProxyEventV2,
		): Promise<APIGatewayProxyResultV2> => {
			try {
				if (event.requestContext.http.method !== "POST") {
					return {
						statusCode: 405,
						body: JSON.stringify({ error: "Method not allowed. Use POST." }),
					};
				}

				// Ensure required headers
				const proto = event.headers["x-forwarded-proto"];
				const host = event.headers.host;
				if (!proto || !host) {
					return {
						statusCode: 400,
						body: JSON.stringify({
							error: "Missing required headers: x-forwarded-proto or host.",
						}),
					};
				}

				// Construct full invocation URL
				const url = `${proto}://${host}${event.requestContext.http.path ?? ""}`;

				// Ensure body exists
				if (!event.body) {
					return {
						statusCode: 400,
						body: JSON.stringify({ error: "Request body missing." }),
					};
				}

				// Parse JSON body
				const body = JSON.parse(event.body);

				// Validate task structure
				if (
					!body ||
					!(body.type === "invoke" || body.type === "resume") ||
					!body.task
				) {
					return {
						statusCode: 400,
						body: JSON.stringify({
							error:
								'Request body must contain "type" and "task" for Resonate invocation.',
						}),
					};
				}

				const encoder = new JsonEncoder();
				const network = new HttpNetwork({
					url: body.href.base,
					timeout: 60 * 1000,
					headers: {},
				});

				const resonateInner = new ResonateInner({
					unicast: url,
					anycastPreference: url,
					anycastNoPreference: url,
					pid: `pid-${Math.random().toString(36).substring(7)}`,
					ttl: 30 * 1000,
					clock: new WallClock(),
					network,
					handler: new Handler(network, encoder),
					registry: this.registry,
					heartbeat: new NoopHeartbeat(),
					dependencies: new Map(),
				});

				// Create unclaimed task
				const task: Task = { kind: "unclaimed", task: body.task };

				// Process the task and await result
				const result = await new Promise<APIGatewayProxyResultV2>((resolve) => {
					resonateInner.process(task, (error, status) => {
						if (error || !status) {
							resolve({
								statusCode: 500,
								body: JSON.stringify({
									error: "Task processing failed",
									details: { error, status },
								}),
							});
							return;
						}

						if (status.kind === "completed") {
							resolve({
								statusCode: 200,
								body: JSON.stringify({
									status: "completed",
									result: status.promise.value,
									requestUrl: url,
								}),
							});
						} else {
							resolve({
								statusCode: 200,
								body: JSON.stringify({
									status: "suspended",
									requestUrl: url,
								}),
							});
						}
					});
				});

				return result;
			} catch (error) {
				return {
					statusCode: 500,
					body: JSON.stringify({
						error: `Handler failed: ${error}`,
					}),
				};
			}
		};
	}
}
