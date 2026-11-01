// Chromium (behind Obsidian's requestUrl) can reuse an HTTP/2 connection for another
// *.icloud.com host and get "421 Misdirected Request". Node's own client avoids that.
// Credentials are only forwarded to redirects that stay on the same origin.
export function nodeGet(
	url: string,
	headers: Record<string, string>,
	maxRedirects = 5,
): Promise<ArrayBuffer> {
	return new Promise((resolve, reject) => {
		const target = new URL(url);
		const lib =
			target.protocol === "https:" ? require("https") : require("http");

		const req = lib.get(target, { headers }, (res: any) => {
			const status: number = res.statusCode ?? 0;

			if (status >= 300 && status < 400 && res.headers.location) {
				res.resume();
				if (maxRedirects <= 0) return reject(new Error("Too many redirects"));
				const next = new URL(res.headers.location, target);
				const nextHeaders = next.origin === target.origin ? headers : {};
				return nodeGet(next.href, nextHeaders, maxRedirects - 1).then(
					resolve,
					reject,
				);
			}

			if (status < 200 || status >= 300) {
				res.resume();
				return reject(
					Object.assign(new Error(`Request failed, status ${status}`), {
						status,
					}),
				);
			}

			const chunks: Uint8Array[] = [];
			res.on("data", (chunk: Uint8Array) => chunks.push(chunk));
			res.on("error", reject);
			res.on("end", () => {
				const bytes = new Uint8Array(
					chunks.reduce((total, chunk) => total + chunk.length, 0),
				);
				let offset = 0;
				for (const chunk of chunks) {
					bytes.set(chunk, offset);
					offset += chunk.length;
				}
				resolve(bytes.buffer);
			});
		});

		req.setTimeout(30000, () => req.destroy(new Error("Request timed out")));
		req.on("error", reject);
	});
}
