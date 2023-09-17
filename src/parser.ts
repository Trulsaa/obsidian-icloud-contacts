import { parse as vcfParse } from "vcf";

export function parseVCard(vcardString: string) {
	const jCard = vcfParse(vcardString)[0].toJSON();
	console.log(JSON.stringify(jCard, null, 2));

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
