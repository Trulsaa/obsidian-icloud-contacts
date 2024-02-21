import { ParsedVCard } from "./parser";

export function createFrontmatter(
	parsedVCards: ParsedVCard[],
	unShowedKeys: string[],
	fullName: string,
	settings: { addLabels: boolean },
) {
	const labels = parsedVCards.filter(({ key }) => key === "xAbLabel");
	const contact = parsedVCards.reduce(
		(o, { key, value, meta }) => {
			if (unShowedKeys.indexOf(key) > -1) return o;
			if (key === "fn") return o;
			if (key === "org") return addOrganizationAndDepartement(value, o);

			const label = settings.addLabels
				? getLabel(meta, labels)
				: undefined;
			if (key === "tel")
				return addValueWithLabelToArray("telephone", value, o, label);
			if (key === "email")
				return addValueWithLabelToArray("email", value, o, label);
			if (key === "adr") return addAddresses(value as string[], o);
			if (key === "url")
				return addValueWithLabelToArray("url", value, o, label);
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

function addValueWithLabelToArray(
	key: string,
	value: string[] | string,
	o: { [key: string]: string[] | string | undefined },
	label?: string,
) {
	const valueWithOptionalLabel = label ? `${label}: ${value}` : value;
	if (Array.isArray(o[key]))
		return { ...o, [key]: [...o[key]!, valueWithOptionalLabel] };

	return {
		...o,
		[key]: [valueWithOptionalLabel],
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
	if (!parsedVCardMeta.group && !Array.isArray(parsedVCardMeta.type)) {
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

	const type = parsedVCardMeta.type as string[];
	return type.find(
		(t) => ["cell", "voice", "pref", "internet"].indexOf(t) === -1,
	);
}
