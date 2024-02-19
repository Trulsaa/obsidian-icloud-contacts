import { ParsedVCard } from "./parser";

export function createFrontmatter(
	parsedVCards: ParsedVCard[],
	unShowedKeys: string[],
	fullName: string,
) {
	const contact = parsedVCards.reduce(
		(o, { key, value }, _i, parsedVCards) => {
			if (unShowedKeys.indexOf(key) > -1) return o;
			if (key === "org") {
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
			if (key === "tel") {
				const telephones = parsedVCards.filter(
					({ key }) => key === "tel",
				);
				return {
					...o,
					telephone: telephones.map((t) => t.value),
				};
			}
			if (key === "email") {
				const emails = parsedVCards.filter(
					({ key }) => key === "email",
				);
				return {
					...o,
					email: emails.map((t) => t.value),
				};
			}
			if (key === "adr") {
				const addresses = parsedVCards.filter(
					({ key }) => key === "adr",
				);
				return {
					...o,
					addresses: addresses.map((t) =>
						(t.value as string[]).filter((v) => !!v).join(", "),
					),
				};
			}
			if (key === "url") {
				const urls = parsedVCards.filter(({ key }) => key === "url");
				return {
					...o,
					url: urls.map((t) => t.value),
				};
			}
			if (key === "bday") return { ...o, birthday: value };
			if (key === "fn") return { ...o, name: value };
			return { ...o, [key]: value };
		},
		{ name: fullName },
	);
	return contact;
}
