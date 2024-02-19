import { describe, expect, test } from "@jest/globals";
import { createFrontmatter } from "./frontMatter";
import { ParsedVCard } from "./parser";

const testCases = [
	[{}, {}],
	[
		{
			key: "tel",
			value: "+18003310500",
			meta: { type: "pref" },
		},
		{ telephone: ["+18003310500"] },
	],
].map(([cardPart, expected]: any) => {
	expected.name = "Full Name";
	return [[cardPart], expected];
});

describe("createFrontmatter", () => {
	describe("parseVCard", () => {
		test.each(testCases)(
			"Shoud create frontMatter",
			(parsedVCard: any, expected: any) => {
				expect(
					createFrontmatter(parsedVCard, [""], "Full Name"),
				).toEqual(expected);
			},
		);
	});
});
