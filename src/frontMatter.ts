import { VCards } from "./VCards";

export function createFrontmatter(
	parsedVCards: VCards[],
	fullName: string,
	{
		telLabels,
		emailLabels,
		urlLabels,
		relatedLabels,
		excludedKeys,
	}: {
		telLabels: boolean;
		emailLabels: boolean;
		urlLabels: boolean;
		relatedLabels: boolean;
		excludedKeys: string;
	},
) {
	const labels = parsedVCards.filter(({ key }) => key === "xAbLabel");
	const contact = parsedVCards.reduce(
		(o, { key, value, meta }) => {
			if (excludedKeys.split(/\s+/).indexOf(key) > -1) return o;
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
			if (key === "adr") return addAddresses(value, o);
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
						value,
						relatedLabels && label ? label : undefined,
					),
					o,
				);
			if (key === "impp")
				return addValueToArray(
					"instant message",
					`${meta.xServiceType}: ${value
						.replace("xmpp:", "")
						.replace("x-apple:", "")}`,
					o,
				);
			if (key === "xSocialprofile")
				return addValueToArray(
					"social profile",
					`${
						meta.type ? `${capitalize(meta.type)}: ` : ""
					}${stripSocialValue(value)}`,
					o,
				);
			if (key === "xAbdate")
				return addValueToArray(
					"date",
					label ? `${label}: ${value}` : value,
					o,
				);

			if (key === "bday") return { ...o, birthday: value };
			return { ...o, [key]: value };
		},
		{ name: fullName },
	);
	return contact as { [key: string]: string | string[] };
}

function stripSocialValue(value: string) {
	const toRemove = ["x-apple:", "xmpp:"];
	// romove all of the above from value
	return toRemove.reduce(
		(value, searchValue) => value.replace(searchValue, ""),
		value,
	);
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
	parsedVCards: VCards[],
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
				key === "xAbLabel" && meta.group === parsedVCardMeta.group,
		);
		if (!xAbLabel) return;
		const value = xAbLabel.value as string;
		return value.replace("_$!<", "").replace(">!$_", "");
	}

	const type = parsedVCardMeta.type;
	if (Array.isArray(type)) return type.find(isLabel);
	if (!isLabel(type)) return;
	return type;
}

function isLabel(label: string) {
	return ["cell", "voice", "pref", "internet"].indexOf(label) === -1;
}

function capitalize(str: string) {
	if (str === "iphone") return "iPhone";
	return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}
