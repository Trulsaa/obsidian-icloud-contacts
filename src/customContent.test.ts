import { describe, expect, test } from "@jest/globals";
import { updateCustomContent } from "./customContent";

const content = '```dataviewjs\ndv.view("Scripts/Contact")\n```';
const heading = { heading: "Test" };

describe("updateCustomContent", () => {
	test("inserts under the heading in a bare file", () => {
		expect(updateCustomContent("# Test", content, heading)).toBe(
			`# Test\n\n${content}\n`,
		);
	});

	test("inserts under the heading without touching text below it", () => {
		const data = "---\nname: Test\n---\n# Test\n\nMy notes\nmore";
		expect(updateCustomContent(data, content, heading)).toBe(
			`---\nname: Test\n---\n# Test\n\n${content}\n\nMy notes\nmore`,
		);
	});

	test("inserts below the photo embed that follows the heading", () => {
		const photoPath = "Contacts/Photos/a.jpg";
		const data = `# Test\n\n![[${photoPath}]]\n\nMy notes`;
		expect(
			updateCustomContent(data, content, { ...heading, photoPath }),
		).toBe(`# Test\n\n![[${photoPath}]]\n\n${content}\n\nMy notes`);
	});

	test("does not skip past a photo embed that is further down in the notes", () => {
		const photoPath = "Contacts/Photos/a.jpg";
		const data = `# Test\n\nMy notes\n\n![[${photoPath}]]\nmore`;
		expect(
			updateCustomContent(data, content, { ...heading, photoPath }),
		).toBe(`# Test\n\n${content}\n\nMy notes\n\n![[${photoPath}]]\nmore`);
	});

	test("inserts at the top of the body when there is no heading", () => {
		const data = "---\nname: Test\n---\nMy notes";
		expect(updateCustomContent(data, content)).toBe(
			`---\nname: Test\n---\n${content}\n\nMy notes`,
		);
		expect(updateCustomContent("", content)).toBe(`${content}\n`);
	});

	test("keeps an existing dataviewjs block the user wrote by hand", () => {
		const own = '```dataviewjs\ndv.view("Own/Script")\n```';
		const data = `# Test\n\n${own}\n\nMy notes`;
		expect(updateCustomContent(data, content, heading)).toBe(
			`# Test\n\n${content}\n\n${own}\n\nMy notes`,
		);
	});

	test("does not add the content again when it is already in the file", () => {
		const data = `# Test\n\n${content}\n\nMy notes`;
		expect(updateCustomContent(data, content, heading)).toBe(data);
	});

	test("replaces only the previous content", () => {
		const data = `# Test\n\nbefore\nold\nafter\n\nMy notes`;
		expect(
			updateCustomContent(data, "new", { ...heading, previousContent: "old" }),
		).toBe(`# Test\n\nbefore\nnew\nafter\n\nMy notes`);
	});

	test("leaves unchanged content as it is", () => {
		const data = `# Test\n\n${content}\n\nMy notes`;
		expect(
			updateCustomContent(data, content, {
				...heading,
				previousContent: content,
			}),
		).toBe(data);
	});

	test("does not add unchanged content back when the user removed or edited it", () => {
		const data = "# Test\n\nMy notes";
		expect(
			updateCustomContent(data, content, {
				...heading,
				previousContent: content,
			}),
		).toBe(data);
	});

	test("adds the new content when the previous content was edited by hand", () => {
		const data = "# Test\n\nold edited\n\nMy notes";
		expect(
			updateCustomContent(data, "new", { ...heading, previousContent: "old" }),
		).toBe("# Test\n\nnew\n\nold edited\n\nMy notes");
	});

	test("only matches whole lines", () => {
		const data = "# Test\n\nan old story\n\nMy notes";
		expect(
			updateCustomContent(data, "", { ...heading, previousContent: "old" }),
		).toBe(data);
		expect(
			updateCustomContent(data, "new", { ...heading, previousContent: "old" }),
		).toBe("# Test\n\nnew\n\nan old story\n\nMy notes");
	});

	test.each([
		["# Test\n\nMy notes", heading],
		["# Test", heading],
		["---\nname: Test\n---\nMy notes", {}],
		["---\nname: Test\n---\n", {}],
		["", {}],
	])("removing gives back the original file: %j", (original, options) => {
		const withContent = updateCustomContent(original, content, options);
		expect(withContent).not.toBe(original);
		expect(
			updateCustomContent(withContent, "", {
				...options,
				previousContent: content,
			}),
		).toBe(original);
	});

	test("removes just the previous content when it is cleared", () => {
		const data = `# Test\n\nbefore\n${content}\nafter`;
		expect(
			updateCustomContent(data, undefined, {
				...heading,
				previousContent: content,
			}),
		).toBe("# Test\n\nbefore\nafter");
	});

	test("does nothing without content", () => {
		const data = "# Test\n\nMy notes";
		expect(updateCustomContent(data, "", heading)).toBe(data);
		expect(updateCustomContent(data, "  \n ", heading)).toBe(data);
		expect(updateCustomContent(data, undefined, heading)).toBe(data);
	});

	test("is idempotent", () => {
		const once = updateCustomContent("# Test\n\nMy notes", content, heading);
		expect(updateCustomContent(once, content, heading)).toBe(once);
	});
});
