import { describe, expect, test } from "@jest/globals";
import {
	base64ToArrayBuffer,
	detectImageExtension,
	getPhotoBaseName,
	getPhotoSource,
	isTrustedPhotoUrl,
} from "./photo";

const card = (photoLine: string) =>
	`BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Test\r\n${photoLine}\r\nUID:abc-1\r\nEND:VCARD`;

describe("getPhotoSource", () => {
	test("reads a uri photo", () => {
		expect(
			getPhotoSource(card("PHOTO;VALUE=uri:https://gateway.icloud.com/x")),
		).toEqual({ url: "https://gateway.icloud.com/x" });
	});

	test("strips a property glued onto the url by iCloud", () => {
		const glued =
			"BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Test\r\nPHOTO;VALUE=uri:https://gateway.icloud.com/contacts/1/ck/card/ab12\r\n cd34X-SHARED-PHOTO-DISPLAY-PREF:IMPLICIT_AUTOUPDATE\r\nUID:abc-1\r\nEND:VCARD";
		expect(getPhotoSource(glued)).toEqual({
			url: "https://gateway.icloud.com/contacts/1/ck/card/ab12cd34",
		});
	});

	test("reads a vCard 3.0 base64 photo", () => {
		expect(
			getPhotoSource(card("PHOTO;ENCODING=b;TYPE=JPEG:/9j/4AAQ")),
		).toEqual({ base64: "/9j/4AAQ" });
	});

	test("reads a vCard 4.0 data uri photo", () => {
		expect(
			getPhotoSource(card("PHOTO:data:image/jpeg;base64,/9j/4AAQ")),
		).toEqual({ base64: "/9j/4AAQ" });
	});

	test("returns undefined without a photo", () => {
		expect(getPhotoSource(card("NOTE:hi"))).toBeUndefined();
	});
});

describe("isTrustedPhotoUrl", () => {
	const server = "https://contacts.icloud.com";
	test.each([
		["https://gateway.icloud.com/a", server, true],
		["https://contacts.icloud.com/a", server, true],
		["https://gateway.icloud.com.cn/a", "https://contacts.icloud.com.cn", true],
		["http://gateway.icloud.com/a", server, false],
		["https://evil.example.com/a", server, false],
		["https://icloud.com.evil.com/a", server, false],
		["not a url", server, false],
	])("%s", (url, serverUrl, expected) => {
		expect(isTrustedPhotoUrl(url, serverUrl)).toBe(expected);
	});
});

describe("detectImageExtension", () => {
	test("detects common formats", () => {
		expect(detectImageExtension(new Uint8Array([0xff, 0xd8, 0xff, 0]).buffer)).toBe("jpg");
		expect(detectImageExtension(base64ToArrayBuffer("iVBORw0KGgo="))).toBe("png");
		expect(detectImageExtension(base64ToArrayBuffer("R0lGODlhAQAB"))).toBe("gif");
	});

	test("rejects non images", () => {
		const html = new TextEncoder().encode("<html>login</html>").buffer;
		expect(detectImageExtension(html)).toBeUndefined();
	});
});

describe("getPhotoBaseName", () => {
	test("uses the uid, falling back to the vcf file name", () => {
		expect(getPhotoBaseName(card(""), "https://x/y/z.vcf")).toBe("abc-1");
		expect(
			getPhotoBaseName(
				"BEGIN:VCARD\r\nVERSION:3.0\r\nFN:T\r\nEND:VCARD",
				"https://x/y/a b.vcf",
			),
		).toBe("a_b");
	});
});
