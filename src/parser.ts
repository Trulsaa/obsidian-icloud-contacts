import { parse as vcfParse } from "vcf";

export function parseVCard(vcardString: string) {
	const jCard = vcfParse(vcardString)[0].toJSON();

	return jCard[1].reduce<{ [key: string]: any }>((o, item) => {
		const key = item[0];
		const jCardValue = item[3];
		const value = Array.isArray(jCardValue)
			? jCardValue.filter((item) => !!item).join(", ")
			: jCardValue;

		if (o[key] && Array.isArray(o[key]))
			return { ...o, [key]: [...o[key], value] };
		if (o[key]) return { ...o, [key]: [o[key], value] };
		return { ...o, [key]: value };
	}, {});
}
