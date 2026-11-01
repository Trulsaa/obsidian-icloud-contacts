export type JCardCollection = JCardPart[];
export type JCardPart = {
	key: string;
	meta: { [key: string]: string | string[] };
	type: string;
	value: string | string[];
};

const SUPPORTED_VCARD_VERSIONS = ["2.1", "3.0", "4.0"];
const STRUCTURED_KEYS = ["n", "adr", "org"];
// PROPERTY[;PARAMETER[=VALUE]]:VALUE (lines with empty or missing values are skipped)
const VCARD_LINE = /^([^;:]+)((?:;[^;:]+)*):([\s\S]+)$/;

function camelCase(input: string): string {
	input = input.trim();
	if (input.length <= 1) return input.toLowerCase();

	if (input !== input.toLowerCase()) input = preserveCamelCase(input);

	return input
		.replace(/^[_.\- ]+/, "")
		.toLowerCase()
		.replace(/[_.\- ]+(\w|$)/g, (_, p1) => p1.toUpperCase())
		.replace(/\d+(\w|$)/g, (m) => m.toUpperCase());
}

function preserveCamelCase(input: string): string {
	let isLastCharLower = false;
	let isLastCharUpper = false;
	let isLastLastCharUpper = false;

	for (let i = 0; i < input.length; i++) {
		const character = input[i];
		const isLetter = /[a-zA-Z]/.test(character);

		if (
			isLastCharLower &&
			isLetter &&
			character.toUpperCase() === character
		) {
			input = input.slice(0, i) + "-" + input.slice(i);
			isLastCharLower = false;
			isLastLastCharUpper = isLastCharUpper;
			isLastCharUpper = true;
			i++;
		} else if (
			isLastCharUpper &&
			isLastLastCharUpper &&
			isLetter &&
			character.toLowerCase() === character
		) {
			input = input.slice(0, i - 1) + "-" + input.slice(i - 1);
			isLastLastCharUpper = isLastCharUpper;
			isLastCharUpper = false;
			isLastCharLower = true;
		} else {
			isLastCharLower =
				character.toLowerCase() === character &&
				character.toUpperCase() !== character;
			isLastLastCharUpper = isLastCharUpper;
			isLastCharUpper =
				character.toUpperCase() === character &&
				character.toLowerCase() !== character;
		}
	}

	return input;
}

function addParam(
	params: JCardPart["meta"],
	key: string,
	value: string,
): void {
	const existing = params[key];
	if (existing === undefined) params[key] = value;
	else if (Array.isArray(existing)) existing.push(value);
	else params[key] = [existing, value];
}

function parseParams(
	rawParams: string,
	group: string | undefined,
): JCardPart["meta"] {
	const params: JCardPart["meta"] = group ? { group } : {};
	if (!rawParams) return params;

	for (const param of rawParams.slice(1).split(";")) {
		const parts = param.split("=");
		let key = camelCase(parts[0]);
		let value = parts[1];

		if (value == null || value === "") {
			value = parts[0];
			key = "type";
		}

		if (key !== "type") {
			addParam(params, key, value);
			continue;
		}

		if (
			value[0] === '"' &&
			value[value.length - 1] === '"' &&
			value.includes(",")
		) {
			value = value.slice(1, -1);
		}
		for (const type of value.toLowerCase().split(",")) {
			addParam(params, "type", type);
		}
	}

	return params;
}

