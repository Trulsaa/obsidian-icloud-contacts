import { requestUrl } from "obsidian";
import * as convert from "xml-js";
import { ElementCompact } from "xml-js";

type DAVObject = {
	data: string;
	etag: string;
	url: string;
};

type DAVDepth = "0" | "1" | "infinity";

type DAVResponse = {
	raw?: any;
	href?: string;
	status: number;
	statusText: string;
	ok: boolean;
	error?: { [key: string]: any };
	responsedescription?: string;
	props?: {
		[key: string]:
			| { status: number; statusText: string; ok: boolean; value: any }
			| any;
	};
};

type DAVVCard = DAVObject;
type DAVCalendarObject = DAVObject;

type DAVAddressBook = DAVCollection;
type DAVCalendar = {
	components?: string[];
	timezone?: string;
	projectedProps?: Record<string, unknown>;
} & DAVCollection;
type DAVCollection = {
	objects?: DAVObject[];
	ctag?: string;
	description?: string;
	displayName?: string | Record<string, unknown>;
	reports?: any;
	resourcetype?: any;
	syncToken?: string;
	url: string;
	// should only be used for smartCollectionSync
	fetchObjects?:
		| ((params?: {
				collection: DAVCalendar;
				headers?: Record<string, string>;
		  }) => Promise<DAVCalendarObject[]>)
		| ((params?: {
				collection: DAVAddressBook;
				headers?: Record<string, string>;
		  }) => Promise<DAVVCard[]>);
	objectMultiGet?: (params: {
		url: string;
		props: convert.ElementCompact;
		objectUrls: string[];
		filters?: convert.ElementCompact;
		timezone?: string;
		depth: DAVDepth;
		headers?: Record<string, string>;
	}) => Promise<DAVResponse[]>;
};

const DAVAttributeMap = {
	"urn:ietf:params:xml:ns:caldav": "xmlns:c",
	"urn:ietf:params:xml:ns:carddav": "xmlns:card",
	"http://calendarserver.org/ns/": "xmlns:cs",
	"http://apple.com/ns/ical/": "xmlns:ca",
	"DAV:": "xmlns:d",
};

const DAVNamespace = {
	CALENDAR_SERVER: "http://calendarserver.org/ns/",
	CALDAV_APPLE: "http://apple.com/ns/ical/",
	CALDAV: "urn:ietf:params:xml:ns:caldav",
	CARDDAV: "urn:ietf:params:xml:ns:carddav",
	DAV: "DAV:",
};

const DAVNamespaceShort = {
	CALDAV: "c",
	CARDDAV: "card",
	CALENDAR_SERVER: "cs",
	CALDAV_APPLE: "ca",
	DAV: "d",
};

const serverUrl = "https://contacts.icloud.com";
const accountType: "carddav" | "caldav" = "carddav";

export async function fetchContacts(username: string, password: string) {
	const authHeaders = {
		authorization: `Basic ${btoa(`${username}:${password}`)}`,
	};
	const { rootUrl, homeUrl } = await login(authHeaders);
	const addressBooks = await fetchAddressBooks(homeUrl, rootUrl, authHeaders);
	const vCards = await fetchVCards({
		addressBook: addressBooks[0],
		headers: authHeaders,
	});
	return vCards;
}

async function login(headers: { authorization: string }) {
	const rootUrl = await serviceDiscovery(headers);
	const principalUrl = await fetchPrincipalUrl(rootUrl, headers);
	const homeUrl = await fetchHomeUrl(rootUrl, principalUrl, headers);
	return { rootUrl, principalUrl, homeUrl };
}

