import { afterAll, beforeAll, describe, expect, test } from "@jest/globals";
import http from "http";
import { AddressInfo } from "net";
import { nodeGet } from "./nodeGet";

let server: http.Server;
let base: string;
const seenAuth: Record<string, string | undefined> = {};

beforeAll(async () => {
	server = http.createServer((req, res) => {
		seenAuth[req.url as string] = req.headers.authorization;
		if (req.url === "/img") {
			res.writeHead(200, { "content-type": "image/jpeg" });
			res.end(Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
		} else if (req.url === "/redirect") {
			res.writeHead(302, { location: "/img" });
			res.end();
		} else if (req.url === "/loop") {
			res.writeHead(302, { location: "/loop" });
			res.end();
		} else {
			res.writeHead(421);
			res.end();
		}
	});
	await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
	base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise((r) => server.close(r)));

describe("nodeGet", () => {
	test("returns the body and sends the headers", async () => {
		const data = await nodeGet(`${base}/img`, { authorization: "Basic x" });
		expect(Array.from(new Uint8Array(data))).toEqual([0xff, 0xd8, 0xff, 0xe0]);
		expect(seenAuth["/img"]).toBe("Basic x");
	});

	test("follows same-origin redirects with credentials", async () => {
		const data = await nodeGet(`${base}/redirect`, { authorization: "Basic x" });
		expect(new Uint8Array(data).length).toBe(4);
	});

	test("rejects with status on non-2xx", async () => {
		await expect(nodeGet(`${base}/nope`, {})).rejects.toMatchObject({
			status: 421,
		});
	});

	test("gives up on redirect loops", async () => {
		await expect(nodeGet(`${base}/loop`, {})).rejects.toThrow(
			"Too many redirects",
		);
	});
});
