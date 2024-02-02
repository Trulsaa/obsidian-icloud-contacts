import { describe, expect, test } from "@jest/globals";
import { getFullName, ParsedVCard, parseVCard } from "./parser";

function padVCard(vCardString: string) {
	return `BEGIN:VCARD\r\nVERSION:3.0\r\n${vCardString}\r\nEND:VCARD`;
}

const parseVCardTestCases = [
	[
		"NICKNAME:Lars",
		[{ key: "nickname", meta: {}, type: "text", value: "Lars" }],
	],
	["N:Larsen;Lars;;;", [{ key: "n", value: ["Larsen", "Lars", "", "", ""] }]],
	[
		"nUID:cf762aeb-16fc-4aa2-9e68-b8e8ad627c73",
		[{ key: "nUid", value: "cf762aeb-16fc-4aa2-9e68-b8e8ad627c73" }],
	],
	[
		"ADR:;;24 Oskar Braatens gate;;;;Norge;",
		[
			{
				key: "adr",
				value: [
					"",
					"",
					"24 Oskar Braatens gate",
					"",
					"",
					"",
					"Norge",
					"",
				],
			},
		],
	],
	[
		"ADR:;;1 Lars Olavs gate;;;;Sverge;\r\nADR:;;Gladengveien 124;London;London;0661;Sverge;",
		[
			{
				key: "adr",
				value: ["", "", "1 Lars Olavs gate", "", "", "", "Sverge", ""],
			},
			{
				key: "adr",
				value: [
					"",
					"",
					"Gladengveien 124",
					"London",
					"London",
					"0661",
					"Sverge",
					"",
				],
			},
		],
	],
	[
		"PRODID:-//Apple Inc.//iOS 16.0//EN",
		[{ key: "prodid", value: "-//Apple Inc.//iOS 16.0//EN" }],
	],
	[
		"REV:2023-03-28T15:56:47Z",
		[{ key: "rev", value: "2023-03-28T15:56:47Z" }],
	],
	[
		"URL:fb://profile/750670820",
		[{ key: "url", value: "fb://profile/750670820" }],
	],
	[
		"URL:http://www.google.com/profiles/107600836205530248182",
		[
			{
				key: "url",
				value: "http://www.google.com/profiles/107600836205530248182",
			},
		],
	],
	["ORG:;", [{ key: "org", value: ["", ""] }]],
	[
		"EMAIL:larslarsen@gmail.com",
		[{ key: "email", value: "larslarsen@gmail.com" }],
	],
	[
		"EMAIL:me@larslarsen.com\r\nEMAIL:mail@larslarsen.com\r\nEMAIL:larslarsen@icloud.com",
		[
			{ key: "email", value: "me@larslarsen.com" },
			{ key: "email", value: "mail@larslarsen.com" },
			{ key: "email", value: "larslarsen@icloud.com" },
		],
	],
	[
		"PHOTO;VALUE=uri:https://gateway.icloud.com/contacts/144375197/ck/card/c5348",
		[
			{
				key: "photo",
				meta: { value: "uri" },
				type: "uri",
				value: "https://gateway.icloud.com/contacts/144375197/ck/card/c5348",
			},
		],
	],
	["TEL:+47 999 02 413", [{ key: "tel", value: "+47 999 02 413" }]],
	[
		"item7.X-ABADR:NOitem7.X-APPLE-SUBLOCALITY:Gamle Oslo",
		[
			{
				key: "xAbadr",
				meta: { group: "item7" },
				value: "NOitem7.X-APPLE-SUBLOCALITY:Gamle Oslo",
			},
		],
	],
	["X-IMAGETYPE:PHOTO", [{ key: "xImagetype", value: "PHOTO" }]],
	[
		"X-IMAGEHASH:9h9GHUJg23Q9/kS2O3/KwQ==",
		[{ key: "xImagehash", value: "9h9GHUJg23Q9/kS2O3/KwQ==" }],
	],
	[
		"ORG:ATT;\r\nX-ABShowAs:COMPANY",
		[
			{ key: "org", value: ["ATT", ""] },
			{ key: "xAbShowAs", value: "COMPANY" },
		],
	],
	["ORG:ATT;IT", [{ key: "org", value: ["ATT", "IT"] }]],
	[
		"TEL;type=pref:+18003310500",
		[{ key: "tel", value: "+18003310500", meta: { type: "pref" } }],
	],
].map(([vCardString, expected]: any) => {
	for (const e of expected) {
		if (!e.meta) e.meta = {};
		if (!e.type) e.type = "text";
	}
	return [vCardString, expected];
});

const getFullNameTestCases = [
	["ORG:Belhaven;\r\nX-ABShowAs:COMPANY", "Belhaven"],
];

describe("parser", () => {
	describe("parseVCard", () => {
		test.each(parseVCardTestCases)(
			"Should parse %s",
			(vCardString: string, expected: ParsedVCard[]) => {
				expect(parseVCard(padVCard(vCardString))).toEqual([
					{ key: "version", meta: {}, type: "text", value: "3.0" },
					...expected,
				]);
			},
		);
	});

	describe("getFullName", () => {
		test.each(getFullNameTestCases)(
			"Should get fullname from %s",
			(vCardString: string, expected: string) => {
				expect(getFullName(padVCard(vCardString))).toEqual(expected);
			},
		);
	});
});
