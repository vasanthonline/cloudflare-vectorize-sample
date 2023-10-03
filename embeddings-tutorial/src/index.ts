/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */
import { Ai } from '@cloudflare/ai';

export interface Env {
	// Example binding to KV. Learn more at https://developers.cloudflare.com/workers/runtime-apis/kv/
	// MY_KV_NAMESPACE: KVNamespace;
	//
	// Example binding to Durable Object. Learn more at https://developers.cloudflare.com/workers/runtime-apis/durable-objects/
	// MY_DURABLE_OBJECT: DurableObjectNamespace;
	//
	// Example binding to R2. Learn more at https://developers.cloudflare.com/workers/runtime-apis/r2/
	// MY_BUCKET: R2Bucket;
	//
	// Example binding to a Service. Learn more at https://developers.cloudflare.com/workers/runtime-apis/service-bindings/
	// MY_SERVICE: Fetcher;
	//
	// Example binding to a Queue. Learn more at https://developers.cloudflare.com/queues/javascript-apis/
	// MY_QUEUE: Queue;

	TEXT_EMBEDDINGS: VectorizeIndex;
	AI: any;
}

interface EmbeddingResponse {
	shape: number[];
	data: number[][];
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const ai = new Ai(env.AI);
		let path = new URL(request.url).pathname;
		if (path.startsWith('/favicon')) {
			return new Response('', { status: 404 });
		}

		// You only need to generate vector embeddings once (or as
		// data changes), not on every request
		if (path === '/insert') {
			// In a real-world application, you could read content from R2 or
			// a SQL database (like D1) and pass it to Workers AI
			const stories = ['This is a story about an orange cloud', 'This is a story about a llama', 'This is a story about a hugging emoji'];
			const modelResp: EmbeddingResponse = await ai.run('@cf/baai/bge-base-en-v1.5', {
				text: stories,
			});

			// Convert the vector embeddings into a format Vectorize can accept.
			// Each vector needs an ID, a value (the vector) and optional metadata.
			// In a real application, your ID would be bound to the ID of the source
			// document.
			let vectors: VectorizeVector[] = [];
			let id = 1;
			modelResp.data.forEach((vector) => {
				vectors.push({ id: `${id}`, values: vector });
				id++;
			});

			let inserted = await env.TEXT_EMBEDDINGS.upsert(vectors);
			return Response.json(inserted);
		}

		// Your query: expect this to match vector ID. 1 in this example
		let userQuery = 'orange cloud';
		const queryVector: EmbeddingResponse = await ai.run('@cf/baai/bge-base-en-v1.5', {
			text: [userQuery],
		});

		let matches = await env.TEXT_EMBEDDINGS.query(queryVector.data[0], { topK: 1 });
		return Response.json({
			// Expect a vector ID. 1 to be your top match with a score of
			// ~0.896888444
			// This tutorial uses a cosine distance metric, where the closer to one,
			// the more similar.
			matches: matches,
		});
	},
};
