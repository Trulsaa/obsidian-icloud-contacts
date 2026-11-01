import { describe, expect, test } from "@jest/globals";
import { buildXml, parseXml } from "./xml";

describe("buildXml", () => {
	test("adds namespace prefix to names without one and writes attributes", () => {
		expect(
			buildXml(
				{
					propfind: {
						_attributes: { "xmlns:d": "DAV:" },
						prop: {
							"d:displayname": {},
							"cs:getctag": {},
						},
					},
				},
				"d",
			),
		).toBe(
			[
				'<?xml version="1.0" encoding="utf-8"?>',
				'<d:propfind xmlns:d="DAV:">',
				"  <d:prop>",
				"    <d:displayname/>",
				"    <cs:getctag/>",
				"  </d:prop>",
				"</d:propfind>",
			].join("\n"),
		);
	});

	test("writes arrays as repeated elements and escapes text", () => {
		expect(
			buildXml(
				{
					"addressbook-multiget": {
						"d:href": ["/a.vcf", "/b&c.vcf", "/<d>.vcf"],
						filter: { "prop-filter": { _attributes: { name: 'F"N' } } },
					},
				},
				"card",
			),
		).toBe(
			[
				'<?xml version="1.0" encoding="utf-8"?>',
				"<card:addressbook-multiget>",
				"  <d:href>/a.vcf</d:href>",
				"  <d:href>/b&amp;c.vcf</d:href>",
				"  <d:href>/&lt;d&gt;.vcf</d:href>",
				"  <card:filter>",
				'    <card:prop-filter name="F&quot;N"/>',
				"  </card:filter>",
				"</card:addressbook-multiget>",
			].join("\n"),
		);
	});
});

describe("parseXml", () => {
	test("removes namespace prefixes, camelCases names and replaces text elements with their values", () => {
		const xml = `<?xml version="1.0" encoding="UTF-8"?>
<D:multistatus xmlns:D="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav">
  <D:response>
    <D:href>/123/carddavhome/</D:href>
    <D:propstat>
      <D:prop>
        <card:addressbook-home-set><D:href>https://example.com/home/</D:href></card:addressbook-home-set>
        <D:sync-token>5</D:sync-token>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>`;

		expect(parseXml(xml)).toEqual({
			multistatus: {
				_attributes: {
					"xmlns:D": "DAV:",
					"xmlns:card": "urn:ietf:params:xml:ns:carddav",
				},
				response: {
					href: "/123/carddavhome/",
					propstat: {
						prop: {
							addressbookHomeSet: { href: "https://example.com/home/" },
							syncToken: 5,
						},
						status: "HTTP/1.1 200 OK",
					},
				},
			},
		});
	});

	test("turns repeated elements into arrays and keeps empty elements as objects", () => {
		const xml = `<multistatus xmlns="DAV:">
			<response><href>/a</href><propstat><prop><resourcetype><collection/><addressbook xmlns="urn:ietf:params:xml:ns:carddav"/></resourcetype></prop></propstat></response>
			<response><href>/b</href></response>
		</multistatus>`;

		expect(parseXml(xml)).toEqual({
			multistatus: {
				response: [
					{
						href: "/a",
						propstat: {
							prop: {
								resourcetype: { collection: {}, addressbook: {} },
							},
						},
					},
					{ href: "/b" },
				],
			},
		});
	});

	test("reads CDATA as _cdata (trimmed) and decodes entities in text", () => {
		const xml = `<multistatus xmlns="DAV:"><response>
			<a><![CDATA[ BEGIN:VCARD\r\nFN:Ola & <Co>\r\nEND:VCARD\r\n ]]></a>
			<b>Kari &amp; Per &lt;x&gt; &quot;q&quot; &apos;a&apos; &#xE5;&#248;&#13;</b>
		</response></multistatus>`;

		expect(parseXml(xml).multistatus.response).toEqual({
			a: { _cdata: "BEGIN:VCARD\r\nFN:Ola & <Co>\r\nEND:VCARD" },
			b: "Kari & Per <x> \"q\" 'a' åø",
		});
	});

	test("converts numeric and boolean text but leaves other text as strings", () => {
		const xml = `<r><n>12</n><f>1.5e3</f><t>True</t><fa>false</fa><s>hello</s><sp>  padded  </sp><etag>"abc"</etag></r>`;

		expect(parseXml(xml).r).toEqual({
			n: 12,
			f: 1500,
			t: true,
			fa: false,
			s: "hello",
			sp: "padded",
			etag: '"abc"',
		});
	});

	test("replaces each repeated text element with its own value", () => {
		expect(parseXml("<r><h>/a</h><h>/b</h><h>/c</h></r>").r).toEqual({
			h: ["/a", "/b", "/c"],
		});
	});

	test("ignores the default xmlns attribute, trims and decodes other attributes", () => {
		const xml = `<r xmlns="DAV:" id=" 1 " x='a "q" b&amp;c'/>`;
		expect(parseXml(xml)).toEqual({
			r: { _attributes: { id: "1", x: 'a "q" b&c' } },
		});
	});

	test("ignores declaration, comments and whitespace between elements", () => {
		expect(
			parseXml(`<?xml version="1.0"?>\r\n<!-- c --><r>\r\n  <a>x</a>\r\n</r>\r\n`),
		).toEqual({ r: { a: "x" } });
	});

	test("returns an empty object for empty documents", () => {
		expect(parseXml("")).toEqual({});
	});

	test.each([
		["mismatched tags", "<a><b></a></b>"],
		["unclosed element", "<a><b></b>"],
		["text outside root", "not xml at all"],
	])("throws on %s", (_name, xml) => {
		expect(() => parseXml(xml)).toThrow(SyntaxError);
	});
});