const fetchVCards = async (params: {
	addressBook: DAVAddressBook;
	headers?: Record<string, string>;
	objectUrls?: string[];
	urlFilter?: (url: string) => boolean;
	useMultiGet?: boolean;
}): Promise<DAVVCard[]> => {
	const {
		addressBook,
		headers,
		objectUrls,
		urlFilter = (url) => url,
		useMultiGet = true,
	} = params;

	const vcardUrls = (
		objectUrls ??
		// fetch all objects of the calendar
		(
			await addressBookQuery({
				url: addressBook.url,
				props: { [`${DAVNamespaceShort.DAV}:getetag`]: {} },
				depth: "1",
				headers,
			})
		).map((res) => (res.ok ? res.href ?? "" : ""))
	)
		.map((url) =>
			url.startsWith("http") || !url
				? url
				: new URL(url, addressBook.url).href,
		)
		.filter(urlFilter)
		.map((url) => new URL(url).pathname);

	let vCardResults: DAVResponse[] = [];
	if (vcardUrls.length > 0) {
		if (useMultiGet) {
			vCardResults = await addressBookMultiGet({
				url: addressBook.url,
				props: {
					[`${DAVNamespaceShort.DAV}:getetag`]: {},
					[`${DAVNamespaceShort.CARDDAV}:address-data`]: {},
				},
				objectUrls: vcardUrls,
				depth: "1",
				headers,
			});
		} else {
			vCardResults = await addressBookQuery({
				url: addressBook.url,
				props: {
					[`${DAVNamespaceShort.DAV}:getetag`]: {},
					[`${DAVNamespaceShort.CARDDAV}:address-data`]: {},
				},
				depth: "1",
				headers,
			});
		}
	}

	return vCardResults.map((res) => ({
		url: new URL(res.href ?? "", addressBook.url).href,
		etag: res.props?.getetag,
		data: res.props?.addressData?._cdata ?? res.props?.addressData,
	}));
};

async function addressBookMultiGet(params: {
	url: string;
	props: ElementCompact;
	objectUrls: string[];
	depth: DAVDepth;
	headers?: Record<string, string>;
}): Promise<DAVResponse[]> {
	const { url, props, objectUrls, depth, headers } = params;
	return collectionQuery({
		url,
		body: {
			"addressbook-multiget": {
				_attributes: getDAVAttribute([
					DAVNamespace.DAV,
					DAVNamespace.CARDDAV,
				]),
				[`${DAVNamespaceShort.DAV}:prop`]: props,
				[`${DAVNamespaceShort.DAV}:href`]: objectUrls,
			},
		},
		defaultNamespace: DAVNamespaceShort.CARDDAV,
		depth,
		headers,
	});
}

async function addressBookQuery(params: {
	url: string;
	props: ElementCompact;
	filters?: ElementCompact;
	depth?: DAVDepth;
	headers?: Record<string, string>;
}): Promise<DAVResponse[]> {
	const { url, props, filters, depth, headers } = params;
	return collectionQuery({
		url,
		body: {
			"addressbook-query": {
				_attributes: getDAVAttribute([
					DAVNamespace.CARDDAV,
					DAVNamespace.DAV,
				]),
				[`${DAVNamespaceShort.DAV}:prop`]: props,
				filter: filters ?? {
					"prop-filter": {
						_attributes: {
							name: "FN",
						},
					},
				},
			},
		},
		defaultNamespace: DAVNamespaceShort.CARDDAV,
		depth,
		headers,
	});
}

async function collectionQuery(params: {
	url: string;
	body: any;
	depth?: DAVDepth;
	defaultNamespace?: any;
	headers?: Record<string, string>;
}): Promise<DAVResponse[]> {
	const {
		url,
		body,
		depth,
		defaultNamespace = DAVNamespaceShort.DAV,
		headers,
	} = params;
	const queryResults = await davRequest({
		url,
		init: {
			method: "REPORT",
			headers: cleanupFalsy({ depth, ...headers }),
			namespace: defaultNamespace,
			body,
		},
	});

	// empty query result
	if (queryResults.length === 1 && !queryResults[0].raw) {
		return [];
	}

	return queryResults;
}

async function fetchAddressBooks(
	homeUrl?: string,
	rootUrl?: string,
	headers?: Record<string, string>,
): Promise<DAVAddressBook[]> {
	const res = await propfind({
		url: homeUrl,
		props: {
			[`${DAVNamespaceShort.DAV}:displayname`]: {},
			[`${DAVNamespaceShort.CALENDAR_SERVER}:getctag`]: {},
			[`${DAVNamespaceShort.DAV}:resourcetype`]: {},
			[`${DAVNamespaceShort.DAV}:sync-token`]: {},
		},
		depth: "1",
		headers,
	});

	return Promise.all(
		res
			.filter((r: any) =>
				Object.keys(r.props?.resourcetype ?? {}).includes(
					"addressbook",
				),
			)
			.map((rs: any) => {
				const displayName =
					rs.props?.displayname?._cdata ?? rs.props?.displayname;
				return {
					url: new URL(rs.href ?? "", rootUrl ?? "").href,
					ctag: rs.props?.getctag,
					displayName:
						typeof displayName === "string" ? displayName : "",
					resourcetype: Object.keys(rs.props?.resourcetype),
					syncToken: rs.props?.syncToken,
				};
			})
			.map(async (addr: any) => ({
				...addr,
				reports: await supportedReportSet({
					collection: addr,
					headers,
				}),
			})),
	);
}

