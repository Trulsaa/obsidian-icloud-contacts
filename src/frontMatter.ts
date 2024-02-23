import { ParsedVCard } from "./parser";

export function createFrontmatter(
	parsedVCards: ParsedVCard[],
	unShowedKeys: string[],
	fullName: string,
	{
		telLabels,
		emailLabels,
		urlLabels,
		relatedLabels,
	}: {
		telLabels: boolean;
		emailLabels: boolean;
		urlLabels: boolean;
		relatedLabels: boolean;
	},
) {
	const labels = parsedVCards.filter(({ key }) => key === "xAbLabel");
	const contact = parsedVCards.reduce(
		(o, { key, value, meta }) => {
			if (unShowedKeys.indexOf(key) > -1) return o;
			if (key === "fn") return o;
			if (key === "org") return addOrganizationAndDepartement(value, o);

			const rawLabel = getLabel(meta, labels);
			const label = rawLabel ? capitalize(rawLabel) : undefined;
			if (key === "tel")
				return addValueToArray(
					"telephone",
					telLabels && label ? `${label}: ${value}` : value,
					o,
				);
			if (key === "email")
				return addValueToArray(
					"email",
					emailLabels && label ? `${label}: ${value}` : value,
					o,
				);
			if (key === "adr") return addAddresses(value as string[], o);
			if (key === "url")
				return addValueToArray(
					"url",
					urlLabels && label ? `${label}: ${value}` : value,
					o,
				);
			if (key === "xAbrelatednames")
				return addValueToArray(
					"related names",
					wrapInBrackets(
						value as string,
						relatedLabels && label ? label : undefined,
					),
					o,
				);
			if (key === "bday") return { ...o, birthday: value };
			return { ...o, [key]: value };
		},
		{ name: fullName },
	);
	return contact;
}

function addAddresses(
	value: string[],
	o: { name: string; addresses?: string[] },
) {
	const address = value.filter((v) => !!v).join(", ");
	if (Array.isArray(o.addresses))
		return { ...o, addresses: [...o.addresses!, address] };
	return {
		...o,
		addresses: [address],
	};
}

function wrapInBrackets(value: string, label?: string) {
	return label ? `[[${value}|${label}: ${value}]]` : `[[${value}]]`;
}

function addValueToArray(
	key: string,
	value: string[] | string,
	o: { [key: string]: string[] | string | undefined },
) {
	if (Array.isArray(o[key])) return { ...o, [key]: [...o[key]!, value] };

	return {
		...o,
		[key]: [value],
	};
}

function addOrganizationAndDepartement(
	value: string | string[],
	o: { [key: string]: string },
): {
	[key: string]: string | undefined;
	organization?: string;
	departement?: string;
} {
	const organization = (value as string[])[0];
	const departement = (value as string[])[1];
	let newO: any = o;
	if (organization) {
		newO = {
			...newO,
			organization,
		};
	}
	if (departement) {
		newO = {
			...newO,
			departement,
		};
	}
	return newO;
}

function getLabel(
	parsedVCardMeta: { [key: string]: string | string[] },
	parsedVCards: ParsedVCard[],
): string | undefined {
	if (
		!parsedVCardMeta.group &&
		!Array.isArray(parsedVCardMeta.type) &&
		!parsedVCardMeta.type
	) {
		return;
	}

	if (parsedVCardMeta.group) {
		const xAbLabel = parsedVCards.find(
			({ key, meta }) =>
				meta.group === parsedVCardMeta.group && key === "xAbLabel",
		);
		if (!xAbLabel) return;
		const value = xAbLabel.value as string;
		return value.replace("_$!<", "").replace(">!$_", "");
	}

	const type = parsedVCardMeta.type;
	if (Array.isArray(type))
		return type.find(
			(t) => ["cell", "voice", "pref", "internet"].indexOf(t) === -1,
		);
	return type;
}

function capitalize(str: string) {
	if (str === "iphone") return "iPhone";
	return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}
