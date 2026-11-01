import { describe, expect, test } from "@jest/globals";
import {
	base64ToArrayBuffer,
	detectImageExtension,
	getPhotoBaseName,
	getPhotoSource,
	isTrustedPhotoUrl,
	updatePhotoEmbed,
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

describe("updatePhotoEmbed", () => {
	const path = "Contacts/Photos/a.jpg";
	const embed = "![[Contacts/Photos/a.jpg]]";
	const insert = { path, insertIfMissing: true, heading: "Test" };

	test("inserts under the heading in a bare file", () => {
		expect(updatePhotoEmbed("# Test", insert)).toBe(`# Test\n\n${embed}\n`);
	});

	test("inserts under the heading without touching text below it", () => {
		const data = "---\nname: Test\n---\n# Test\n\nMy notes\nmore";
		expect(updatePhotoEmbed(data, insert)).toBe(
			`---\nname: Test\n---\n# Test\n\n${embed}\n\nMy notes\nmore`,
		);
	});

	test("inserts at the top of the body when there is no heading", () => {
		const data = "---\nname: Test\n---\nMy notes";
		expect(
			updatePhotoEmbed(data, { path, insertIfMissing: true }),
		).toBe(`---\nname: Test\n---\n${embed}\n\nMy notes`);
		expect(updatePhotoEmbed("", { path, insertIfMissing: true })).toBe(
			`${embed}\n`,
		);
	});

	test("does not insert when the user removed the line", () => {
		const data = "# Test\n\nMy notes";
		expect(
			updatePhotoEmbed(data, { ...insert, previousPath: path, insertIfMissing: false }),
		).toBe(data);
	});

	test("replaces only the path and keeps a custom size and the text around it", () => {
		const data = "# Test\n\n![[Contacts/Photos/a.png|300]]\n\nMy notes";
		expect(
			updatePhotoEmbed(data, {
				previousPath: "Contacts/Photos/a.png",
				path,
				insertIfMissing: false,
			}),
		).toBe(`# Test\n\n![[Contacts/Photos/a.jpg|300]]\n\nMy notes`);
	});

	test("leaves an unchanged embed as it is", () => {
		const data = `# Test\n\n![[${path}|300]]\n\nMy notes`;
		expect(
			updatePhotoEmbed(data, { previousPath: path, path, insertIfMissing: true }),
		).toBe(data);
	});

	test("removes just the embed line when the photo goes away", () => {
		const data = `# Test\n\n${embed}\nMy notes`;
		expect(updatePhotoEmbed(data, { previousPath: path, insertIfMissing: false })).toBe(
			"# Test\n\nMy notes",
		);
	});

	test("ignores embeds of other images", () => {
		const data = "# Test\n\n![[other.jpg]]\nMy notes";
		expect(updatePhotoEmbed(data, { previousPath: path, insertIfMissing: false })).toBe(data);
	});
});