async function serviceDiscovery(headers: { authorization: string }) {
	const endpoint = new URL(serverUrl);
	const uri = new URL(`/.well-known/${accountType}`, endpoint);
	try {
		const response = await requestUrl({
			url: uri.href,
			headers,
			method: "PROPFIND",
		});
		if (response.status >= 300 && response.status < 400) {
			// http redirect.
			const location = response.headers.Location;
			if (typeof location === "string" && location.length) {
				const serviceURL = new URL(location, endpoint);
				if (
					serviceURL.hostname === uri.hostname &&
					uri.port &&
					!serviceURL.port
				) {
					serviceURL.port = uri.port;
				}
				serviceURL.protocol =
					endpoint.protocol !== null && endpoint.protocol !== void 0
						? endpoint.protocol
						: "http";
				return serviceURL.href;
			}
		}
	} catch (error) {
		console.error(error);
	}
	return endpoint.href;
}

async function fetchPrincipalUrl(
	rootUrl: string,
	headers: { authorization: string },
): Promise<string> {
	const [response] = await propfind({
		url: rootUrl,
		props: {
			[`${DAVNamespaceShort.DAV}:current-user-principal`]: {},
		},
		depth: "0",
		headers,
	});
	if (!response.ok) {
		if (response.status === 401) {
			throw new Error("Invalid credentials");
		}
	}
	return new URL(response.props?.currentUserPrincipal?.href ?? "", rootUrl)
		.href;
}

async function fetchHomeUrl(
	rootUrl: string,
	principalUrl: string,
	headers: { authorization: string },
): Promise<string> {
	const responses = await propfind({
		url: principalUrl,
		props: {
			[`${DAVNamespaceShort.CARDDAV}:addressbook-home-set`]: {},
		},
		depth: "0",
		headers,
	});

	const matched = responses.find((r: any) =>
		urlContains(principalUrl, r.href),
	);
	if (!matched || !matched.ok) {
		throw new Error("cannot find homeUrl");
	}

	return new URL(matched?.props?.addressbookHomeSet.href, rootUrl).href;
}

async function propfind(params: any) {
	const { url, props, depth, headers } = params;
	return davRequest({
		url,
		init: {
			method: "PROPFIND",
			headers: cleanupFalsy(Object.assign({ depth }, headers)),
			namespace: DAVNamespaceShort.DAV,
			body: {
				propfind: {
					_attributes: getDAVAttribute([
						DAVNamespace.CALDAV,
						DAVNamespace.CALDAV_APPLE,
						DAVNamespace.CALENDAR_SERVER,
						DAVNamespace.CARDDAV,
						DAVNamespace.DAV,
					]),
					prop: props,
				},
			},
		},
	});
}

function cleanupFalsy(obj: any) {
	return Object.entries(obj).reduce((prev, [key, value]) => {
		if (value)
			return Object.assign(Object.assign({}, prev), { [key]: value });
		return prev;
	}, {});
}

function getDAVAttribute(nsArr: any) {
	return nsArr.reduce(
		(prev: any, curr: any) =>
			Object.assign(Object.assign({}, prev), {
				//@ts-ignore
				[DAVAttributeMap[curr]]: curr,
			}),
		{},
	);
}

