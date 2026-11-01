export type XmlElement = { [key: string]: any };

const XML_DECLARATION = '<?xml version="1.0" encoding="utf-8"?>';
const INDENT = "  ";

function escapeText(text: string): string {
	return text
		.replace(/&amp;/g, "&")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

function escapeAttribute(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/"/g, "&quot;");
}

function writeAttributes(attributes: XmlElement | undefined): string {
	if (!attributes) return "";
	return Object.entries(attributes)
		.filter(([, value]) => value !== null && value !== undefined)
		.map(([name, value]) => ` ${name}="${escapeAttribute(`${value}`)}"`)
		.join("");
}

function writeElement(
	name: string,
	value: unknown,
	depth: number,
	namespace?: string,
): string {
	const tag =
		namespace && !/^.+:.+/.test(name) ? `${namespace}:${name}` : name;

	if (value === undefined || value === null || value === "") {
		return `<${tag}/>`;
	}
	if (typeof value !== "object") {
		return `<${tag}>${escapeText(`${value}`)}</${tag}>`;
	}

	const element = value as XmlElement;
	const attributes = writeAttributes(element._attributes);
	const children = Object.entries(element).filter(
		([key]) => key !== "_attributes",
	);
	if (children.length === 0) return `<${tag}${attributes}/>`;

	const childIndent = `\n${INDENT.repeat(depth + 1)}`;
	const content = children
		.flatMap(([key, child]) =>
			(Array.isArray(child) ? child : [child]).map(
				(node) =>
					childIndent + writeElement(key, node, depth + 1, namespace),
			),
		)
		.join("");
	return `<${tag}${attributes}>${content}\n${INDENT.repeat(depth)}</${tag}>`;
}

/**
 * Serializes an object on the form `{ rootName: { _attributes: {...}, child: {...} } }`
 * to XML. Names without a namespace prefix get `namespace` as prefix.
 */
export function buildXml(body: XmlElement, namespace?: string): string {
	return (
		XML_DECLARATION +
		Object.entries(body)
			.map(([name, value]) => `\n${writeElement(name, value, 0, namespace)}`)
			.join("")
	);
}

const XML_ENTITIES: { [name: string]: string } = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
};

function decodeEntities(text: string): string {
	return text.replace(/&(#x[0-9a-f]+|#[0-9]+|\w+);/gi, (match, entity) => {
		if (entity[0] !== "#") return XML_ENTITIES[entity] ?? match;
		const codePoint =
			entity[1].toLowerCase() === "x"
				? parseInt(entity.slice(2), 16)
				: parseInt(entity.slice(1), 10);
		try {
			return String.fromCodePoint(codePoint);
		} catch {
			return match;
		}
	});
}

function camelCase(str: string): string {
	return str.replace(/([-_]\w)/g, (g) => g[1].toUpperCase());
}

function nativeType(value: string): string | number | boolean {
	const numberValue = Number(value);
	if (!Number.isNaN(numberValue)) return numberValue;
	const lowerCased = value.toLowerCase();
	if (lowerCased === "true") return true;
	if (lowerCased === "false") return false;
	return value;
}

// 1: CDATA, 2: closing tag, 3: opening tag name, 4: attributes, 5: self-closing, 6: text
const XML_TOKEN =
	/<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<![^>]*>|<\/\s*([^\s>]+)\s*>|<([^\s/>!?][^\s/>]*)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/y;
const XML_ATTRIBUTE = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

type OpenElement = {
	name: string;
	element: XmlElement;
	container: XmlElement;
	key: string;
	text?: string;
};

function parseAttributes(rawAttributes: string): XmlElement | undefined {
	const attributes: XmlElement = {};
	for (const match of rawAttributes.matchAll(XML_ATTRIBUTE)) {
		if (match[1] === "xmlns") continue;
		attributes[match[1]] = decodeEntities(match[2] ?? match[3]).trim();
	}
	return Object.keys(attributes).length > 0 ? attributes : undefined;
}

function addChild(container: XmlElement, key: string, child: unknown) {
	if (!(key in container)) container[key] = child;
	else if (Array.isArray(container[key])) container[key].push(child);
	else container[key] = [container[key], child];
}

/**
 * Parses an XML document to a compact object structure:
 * - namespace prefixes are removed and names are camelCased (`d:address-data` -> `addressData`)
 * - repeated elements become arrays
 * - elements with text content are replaced by the text, converted to number/boolean when possible
 * - CDATA is stored in `_cdata` and attributes in `_attributes`
 */
export function parseXml(xml: string): XmlElement {
	const result: XmlElement = {};
	const stack: OpenElement[] = [];
	XML_TOKEN.lastIndex = 0;

	while (XML_TOKEN.lastIndex < xml.length) {
		const position = XML_TOKEN.lastIndex;
		const token = XML_TOKEN.exec(xml);
		if (!token) {
			throw new SyntaxError(`Invalid XML at position ${position}`);
		}
		const [, cdata, closingName, openingName, rawAttributes, selfClosing, text] =
			token;
		const current = stack[stack.length - 1];

		if (text !== undefined) {
			const trimmed = decodeEntities(text).trim();
			if (!trimmed) continue;
			if (!current) {
				throw new SyntaxError("Text data outside of root element");
			}
			current.text = (current.text ?? "") + trimmed;
		} else if (cdata !== undefined) {
			if (!current) {
				throw new SyntaxError("CDATA outside of root element");
			}
			addChild(current.element, "_cdata", cdata.trim());
		} else if (openingName !== undefined) {
			const element: XmlElement = {};
			const attributes = parseAttributes(rawAttributes);
			if (attributes) element._attributes = attributes;

			const container = current ? current.element : result;
			const key = camelCase(openingName.replace(/^.+:/, ""));
			addChild(container, key, element);
			if (!selfClosing) {
				stack.push({ name: openingName, element, container, key });
			}
		} else if (closingName !== undefined) {
			if (!current || current.name !== closingName) {
				throw new SyntaxError(
					`Unexpected closing tag "${closingName}"`,
				);
			}
			stack.pop();
			if (current.text !== undefined) {
				const value = nativeType(current.text);
				const siblings = current.container[current.key];
				if (Array.isArray(siblings)) {
					siblings[siblings.lastIndexOf(current.element)] = value;
				} else {
					current.container[current.key] = value;
				}
			}
		}
	}

	if (stack.length > 0) {
		throw new SyntaxError(`Unclosed element "${stack[0].name}"`);
	}
	return result;
}
