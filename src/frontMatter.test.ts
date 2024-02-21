import { describe, expect, test } from "@jest/globals";
import { createFrontmatter } from "./frontMatter";

const testCases = [
	[
		"Should parse tel",
		[
			{
				key: "tel",
				value: "+18003310500",
				meta: { type: "pref" },
			},
		],
		{ telephone: ["+18003310500"], name: "Full Name" },
		{ addLabels: true },
	],
	[
		"Should parse org",
		[
			{
				key: "org",
				meta: {},
				type: "text",
				value: ["Company", "departement"],
			},
		],
		{
			organization: "Company",
			departement: "departement",
			name: "Full Name",
		},
		{ addLabels: true },
	],
	[
		"Should parse birthday",
		[
			{
				key: "bday",
				meta: { value: "date" },
				type: "date",
				value: "1604-03-03",
			},
		],
		{ birthday: "1604-03-03", name: "Full Name" },
		{ addLabels: true },
	],
	[
		"Should parse nickname",
		[{ key: "nickname", meta: {}, type: "text", value: "nickname" }],
		{ name: "Full Name", nickname: "nickname" },
		{ addLabels: true },
	],
	[
		"Should parse note",
		[{ key: "note", meta: {}, type: "text", value: "A lot og notes" }],
		{ name: "Full Name", note: "A lot og notes" },
		{ addLabels: true },
	],
	[
		"Should parse telephone withouth labels",
		[
			{
				key: "tel",
				meta: { type: ["cell", "voice", "pref"] },
				type: "text",
				value: "12345678",
			},
			{
				key: "tel",
				meta: { type: ["iphone", "cell", "voice"] },
				type: "text",
				value: "87654321",
			},
			{
				key: "tel",
				meta: { group: "item4" },
				type: "text",
				value: "00 000003",
			},
			{
				key: "xAbLabel",
				meta: { group: "item4" },
				type: "text",
				value: "APPLE WATCH",
			},
		],
		{
			telephone: ["12345678", "87654321", "00 000003"],
			name: "Full Name",
		},
		{ addLabels: false },
	],
	[
		"Should parse telephone",
		[
			{
				key: "tel",
				meta: { type: ["cell", "voice", "pref"] },
				type: "text",
				value: "12345678",
			},
			{
				key: "tel",
				meta: { type: ["iphone", "cell", "voice"] },
				type: "text",
				value: "87654321",
			},
			{
				key: "tel",
				meta: { group: "item4" },
				type: "text",
				value: "00 000003",
			},
			{
				key: "xAbLabel",
				meta: { group: "item4" },
				type: "text",
				value: "APPLE WATCH",
			},
		],
		{
			telephone: [
				"12345678",
				"iphone: 87654321",
				"APPLE WATCH: 00 000003",
			],
			name: "Full Name",
		},
		{ addLabels: true },
	],
	[
		"Should parse email",
		[
			{
				key: "email",
				meta: { type: ["internet", "home", "pref"] },
				type: "text",
				value: "home@e.mail",
			},
			{
				key: "email",
				meta: { type: ["internet", "work"] },
				type: "text",
				value: "work@e.mail",
			},
			{
				key: "email",
				meta: { group: "item2", type: "internet" },
				type: "text",
				value: "school@e.mail",
			},
			{
				key: "email",
				meta: { group: "item3", type: "internet" },
				type: "text",
				value: "other@e.mail",
			},
			{
				key: "xAbLabel",
				meta: { group: "item2" },
				type: "text",
				value: "_$!<School>!$_",
			},
			{
				key: "xAbLabel",
				meta: { group: "item3" },
				type: "text",
				value: "_$!<Other>!$_",
			},
		],
		{
			email: [
				"home: home@e.mail",
				"work: work@e.mail",
				"School: school@e.mail",
				"Other: other@e.mail",
			],
			name: "Full Name",
		},
		{ addLabels: true },
	],
	[
		"Should parse addresses",
		[
			{
				key: "adr",
				meta: { group: "item5", type: ["home", "pref"] },
				type: "text",
				value: [
					"",
					"",
					"Home road 6",
					"Texas",
					"",
					"1234",
					"United States",
				],
			},
			{
				key: "adr",
				meta: { group: "item6", type: "work" },
				type: "text",
				value: ["", "", "Work street 2", "Alta", "", "7896", "Norway"],
			},
			{
				key: "xAbadr",
				meta: { group: "item5" },
				type: "text",
				value: "us",
			},
			{
				key: "xAbadr",
				meta: { group: "item6" },
				type: "text",
				value: "no",
			},
		],
		{
			addresses: [
				"Home road 6, Texas, 1234, United States",
				"Work street 2, Alta, 7896, Norway",
			],
			name: "Full Name",
		},
		{ addLabels: true },
	],
	[
		"Should parse url",
		[
			{
				key: "url",
				meta: { group: "item7", type: "pref" },
				type: "text",
				value: "http://hompageurl.com",
			},
			{
				key: "url",
				meta: { type: "home" },
				type: "text",
				value: "example.com",
			},
			{
				key: "xAbLabel",
				meta: { group: "item7" },
				type: "text",
				value: "_$!<HomePage>!$_",
			},
		],
		{
			url: ["HomePage: http://hompageurl.com", "example.com"],
			name: "Full Name",
		},
		{ addLabels: true },
	],
	/* [
		"Should parse all",
		[
			{
				key: "n",
				meta: {},
				type: "text",
				value: ["Nordmann", "Test", "middlename", "prefix", "suffix"],
			},
			{
				key: "fn",
				meta: {},
				type: "text",
				value: "prefix Test middlename Nordmann suffix",
			},
			{
				key: "xAbLabel",
				meta: { group: "item8" },
				type: "text",
				value: "Mattermost",
			},
			{
				key: "xAbLabel",
				meta: { group: "item9" },
				type: "text",
				value: "WhatsApp",
			},
			{
				key: "xAbLabel",
				meta: { group: "item10" },
				type: "text",
				value: "Discord",
			},
			{
				key: "xAbLabel",
				meta: { group: "item11" },
				type: "text",
				value: "_$!<Anniversary>!$_",
			},
			{
				key: "xAbLabel",
				meta: { group: "item12" },
				type: "text",
				value: "_$!<Other>!$_",
			},
			{
				key: "xAbLabel",
				meta: { group: "item13" },
				type: "text",
				value: "_$!<Mother>!$_",
			},
			{
				key: "xAbLabel",
				meta: { group: "item14" },
				type: "text",
				value: "_$!<Child>!$_",
			},
			{
				key: "photo",
				meta: {
					xAbcropRectangle:
						"ABClipRect_1&0&14&381&381&zqiNGuzQ2Ar/PprxdQXvAQ",
					value: "uri",
				},
				type: "uri",
				value: "https://gateway.icloud.com/contacts/144375197/ck/card/2bb779a484d34806a91eb34189995544",
			},
			{
				key: "impp",
				meta: { xServiceType: "Facebook", type: "pref" },
				type: "text",
				value: "xmpp:TaylorSwift",
			},
			{
				key: "impp",
				meta: {
					group: "item8",
					xServiceType: "Mattermost",
					xTeamidentifier: "UQ8HT4Q2XM",
					xBundleidentifiers: "com.mattermost.rn",
				},
				type: "text",
				value: "x-apple:@m11111",
			},
			{
				key: "impp",
				meta: {
					group: "item9",
					xServiceType: "WhatsApp",
					xTeamidentifier: "57T9237FN3",
					xBundleidentifiers: "net.whatsapp.WhatsApp",
				},
				type: "text",
				value: "x-apple:123456789",
			},
			{
				key: "impp",
				meta: {
					group: "item10",
					xServiceType: "Discord",
					xTeamidentifier: "53Q6R32WPB",
					xBundleidentifiers: "com.hammerandchisel.discord",
				},
				type: "text",
				value: "x-apple:DavidH%235346",
			},
			{
				key: "xSocialprofile",
				meta: { type: "twitter", xUser: "elonmusk" },
				type: "text",
				value: "https://twitter.com/elonmusk",
			},
			{
				key: "xSocialprofile",
				meta: { type: "facebook", xUser: "TaylorSwift" },
				type: "text",
				value: "https://www.facebook.com/TaylorSwift",
			},
			{
				key: "xSocialprofile",
				meta: { type: "linkedin", xUser: "williamhgates" },
				type: "text",
				value: "https://www.linkedin.com/in/williamhgates",
			},
			{
				key: "xSocialprofile",
				meta: {
					type: "x",
					xUser: "elonmusk",
					xTeamidentifier: "N66CZ3Y3BX",
					xBundleidentifiers: "com.atebits.Tweetie2",
				},
				type: "text",
				value: "x-apple:elonmusk",
			},
			{
				key: "xSocialprofile",
				meta: {
					type: "snapchat",
					xUser: "NBA",
					xTeamidentifier: "424M5254LK",
					xBundleidentifiers: "com.toyopagroup.picaboo",
				},
				type: "text",
				value: "x-apple:NBA",
			},
			{
				key: "xSocialprofile",
				meta: {
					type: "github",
					xUser: "robpike",
					xTeamidentifier: "VEKTX9H2N7",
					xBundleidentifiers: "com.github.stormbreaker.prod",
				},
				type: "text",
				value: "x-apple:robpike",
			},
			{
				key: "xAbdate",
				meta: { group: "item11", type: "pref" },
				type: "text",
				value: "1604-04-01",
			},
			{
				key: "xAbdate",
				meta: { group: "item12" },
				type: "text",
				value: "1604-02-20",
			},
			{
				key: "xAbrelatednames",
				meta: { group: "item13", type: "pref" },
				type: "text",
				value: "Test Nordmann",
			},
			{
				key: "xAbrelatednames",
				meta: { group: "item14" },
				type: "text",
				value: "Test Nordmann",
			},
			{
				key: "rev",
				meta: {},
				type: "text",
				value: "2024-02-20T12:09:57Z",
			},
			{
				key: "uid",
				meta: {},
				type: "text",
				value: "cc980d6c-0b58-4a14-a239-16325c834237",
			},
			{
				key: "xImagehash",
				meta: {},
				type: "text",
				value: "zqiNGuzQ2Ar/PprxdQXvAQ==",
			},
		],
		{
			name: "Full Name",
		},
		{ addLabels: true },
	], */
];

describe("createFrontmatter", () => {
	describe("parseVCard", () => {
		test.each(testCases)(
			"%s",
			(
				_testLabel: string,
				parsedVCard: any,
				expected: any,
				settings: { addLabels: boolean },
			) => {
				expect(
					createFrontmatter(
						parsedVCard,
						"n photo prodid rev uid version xAbadr xAbLabel xAbShowAs xImagehash xImagetype xSocialprofile xSharedPhotoDisplayPref xAddressingGrammar xAppleSubadministrativearea xAppleSublocality xSocialprofile".split(
							/\s+/,
						),
						"Full Name",
						settings,
					),
				).toEqual(expected);
			},
		);
	});
});
