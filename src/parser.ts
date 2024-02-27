import { parse as vcfParse } from "vcf";

export type ParsedVCard = {
	key: string;
	meta: { [key: string]: string | string[] };
	type: string;
	value: string | string[];
};

export function parseVCard(vcardString: string): ParsedVCard[] {
	const jCard = vcfParse(vcardString)[0].toJSON();

	return jCard[1].map((item) => {
		const key = item[0];
		let value = item[3];
		if (key === "org") value = (item[3] as string).split(";");
		return {
			key,
			meta: item[1],
			type: item[2],
			value,
		};
	});
}

export function getFullName(vCardString: string): string {
	const parsedVCard = parseVCard(vCardString);
	const fullName = parsedVCard.find(({ key }) => key === "fn");
	if (fullName && fullName.value) {
		return (fullName.value as string).replace(/\\/g, "");
	}

	const isOrg =
		parsedVCard.find(({ key }) => key === "xAbShowAs")?.value === "COMPANY";
	if (isOrg) {
		return (
			parsedVCard.find(({ key }) => key === "org")?.value as string[]
		)[0].replace(/\\/g, "");
	}

	const name = parsedVCard.find(({ key }) => key === "n");
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
