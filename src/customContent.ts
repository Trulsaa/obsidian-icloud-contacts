import { escapeRegExp } from "./photo";

// A match must be whole lines, so a short content like "x" never matches inside other text.
function findBlock(
	data: string,
	text: string,
): { start: number; end: number } | undefined {
	let from = 0;
	while (true) {
		const start = data.indexOf(text, from);
		if (start === -1) return undefined;
		const end = start + text.length;
		const startsLine = start === 0 || data[start - 1] === "\n";
		const endsLine = /^[ \t]*(?:\r?\n|$)/.test(data.slice(end));
		if (startsLine && endsLine) return { start, end };
		from = start + 1;
	}
}

function insertionPoint(
	data: string,
	bodyStart: number,
	heading?: string,
	photoPath?: string,
): number {
	let at = bodyStart;

	if (heading) {
		const headingLine = new RegExp(`^# ${escapeRegExp(heading)}[ \\t]*$`, "m");
		const match = headingLine.exec(data.slice(bodyStart));
		if (match) at = bodyStart + match.index + match[0].length;
	}

	if (photoPath) {
		const embed = new RegExp(
			`^\\s*!\\[\\[${escapeRegExp(photoPath)}(?:\\|[^\\]]*)?\\]\\][ \\t]*(?=\\r?\\n|$)`,
		);
		const match = embed.exec(data.slice(at));
		if (match) at += match[0].length;
	}

	return at;
}

// The plugin leaves no marker in the file. It finds its text again by looking for the
// exact previous content, line for line, and only ever replaces or removes that text.
// If the user has edited it by hand it is no longer found: it is then not updated or
// removed, and changed content is added as a new block.
export function updateCustomContent(
	data: string,
	content: string | undefined,
	options: {
		previousContent?: string;
		heading?: string;
		photoPath?: string;
	} = {},
): string {
	const text = content?.trim() ?? "";
	const previous = options.previousContent?.trim() ?? "";

	if (previous) {
		const block = findBlock(data, previous);
		if (block) {
			if (text === previous) return data;
			if (text) {
				return data.slice(0, block.start) + text + data.slice(block.end);
			}

			let before = data.slice(0, block.start);
			let after = data.slice(block.end).replace(/^[ \t]*\r?\n/, "");
			after = after.replace(/^\r?\n/, "");
			if (after === "") before = before.replace(/\r?\n\r?\n$/, "");
			return before + after;
		}
		// Unchanged content that is gone was deleted or edited by the user. Keep it that way.
		if (text === previous) return data;
	}

	if (!text || findBlock(data, text)) return data;

	const frontmatter = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/.exec(data);
	const bodyStart = frontmatter ? frontmatter[0].length : 0;
	const at = insertionPoint(data, bodyStart, options.heading, options.photoPath);
	const rest = data.slice(at);

	if (at > bodyStart) {
		return `${data.slice(0, at)}\n\n${text}${rest === "" ? "\n" : rest}`;
	}
	return `${data.slice(0, at)}${text}\n${rest === "" ? "" : "\n"}${rest}`;
}