function parseVCardLines(vcardString: string): {
	version: string;
	parts: JCardPart[];
} {
	const firstCard = vcardString.split(/(?=BEGIN:VCARD)/i)[0];
	const lines = firstCard
		.trim()
		.replace(/\r?\n[ \t]/g, "")
		.split(/\r?\n/)
		.filter((line) => line !== "");

	if (!/BEGIN:VCARD/i.test(lines[0])) {
		throw new SyntaxError(
			`Invalid vCard: Expected "BEGIN:VCARD" but found "${lines[0]}"`,
		);
	}
	if (!/END:VCARD/i.test(lines[lines.length - 1])) {
		throw new SyntaxError(
			`Invalid vCard: Expected "END:VCARD" but found "${lines[lines.length - 1]}"`,
		);
	}

	const versionLine = lines.find((line) => /^VERSION:\d\.\d/i.test(line));
	if (!versionLine) {
		throw new SyntaxError(
			'Invalid vCard: Expected "VERSION:\\d.\\d" but none found',
		);
	}
	const version = versionLine.substring(8, 11);
	if (!SUPPORTED_VCARD_VERSIONS.includes(version)) {
		throw new Error(`Unsupported version "${version}"`);
	}

	// Properties are grouped by key in order of first appearance
	const partsByKey = new Map<string, JCardPart[]>();
	for (const line of lines.slice(1, -1)) {
		const match = VCARD_LINE.exec(line);
		if (!match) continue;

		const nameParts = match[1].split(".");
		const key = camelCase(nameParts.pop() as string);
		if (key === "version") continue;

		const meta = parseParams(match[2], nameParts.pop());
		const type = typeof meta.value === "string" ? meta.value : "text";
		if (type === "text") delete meta.value;

		const value = STRUCTURED_KEYS.includes(key)
			? match[3].split(";")
			: match[3];
		const part: JCardPart = { key, meta, type, value };

		const existing = partsByKey.get(key);
		if (existing) existing.push(part);
		else partsByKey.set(key, [part]);
	}

	const parts: JCardPart[] = [];
	partsByKey.forEach((keyParts) => parts.push(...keyParts));
	return { version, parts };
}

export type NameOrder = "givenFirst" | "familyFirst";

export function parseVCardToJCardAndFullName(
	vcardString: string,
	nameOrder: NameOrder = "givenFirst",
): {
	jCard: JCardCollection;
	fullName: string;
} {
	const jCard = parseVCardToJCard(vcardString);
	return {
		jCard,
		fullName: getFullName(jCard, nameOrder),
	};
}

export function parseVCardToJCard(vcardString: string): JCardPart[] {
	const { version, parts } = parseVCardLines(vcardString);
	return [{ key: "version", meta: {}, type: "text", value: version }, ...parts];
}

export function getFullNameFromVCard(
	vcardString: string,
	nameOrder: NameOrder = "givenFirst",
): string {
	return getFullName(parseVCardToJCard(vcardString), nameOrder);
}

// Related names (X-ABRELATEDNAMES) are free text, not structured like N, so
// there's no given/family split to go by. Assume the common convention of
// writing them as "Given [Middle] Family" and, for familyFirst, move the
// last word (assumed to be the family name) to the front, matching how a
// contact's own name is reordered from N.
export function reorderFreeTextName(
	name: string,
	nameOrder: NameOrder = "givenFirst",
): string {
	if (nameOrder !== "familyFirst") return name;
	const words = name.trim().split(/\s+/);
	if (words.length < 2) return name;
	const familyName = words.pop();
	return [familyName, ...words].join(" ");
}

function getFullName(jCard: JCardCollection, nameOrder: NameOrder): string {
	const isOrg =
		jCard.find(({ key }) => key === "xAbShowAs")?.value === "COMPANY";
	if (isOrg) {
		return (
			jCard.find(({ key }) => key === "org")?.value as string[]
		)[0].replace(/\\/g, "");
	}

	// Build the name from the structured N field whenever possible. iCloud's
	// FN field reflects whatever order the name happened to be in when the
	// contact was created/imported, and does not reliably follow the "Show
	// First Name: Following Last Name" display setting, which causes
	// inconsistent name order across contacts. N is always structured, so
	// using it gives a consistent order for every contact.
	const name = jCard.find(({ key }) => key === "n");
	if (name) {
		const fullNameFromN = convertNameToFullName(
			name.value as string[],
			nameOrder,
		);
		if (fullNameFromN) return fullNameFromN.replace(/\\/g, "");
	}

	const fullName = jCard.find(({ key }) => key === "fn");
	if (fullName && fullName.value) {
		return (fullName.value as string).replace(/\\/g, "");
	}

	throw new Error("Unable to get full name");
}

function convertNameToFullName(
	[
		familyName,
		givenName,
		additionalMiddleNames,
		honorificPrefixes,
		honorificSuffixes,
	]: string[],
	nameOrder: NameOrder,
) {
	const nameParts =
		nameOrder === "familyFirst"
			? [
					honorificPrefixes,
					familyName,
					givenName,
					additionalMiddleNames,
					honorificSuffixes,
				]
			: [
					honorificPrefixes,
					givenName,
					additionalMiddleNames,
					familyName,
					honorificSuffixes,
				];
	return nameParts.filter((p) => !!p).join(" ");
}
