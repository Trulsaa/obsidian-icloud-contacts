import { parse as vcfParse } from "vcf";

export type JCard = {
	key: string;
	meta: { [key: string]: string | string[] };
	type: string;
	value: string | string[];
}[];

export function parseVCardToJCardAndFullName(vcardString: string): {
	jCard: JCard;
	fullName: string;
} {
	const jCard = parseVCardToJCard(vcardString);
	return {
		jCard,
		fullName: getFullName(jCard),
	};
}

export function parseVCardToJCard(vcardString: string): JCard {
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

export function getFullNameFromVCard(vcardString: string): string {
	return getFullName(parseVCardToJCard(vcardString));
}

function getFullName(jCard: JCard): string {
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
