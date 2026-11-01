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

export function parseVCardToJCardAndFullName(vcardString: string): {
	jCard: JCardCollection;
	fullName: string;
} {
	const jCard = parseVCardToJCard(vcardString);
	return {
		jCard,
		fullName: getFullName(jCard),
	};
}

export function parseVCardToJCard(vcardString: string): JCardPart[] {
	const { version, parts } = parseVCardLines(vcardString);
	return [{ key: "version", meta: {}, type: "text", value: version }, ...parts];
}

export function getFullNameFromVCard(vcardString: string): string {
	return getFullName(parseVCardToJCard(vcardString));
}

function getFullName(jCard: JCardCollection): string {
	const fullName = jCard.find(({ key }) => key === "fn");
	if (fullName && fullName.value) {
		return (fullName.value as string).replace(/\\/g, "");
	}

	const isOrg =
		jCard.find(({ key }) => key === "xAbShowAs")?.value === "COMPANY";
	if (isOrg) {
		return (
			jCard.find(({ key }) => key === "org")?.value as string[]
		)[0].replace(/\\/g, "");
	}

	const name = jCard.find(({ key }) => key === "n");
	if (!name) throw new Error("Unable to get full name");
	return convertNameToFullName(name.value as string[]).replace(/\\/g, "");
}

function convertNameToFullName([
	familyName,
	givenName,
	additionalMiddleNames,
	honorificPrefixes,
	honorificSuffixes,
]: string[]) {
	return [
		honorificPrefixes,
		givenName,
		additionalMiddleNames,
		familyName,
		honorificSuffixes,
	]
		.filter((p) => !!p)
		.join(" ");
}
