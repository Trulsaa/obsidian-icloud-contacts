import { parseVCardToJCard } from "./parser";

export type PhotoSource = { url: string } | { base64: string };

export function getPhotoSource(vCardData: string): PhotoSource | undefined {
	const photo = parseVCardToJCard(vCardData).find(({ key }) => key === "photo");
	if (!photo || typeof photo.value !== "string") return undefined;

	const value = photo.value.trim();
	// iCloud sometimes drops the line break after PHOTO, gluing the next property
	// (e.g. X-SHARED-PHOTO-DISPLAY-PREF:AUTOUPDATE) onto the url.
	if (/^https?:\/\//i.test(value))
		return { url: value.replace(/(?:X|VND)-[A-Z0-9-]+:.*$/, "") };

	if (/^data:/i.test(value)) {
		const base64 = value.slice(value.indexOf(",") + 1);
		return base64 ? { base64 } : undefined;
	}

	const encoding = String(photo.meta.encoding ?? "").toLowerCase();
	if (encoding === "b" || encoding === "base64") return { base64: value };

	return undefined;
}

export function isSamePhotoSource(
	a: PhotoSource | undefined,
	b: PhotoSource | undefined,
): boolean {
	if (!a || !b) return false;
	if ("url" in a && "url" in b) return a.url === b.url;
	if ("base64" in a && "base64" in b) return a.base64 === b.base64;
	return false;
}

// The photo URL comes from server data, so the app password is only sent to
// https hosts that share the registrable domain of the configured iCloud server.
export function isTrustedPhotoUrl(photoUrl: string, serverUrl: string): boolean {
	try {
		const photo = new URL(photoUrl);
		const server = new URL(serverUrl);
		if (photo.protocol !== "https:") return false;
		const domain = server.hostname.split(".").slice(1).join(".");
		return (
			photo.hostname === server.hostname ||
			(!!domain && photo.hostname.endsWith("." + domain))
		);
	} catch {
		return false;
	}
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
	const binary = atob(base64.replace(/\s/g, ""));
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes.buffer;
}

export function detectImageExtension(data: ArrayBuffer): string | undefined {
	const b = new Uint8Array(data.slice(0, 16));
	const ascii = (from: number, to: number) =>
		String.fromCharCode(...b.slice(from, to));

	if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
	if (b[0] === 0x89 && ascii(1, 4) === "PNG") return "png";
	if (ascii(0, 3) === "GIF") return "gif";
	if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
	if (ascii(4, 8) === "ftyp" && /^(heic|heix|mif1|msf1)/.test(ascii(8, 12)))
		return "heic";
	return undefined;
}

export function getPhotoBaseName(vCardData: string, vCardUrl: string): string {
	const uid = parseVCardToJCard(vCardData).find(({ key }) => key === "uid");
	const raw =
		typeof uid?.value === "string" && uid.value
			? uid.value
			: (vCardUrl.split("/").pop() ?? "").replace(/\.vcf$/i, "");
	return raw.replace(/[^\w.-]/g, "_");
}

export function photoPathFromLink(link: unknown): string | undefined {
	if (typeof link !== "string") return undefined;
	return /^\[\[(.*)\]\]$/.exec(link)?.[1];
}

export function escapeRegExp(value: string) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Only touches the one `![[photo]]` line the plugin owns. Everything else in the
// file, including text the user writes under the photo, is left as it is.
export function updatePhotoEmbed(
	data: string,
	options: {
		previousPath?: string;
		path?: string;
		insertIfMissing: boolean;
		heading?: string;
	},
): string {
	const { previousPath, path, insertIfMissing, heading } = options;
	const known = [previousPath, path].filter((p): p is string => !!p);

	if (known.length > 0) {
		const existing = new RegExp(
			`^(!\\[\\[(?:${known.map(escapeRegExp).join("|")})((?:\\|[^\\]]*)?)\\]\\])[ \\t]*(\\r?\\n)?`,
			"m",
		);
		const match = existing.exec(data);
		if (match) {
			const end = match.index + match[0].length;
			if (!path) return data.slice(0, match.index) + data.slice(end);
			const embed = `![[${path}${match[2]}]]${match[0].slice(match[1].length)}`;
			return data.slice(0, match.index) + embed + data.slice(end);
		}
	}

	if (!path || !insertIfMissing) return data;

	const embed = `![[${path}]]`;
	const frontmatter = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/.exec(data);
	const bodyStart = frontmatter ? frontmatter[0].length : 0;

	if (heading) {
		const headingLine = new RegExp(`^# ${escapeRegExp(heading)}[ \\t]*$`, "m");
		const body = data.slice(bodyStart);
		const match = headingLine.exec(body);
		if (match) {
			const at = bodyStart + match.index + match[0].length;
			const rest = data.slice(at);
			return `${data.slice(0, at)}\n\n${embed}${rest === "" ? "\n" : rest}`;
		}
	}

	const rest = data.slice(bodyStart);
	return `${data.slice(0, bodyStart)}${embed}\n${rest === "" ? "" : "\n"}${rest}`;
}