async function davRequest(params: any): Promise<DAVResponse[]> {
	const { url, init, convertIncoming = true, parseOutgoing = true } = params;
	const { headers = {}, body, namespace, method, attributes } = init;
	const xmlBody = convertIncoming
		? convert.js2xml(
				{
					_declaration: {
						_attributes: { version: "1.0", encoding: "utf-8" },
					},
					...body,
					_attributes: attributes,
				},
				{
					compact: true,
					spaces: 2,
					elementNameFn: (name) => {
						// add namespace to all keys without namespace
						if (namespace && !/^.+:.+/.test(name)) {
							return `${namespace}:${name}`;
						}
						return name;
					},
				},
			)
		: body;

	const davResponse = await requestUrl({
		url,
		headers: Object.assign(
			{ "Content-Type": "text/xml;charset=UTF-8" },
			cleanupFalsy(headers),
		),
		body: xmlBody,
		method,
	});

	const resText = davResponse.text;

	const result: any = convert.xml2js(resText, {
		compact: true,
		trim: true,
		textFn: (value: any, parentElement: any) => {
			try {
				// This is needed for xml-js design reasons
				// eslint-disable-next-line no-underscore-dangle
				const parentOfParent = parentElement._parent;
				const pOpKeys = Object.keys(parentOfParent);
				const keyNo = pOpKeys.length;
				const keyName = pOpKeys[keyNo - 1];
				const arrOfKey = parentOfParent[keyName];
				const arrOfKeyLen = arrOfKey.length;
				if (arrOfKeyLen > 0) {
					const arr = arrOfKey;
					const arrIndex = arrOfKey.length - 1;
					arr[arrIndex] = nativeType(value);
				} else {
					parentOfParent[keyName] = nativeType(value);
				}
			} catch (e) {
				console.error(e);
			}
		},
		// remove namespace & camelCase
		elementNameFn: (attributeName) =>
			camelCase(attributeName.replace(/^.+:/, "")),
		attributesFn: (value: any) => {
			const newVal = { ...value };
			delete newVal.xmlns;
			return newVal;
		},
		ignoreDeclaration: true,
	});

	const responseBodies = Array.isArray(result.multistatus.response)
		? result.multistatus.response
		: [result.multistatus.response];

	return responseBodies.map((responseBody: any) => {
		const statusRegex = /^\S+\s(?<status>\d+)\s(?<statusText>.+)$/;
		if (!responseBody) {
			return {
				status: davResponse.status,
				statusText: davResponse.text,
				ok: davResponse.status >= 200 && davResponse.status < 300,
			};
		}

		const matchArr = statusRegex.exec(responseBody.status);

		return {
			raw: result,
			href: responseBody.href,
			status: matchArr?.groups
				? Number.parseInt(matchArr?.groups.status, 10)
				: davResponse.status,
			statusText: matchArr?.groups?.statusText ?? davResponse.text,
			ok: !responseBody.error,
			error: responseBody.error,
			responsedescription: responseBody.responsedescription,
			props: (Array.isArray(responseBody.propstat)
				? responseBody.propstat
				: [responseBody.propstat]
			).reduce((prev: any, curr: any) => {
				return {
					...prev,
					...curr?.prop,
				};
			}, {}),
		};
	});
}

function nativeType(value: any) {
	const nValue = Number(value);
	if (!Number.isNaN(nValue)) {
		return nValue;
	}
	const bValue = value.toLowerCase();
	if (bValue === "true") {
		return true;
	}
	if (bValue === "false") {
		return false;
	}
	return value;
}

function camelCase(str: string) {
	return str.replace(/([-_]\w)/g, (g) => g[1].toUpperCase());
}

function urlContains(urlA: string, urlB: string) {
	if (!urlA && !urlB) {
		return true;
	}
	if (!urlA || !urlB) {
		return false;
	}
	const trimmedUrlA = urlA.trim();
	const trimmedUrlB = urlB.trim();
	const strippedUrlA =
		trimmedUrlA.slice(-1) === "/" ? trimmedUrlA.slice(0, -1) : trimmedUrlA;
	const strippedUrlB =
		trimmedUrlB.slice(-1) === "/" ? trimmedUrlB.slice(0, -1) : trimmedUrlB;
	return urlA.includes(strippedUrlB) || urlB.includes(strippedUrlA);
}

async function supportedReportSet(params: {
	collection: DAVCollection;
	headers?: Record<string, string>;
}): Promise<string[]> {
	const { collection, headers } = params;
	const res = await propfind({
		url: collection.url,
		props: {
			[`${DAVNamespaceShort.DAV}:supported-report-set`]: {},
		},
		depth: "0",
		headers,
	});
	return (
		res[0]?.props?.supportedReportSet?.supportedReport?.map(
			(sr: { report: any }) => Object.keys(sr.report)[0],
		) ?? []
	);
}

