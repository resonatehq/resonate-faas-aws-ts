import {
	type Func,
	Handler,
	HttpNetwork,
	JsonEncoder,
	NoopHeartbeat,
	Registry,
	ResonateInner,
	type Task,
	WallClock,
} from "@resonatehq/sdk";
import type {
	LambdaFunctionURLHandler,
	LambdaFunctionURLResult,
} from "aws-lambda";

export class Resonate {
	private registry = new Registry();
	private verbose: boolean;
	constructor({ verbose = false }: { verbose?: boolean } = {}) {
		this.verbose = verbose;
	}

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

	public httpHandler(): LambdaFunctionURLHandler {
		return async (
			event,
			_context,
			_callback,
		): Promise<LambdaFunctionURLResult> => {
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
					headers: {},
					timeout: 60 * 1000,
					url: body.href.base,
					verbose: this.verbose,
				});

				const resonateInner = new ResonateInner({
					anycastNoPreference: url,
					anycastPreference: url,
					clock: new WallClock(),
					dependencies: new Map(),
					handler: new Handler(network, encoder),
					heartbeat: new NoopHeartbeat(),
					network,
					pid: `pid-${Math.random().toString(36).substring(7)}`,
					registry: this.registry,
					ttl: 30 * 1000,
					unicast: url,
					verbose: this.verbose,
				});

				// Create unclaimed task
				const task: Task = { kind: "unclaimed", task: body.task };

				// Process the task and await result
				const result = new Promise<LambdaFunctionURLResult>((resolve) => {
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
