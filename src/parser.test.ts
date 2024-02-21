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
	[
		"N:Nordmann;Test;middlename;prefix;suffix\r\nFN:",
		[
			{
				key: "n",
				value: ["Nordmann", "Test", "middlename", "prefix", "suffix"],
			},
		],
	],
	[
		"PRODID:-//Apple Inc.//iOS 17.2.1//EN\r\nN:Nordmann;Test;middlename;prefix;suffix\r\nFN:prefix Test middlename Nordmann suffix\r\nNICKNAME:nickname\r\nitem1.X-ADDRESSING-GRAMMAR:1CJ86F/LblD9prrz6/+0pSPgkamoewX2h6vWcmEEvxrY9D2U\r\n 9wNW+Pf4qcrC9WQbtRm4+ABCYwX7foga7GGq8hJB4/q6q0qwlhkHh5vgFNFYFCwLwSZ3P/4Tm85\r\n YI2zwk8QFOL+UYSTGvXkn3++0j6mKoevWWupCYAd8MjnCxGiHlqSOxcM3o3ApseqG2QxuoclPD8\r\n OkQ01ZQGGARnIYnJFCCs2vCGaI29RnmwAtn8e3HuKaYaediBfPPBZH+5AvqnpniZ/u1OTHJ59Wa\r\n euXHOyhetqJjiieiy1h7jeGBB78trwRNF3eFSUonmcVf/GgnyyJhopJaMbl2rzIrC+3Roh8YMHc\r\n 7PmSvOIfz8VXyu9BxQISLpNx3tiH/XhxzrpOrQ8A8ZDVMBNtZ0C9FQ7Borr+vL0=\r\nORG:Company;\r\nEMAIL;type=INTERNET;type=HOME;type=pref:home@e.mail\r\nEMAIL;type=INTERNET;type=WORK:work@e.mail\r\nitem2.EMAIL;type=INTERNET:school@e.mail\r\nitem2.X-ABLabel:_$!<School>!$_\r\nitem3.EMAIL;type=INTERNET:other@e.mail\r\nitem3.X-ABLabel:_$!<Other>!$_\r\nTEL;type=CELL;type=VOICE;type=pref:12345678\r\nTEL;type=IPHONE;type=CELL;type=VOICE:87654321\r\nitem4.TEL:00 000003\r\nitem4.X-ABLabel:APPLE WATCH\r\nitem5.ADR;type=HOME;type=pref:;;Home road 6;Texas;;1234;United States\r\nitem5.X-ABADR:us\r\nitem6.ADR;type=WORK:;;Work street 2;Alta;;7896;Norway\r\nitem6.X-ABADR:no\r\nNOTE:A lot og notes\r\nitem7.URL;type=pref:http://hompageurl.com\r\nitem7.X-ABLabel:_$!<HomePage>!$_\r\nURL;type=HOME:example.com\r\nBDAY;value=date:1604-03-03\r\nPHOTO;X-ABCROP-RECTANGLE=ABClipRect_1&0&14&381&381&zqiNGuzQ2Ar/PprxdQXvAQ==\r\n ;VALUE=uri:https://gateway.icloud.com/contacts/144375197/ck/card/2bb779a484\r\n d34806a91eb34189995544\r\nIMPP;X-SERVICE-TYPE=Facebook;type=pref:xmpp:TaylorSwift\r\nitem8.IMPP;X-SERVICE-TYPE=Mattermost;x-teamidentifier=UQ8HT4Q2XM;x-bundleid\r\n entifiers=com.mattermost.rn:x-apple:@m11111\r\nitem8.X-ABLabel:Mattermost\r\nitem9.IMPP;X-SERVICE-TYPE=WhatsApp;x-teamidentifier=57T9237FN3;x-bundleiden\r\n tifiers=net.whatsapp.WhatsApp:x-apple:123456789\r\nitem9.X-ABLabel:WhatsApp\r\nitem10.IMPP;X-SERVICE-TYPE=Discord;x-teamidentifier=53Q6R32WPB;x-bundleiden\r\n tifiers=com.hammerandchisel.discord:x-apple:DavidH%235346\r\nitem10.X-ABLabel:Discord\r\nX-SOCIALPROFILE;type=twitter;x-user=elonmusk:https://twitter.com/elonmusk\r\nX-SOCIALPROFILE;type=facebook;x-user=TaylorSwift:https://www.facebook.com/T\r\n aylorSwift\r\nX-SOCIALPROFILE;type=linkedin;x-user=williamhgates:https://www.linkedin.com\r\n /in/williamhgates\r\nX-SOCIALPROFILE;type=X;x-user=elonmusk;x-teamidentifier=N66CZ3Y3BX;x-bundle\r\n identifiers=com.atebits.Tweetie2:x-apple:elonmusk\r\nX-SOCIALPROFILE;type=Snapchat;x-user=NBA;x-teamidentifier=424M5254LK;x-bund\r\n leidentifiers=com.toyopagroup.picaboo:x-apple:NBA\r\nX-SOCIALPROFILE;type=GitHub;x-user=robpike;x-teamidentifier=VEKTX9H2N7;x-bu\r\n ndleidentifiers=com.github.stormbreaker.prod:x-apple:robpike\r\nitem11.X-ABDATE;type=pref:1604-04-01\r\nitem11.X-ABLabel:_$!<Anniversary>!$_\r\nitem12.X-ABDATE:1604-02-20\r\nitem12.X-ABLabel:_$!<Other>!$_\r\nitem13.X-ABRELATEDNAMES;type=pref:Test Nordmann\r\nitem13.X-ABLabel:_$!<Mother>!$_\r\nitem14.X-ABRELATEDNAMES:Test Nordmann\r\nitem14.X-ABLabel:_$!<Child>!$_\r\nREV:2024-02-20T12:09:57Z\r\nUID:cc980d6c-0b58-4a14-a239-16325c834237\r\nX-IMAGEHASH:zqiNGuzQ2Ar/PprxdQXvAQ==",
		[
			{
				key: "prodid",
				meta: {},
				type: "text",
				value: "-//Apple Inc.//iOS 17.2.1//EN",
			},
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
			{ key: "nickname", meta: {}, type: "text", value: "nickname" },
			{
				key: "xAddressingGrammar",
				meta: { group: "item1" },
				type: "text",
				value: "1CJ86F/LblD9prrz6/+0pSPgkamoewX2h6vWcmEEvxrY9D2U9wNW+Pf4qcrC9WQbtRm4+ABCYwX7foga7GGq8hJB4/q6q0qwlhkHh5vgFNFYFCwLwSZ3P/4Tm85YI2zwk8QFOL+UYSTGvXkn3++0j6mKoevWWupCYAd8MjnCxGiHlqSOxcM3o3ApseqG2QxuoclPD8OkQ01ZQGGARnIYnJFCCs2vCGaI29RnmwAtn8e3HuKaYaediBfPPBZH+5AvqnpniZ/u1OTHJ59WaeuXHOyhetqJjiieiy1h7jeGBB78trwRNF3eFSUonmcVf/GgnyyJhopJaMbl2rzIrC+3Roh8YMHc7PmSvOIfz8VXyu9BxQISLpNx3tiH/XhxzrpOrQ8A8ZDVMBNtZ0C9FQ7Borr+vL0=",
			},
			{ key: "org", meta: {}, type: "text", value: ["Company", ""] },
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
			{
				key: "xAbLabel",
				meta: { group: "item4" },
				type: "text",
				value: "APPLE WATCH",
			},
			{
				key: "xAbLabel",
				meta: { group: "item7" },
				type: "text",
				value: "_$!<HomePage>!$_",
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
			{ key: "note", meta: {}, type: "text", value: "A lot og notes" },
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
				key: "bday",
				meta: { value: "date" },
				type: "date",
				value: "1604-03-03",
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
	["FN:\r\nN:Tomsen;Tom;;;", "Tom Tomsen"],
	["N:Tomsen;Tom;;;\r\nFN:Tom Tomsen", "Tom Tomsen"],
	[
		"N:Nordmann;Test;middlename;prefix;suffix\r\nFN:prefix Test middlename Nordmann suffix",
		"prefix Test middlename Nordmann suffix",
	],
	[
		"N:Nordmann;Test;middlename;prefix;suffix\r\nFN:",
		"prefix Test middlename Nordmann suffix",
	],
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
