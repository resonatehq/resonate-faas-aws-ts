import type { Context } from "@resonatehq/sdk";
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

	/**
	 * Registers a function with Resonate for execution and version control.
	 *
	 * This method makes a function available for distributed or top-level execution
	 * under a specific name and version.
	 *
	 * Providing explicit `name` or `version` options allows precise control over
	 * function identification and versioning, enabling repeatable, distributed
	 * invocation and backward-compatible deployments.
	 *
	 * @param nameOrFunc - Either the function name (string) or the function itself.
	 *   When passing a name, provide the function and optional options as additional parameters.
	 * @param funcOrOptions - The function to register, or an optional configuration object
	 *   with versioning information when the first argument is a name.
	 * @param maybeOptions - Optional configuration object when both name and function are provided.
	 *   Supports a `version` field to specify the registered function version.
	 *
	 * @returns A {@link ResonateFunc} wrapper for the registered function.
	 *   When used as a decorator, returns a decorator that registers the target function
	 *   upon definition.
	 *
	 * @example
	 * ```ts
	 * function greet(ctx: Context, name: string): string {
	 *   return `Hello, ${name}!`;
	 * }
	 *
	 * resonate.register("greet_user", greet, { version: 2 });
	 * ```
	 */
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
		return;
	}

	public handler(): LambdaHandler<
		APIGatewayProxyEventV2,
		APIGatewayProxyResultV2
	> {
		return async (
			event: APIGatewayProxyEventV2,
		): Promise<APIGatewayProxyResultV2> => {
			const method = event.requestContext.http.method;

			if (method !== "POST") {
				return {
					statusCode: 405,
					body: JSON.stringify({
						message: "Method not allowed. Use POST.",
					}),
				};
			}

			const proto = event.headers["x-forwarded-proto"];
			if (proto === undefined) {
				return {
					statusCode: 405,
					body: JSON.stringify({
						message: "x-forwarded-proto not present",
					}),
				};
			}
			const host = event.headers.host;
			if (host === undefined) {
				return {
					statusCode: 405,
					body: JSON.stringify({
						message: "host not present",
					}),
				};
			}
			const url = `${proto}://${host}`;

			const encoder = new JsonEncoder();
			const network = new HttpNetwork({
				url: "https://616c255336f5.ngrok-free.app",
				timeout: 60000, // 1 minute timeout
				headers: {},
			});

			console.log(event);

			const body = event.body;
			if (body === undefined) {
				return {
					statusCode: 405,
					body: JSON.stringify({
						message: "body not present",
					}),
				};
			}

			const data = JSON.parse(body);

			if ((data.type === "invoke" || data.type === "resume") && data.task) {
				// Handle HTTP invocation/resume from Resonate server
				console.log(
					"Processing task:",
					data.type,
					data.task.id,
					"counter:",
					data.task.counter,
				);

				// Create unclaimed task - ResonateInner will handle claiming
				const task: Task = {
					kind: "unclaimed",
					task: data.task,
				};

				const resonateInner = new ResonateInner({
					unicast: url,
					anycastPreference: url,
					anycastNoPreference: url,
					pid: `pid-${Math.random().toString(36).substring(7)}`,
					ttl: 30 * 1000, // 30 seconds
					clock: new WallClock(),
					network,
					handler: new Handler(network, encoder),
					registry: this.registry,
					heartbeat: new NoopHeartbeat(),
					dependencies: new Map(),
				});

				// Process the task
				resonateInner.process(task, (error, status) => {
					if (error || !status) {
						console.error(
							"Task processing failed:",
							JSON.stringify({ error, status }, null, 2),
						);
						return {
							statusCode: 500,
							body: JSON.stringify({
								message: "Task processing failed",
							}),
						};
					} else {
						console.log("Task processed successfully:", status);
						if (status.kind === "completed") {
							return {
								statusCode: 200,
								body: JSON.stringify({
									status: "completed",
									result: status.promise.value,
									requestUrl: url,
								}),
							};
						}
						return {
							statusCode: 200,
							body: JSON.stringify({
								status: "suspended",
								requestUrl: url,
							}),
						};
					}
				});

				const response = {
					statusCode: 200,
					body: JSON.stringify({
						message: "Hello from HTTP!",
						method: event.requestContext.http.method,
						event,
					}),
				};
				return response;
			} else {
				return {
					statusCode: 405,
					body: JSON.stringify({
						message: "task couldn't be parsed",
					}),
				};
			}
		};
	}
}

const resonate = new Resonate();

function foo(ctx: Context): string {
	return "hello";
}
resonate.register(foo);
export const handler = resonate.handler();
