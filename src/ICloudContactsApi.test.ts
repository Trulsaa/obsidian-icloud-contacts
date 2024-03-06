import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import ICloudContactsApi, {
	CachedMetadata,
	ICloudVCard,
} from "./ICloudContactsApi";
import { ICloudContactsSettings } from "./SettingTab";

const testVCard = {
	url: "https://contacts.icloud.com/123456789/carddavhome/card/MGVmYzgxOWEtNTM2YS00ZDc3LTgwNzAtNzMzZWJmMTJiNDlj.vcf",
	etag: '"lt1gqtev"',
	data: "BEGIN:VCARD\r\nVERSION:3.0\r\nPRODID:-//Apple Inc.//macOS 14.2.1//EN\r\nN:Nordmann;Test;;;\r\nFN:Test Nordmann\r\nEMAIL;type=INTERNET;type=HOME;type=pref:test@test.test\r\nTEL;type=pref:87654321\r\nX-ADDRESSING-GRAMMAR;type=pref:nk4spnSLebY1Z7hrtGsE+SiKxtfLA9NCl1ppo++yLQXR\r\n dTzQ1rMPcvZSSz8zcfqqEZ7obWbUmqx3AwTv9El8RwO0sd7JC5PtBU/Xo1sAoQHgxyDHqt9HyYt\r\n MsKQp0G9VRTrBwwvR5NKS5tyy0Q8onhMKCgtjNyCscF5gLFWzR7lRW2lWgKqXLA19oo9JctO2VN\r\n IfhnIFGqNeuDs1SU/MR0hAVU2NVaepvH3AYoTEW89tI3XftBCF7e6/stnlXH/JKnvBnRabdtYsL\r\n BO+C/VAHzVByPaFUXKgAMXKP9nSR2NKnYzsCI+xUV71lYPSWx0NXGvTSh9oc3Gj59cDCnXz1FG1\r\n 35ElmHJ682AQ7dP7t5O0smvGOjn2+zBF9q15vfsfHEmYm9qnBfGilZ+J4DrNZuSASqo=\r\nREV:2024-02-28T22:04:34Z\r\nUID:0efc819a-536a-4d77-8070-733ebf12b49c\r\nEND:VCARD",
};

const mockObsidianApi = {
	normalizePath: jest.fn<(path: string) => string>((path: string) => path),
	app: {
		fileManager: {
			processFrontMatter:
				jest.fn<
					(
						file: any,
						fn: (frontmatter: any) => void,
						options?: any,
					) => Promise<void>
				>(),
			renameFile:
				jest.fn<(file: any, newPath: string) => Promise<void>>(),
		},
		vault: {
			adapter: {
				list: jest.fn<
					(
						normalizedPath: string,
					) => Promise<{ files: string[]; folders: string[] }>
				>(async (normalizedPath: string) => mockListedFiles),
				write: jest.fn<
					(
						normalizedPath: string,
						data: string,
						options?: any,
					) => Promise<void>
				>(),
			},
			append: jest.fn<
				(file: any, data: string, options?: any) => Promise<void>
			>(),
			create: jest.fn<
				(path: string, data: string, options?: any) => Promise<any>
			>(),
			createFolder: jest.fn<(path: string) => Promise<any>>(),
			getAbstractFileByPath: jest.fn<(path: string) => any>(),
			getFileByPath: jest.fn<(path: string) => any>(
				(_path: string) => "TFile",
			),
			getFolderByPath: jest.fn<(path: string) => any>(),
			process:
				jest.fn<
					(
						file: any,
						fn: (data: string) => string,
						options?: any,
					) => Promise<string>
				>(),
		},
		workspace: {
			getLeaf: () => ({
				openFile:
					jest.fn<(file: any, openState?: any) => Promise<void>>(),
			}),
		},
		metadataCache: {
			getCache: jest.fn<(path: string) => CachedMetadata | null>(),
		},
	},
};

const mockNotice = {
	setMessage: jest.fn(),
	hide: jest.fn(),
};

const mockNoticeShower = jest
	.fn<
		(message: string) => {
			setMessage: (message: string) => void;
			hide: () => void;
		}
	>()
	.mockReturnValue(mockNotice);

export class MockNotice {
	constructor(_message: string | DocumentFragment, _duration?: number) {}
	setMessage(_message: string | DocumentFragment) {
		return this;
	}
	hide() {}
}

const mockFetchContacts =
	jest.fn<(username: string, password: string) => Promise<ICloudVCard[]>>();

const MOCK_DEFAULT_SETTINGS: ICloudContactsSettings = {
	username: "username",
	password: "password",
	folder: "Contacts",
	telLabels: false,
	emailLabels: false,
	urlLabels: false,
	relatedLabels: false,
	excludedKeys:
		"n photo prodid rev uid version xAbadr xAbLabel xAblabel xAbShowAs xImagehash xImagetype xSharedPhotoDisplayPref xAddressingGrammar xAppleSubadministrativearea xAppleSublocality",
	settingsChanged: false,
	previousUpdateSettings: {
		username: "username",
		password: "password",
		folder: "Contacts",
		telLabels: false,
		emailLabels: false,
		urlLabels: false,
		relatedLabels: false,
		excludedKeys:
			"n photo prodid rev uid version xAbadr xAbLabel xAblabel xAbShowAs xImagehash xImagetype xSharedPhotoDisplayPref xAddressingGrammar xAppleSubadministrativearea xAppleSublocality",
		settingsChanged: false,
		previousUpdateSettings: undefined,
		previousUpdateData: [],
	},
	previousUpdateData: [],
};

const mockListedFiles = {
	files: [],
	folders: [],
};

describe("updateContacts", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	test("Should handle no files of iCloudVCards", () => {
		mockFetchContacts.mockResolvedValueOnce([]);
		mockObsidianApi.app.vault.adapter.list.mockResolvedValueOnce(
			mockListedFiles,
		);

		const api = new ICloudContactsApi(
			mockObsidianApi,
			MOCK_DEFAULT_SETTINGS,
			mockFetchContacts,
			mockNoticeShower,
		);
		expect(api.updateContacts()).resolves.toBeUndefined();
	});

	test("Should write error to error file if fetchContacts rejects", async () => {
		mockFetchContacts.mockRejectedValueOnce(new Error("error"));
		mockObsidianApi.app.vault.getFileByPath.mockReturnValueOnce(
			"errorFile",
		);
		mockObsidianApi.app.vault.adapter.list.mockResolvedValueOnce(
			mockListedFiles,
		);

		const api = new ICloudContactsApi(
			mockObsidianApi,
			MOCK_DEFAULT_SETTINGS,
			mockFetchContacts,
			mockNoticeShower,
		);
		await api.updateContacts();
		expect(mockObsidianApi.app.vault.append).toHaveBeenCalledWith(
			"errorFile",
			expect.stringContaining("error"),
		);
	});

	test("Should create a contact file based on a VCard", async () => {
		const mockFrontMatter = {};
		mockObsidianApi.app.fileManager.processFrontMatter.mockImplementationOnce(
			async (_file: any, fn: any) => {
				fn(mockFrontMatter);
			},
		);
		mockFetchContacts.mockResolvedValueOnce([testVCard]);

		const api = new ICloudContactsApi(
			mockObsidianApi,
			MOCK_DEFAULT_SETTINGS,
			mockFetchContacts,
			mockNoticeShower,
		);

		await api.updateContacts();
		expect(mockObsidianApi.app.vault.create).toHaveBeenCalledTimes(1);
		expect(mockObsidianApi.app.vault.create).toHaveBeenCalledWith(
			"Contacts/Test Nordmann.md",
			"# Test Nordmann",
		);
		expect(mockFrontMatter).toEqual({
			name: "Test Nordmann",
			email: ["test@test.test"],
			telephone: ["87654321"],
			iCloudVCard: JSON.stringify(testVCard),
		});
	});

	test("Should update frontmatter without touching user added properties", async () => {
		const mockFrontMatter = {
			propertyToNotTouch: "value",
			name: "Test Nordmann",
			email: ["test@test.test"],
			telephone: ["87654321"],
			iCloudVCard: testVCard,
		};
		mockObsidianApi.app.fileManager.processFrontMatter.mockImplementationOnce(
			async (_file: any, fn: any) => {
				fn(mockFrontMatter);
			},
		);
		mockObsidianApi.app.vault.adapter.list.mockResolvedValueOnce({
			files: ["Contacts/Test Nordmann.md"],
			folders: [],
		});
		mockObsidianApi.app.metadataCache.getCache.mockReturnValueOnce({
			frontmatter: mockFrontMatter,
		});

		const updatedTestVCard = {
			url: "https://contacts.icloud.com/123456789/carddavhome/card/MGVmYzgxOWEtNTM2YS00ZDc3LTgwNzAtNzMzZWJmMTJiNDlj.vcf",
			etag: '"newEtag"',
			data: "BEGIN:VCARD\r\nVERSION:3.0\r\nPRODID:-//Apple Inc.//macOS 14.2.1//EN\r\nN:Nordmann;Test;;;\r\nFN:Test Nordmann\r\nEMAIL;type=INTERNET;type=HOME;type=pref:test@test.test\r\nEMAIL;type=INTERNET;type=WORK:work@e.mail\r\nTEL;type=pref:87654321\r\nX-ADDRESSING-GRAMMAR;type=pref:nk4spnSLebY1Z7hrtGsE+SiKxtfLA9NCl1ppo++yLQXR\r\n dTzQ1rMPcvZSSz8zcfqqEZ7obWbUmqx3AwTv9El8RwO0sd7JC5PtBU/Xo1sAoQHgxyDHqt9HyYt\r\n MsKQp0G9VRTrBwwvR5NKS5tyy0Q8onhMKCgtjNyCscF5gLFWzR7lRW2lWgKqXLA19oo9JctO2VN\r\n IfhnIFGqNeuDs1SU/MR0hAVU2NVaepvH3AYoTEW89tI3XftBCF7e6/stnlXH/JKnvBnRabdtYsL\r\n BO+C/VAHzVByPaFUXKgAMXKP9nSR2NKnYzsCI+xUV71lYPSWx0NXGvTSh9oc3Gj59cDCnXz1FG1\r\n 35ElmHJ682AQ7dP7t5O0smvGOjn2+zBF9q15vfsfHEmYm9qnBfGilZ+J4DrNZuSASqo=\r\nREV:2024-02-28T22:04:34Z\r\nUID:0efc819a-536a-4d77-8070-733ebf12b49c\r\nEND:VCARD",
		};
		mockFetchContacts.mockResolvedValueOnce([updatedTestVCard]);

		const api = new ICloudContactsApi(
			mockObsidianApi,
			MOCK_DEFAULT_SETTINGS,
			mockFetchContacts,
			mockNoticeShower,
		);

		await api.updateContacts();

		expect(mockFrontMatter).toEqual({
			propertyToNotTouch: "value",
			name: "Test Nordmann",
			email: ["test@test.test", "work@e.mail"],
			telephone: ["87654321"],
			iCloudVCard: JSON.stringify(updatedTestVCard),
		});
	});

	test("Should rename contact file and update header if contact name has been updated", async () => {
		const mockFrontMatter = {
			name: "Test Nordmann",
			email: ["test@test.test"],
			telephone: ["87654321"],
			iCloudVCard: testVCard,
		};
		mockObsidianApi.app.fileManager.processFrontMatter.mockImplementationOnce(
			async (_file: any, fn: any) => {
				fn(mockFrontMatter);
			},
		);
		mockObsidianApi.app.vault.adapter.list.mockResolvedValueOnce({
			files: ["Contacts/Test Nordmann.md"],
			folders: [],
		});
		mockObsidianApi.app.metadataCache.getCache.mockReturnValueOnce({
			frontmatter: mockFrontMatter,
		});
		let newFileContent = "";
		mockObsidianApi.app.vault.process.mockImplementationOnce(
			async (
				_file: any,
				fn: (data: string) => string,
				_options?: any,
			) => {
				newFileContent = fn("# Test Nordmann");
				return newFileContent;
			},
		);

		const updatedTestVCard = {
			url: "https://contacts.icloud.com/123456789/carddavhome/card/MGVmYzgxOWEtNTM2YS00ZDc3LTgwNzAtNzMzZWJmMTJiNDlj.vcf",
			etag: '"newEtag"',
			data: "BEGIN:VCARD\r\nVERSION:3.0\r\nPRODID:-//Apple Inc.//macOS 14.2.1//EN\r\nN:Nordmann;Testesen;;;\r\nFN:Testesen Nordmann\r\nEMAIL;type=INTERNET;type=HOME;type=pref:test@test.test\r\nTEL;type=pref:87654321\r\nX-ADDRESSING-GRAMMAR;type=pref:nk4spnSLebY1Z7hrtGsE+SiKxtfLA9NCl1ppo++yLQXR\r\n dTzQ1rMPcvZSSz8zcfqqEZ7obWbUmqx3AwTv9El8RwO0sd7JC5PtBU/Xo1sAoQHgxyDHqt9HyYt\r\n MsKQp0G9VRTrBwwvR5NKS5tyy0Q8onhMKCgtjNyCscF5gLFWzR7lRW2lWgKqXLA19oo9JctO2VN\r\n IfhnIFGqNeuDs1SU/MR0hAVU2NVaepvH3AYoTEW89tI3XftBCF7e6/stnlXH/JKnvBnRabdtYsL\r\n BO+C/VAHzVByPaFUXKgAMXKP9nSR2NKnYzsCI+xUV71lYPSWx0NXGvTSh9oc3Gj59cDCnXz1FG1\r\n 35ElmHJ682AQ7dP7t5O0smvGOjn2+zBF9q15vfsfHEmYm9qnBfGilZ+J4DrNZuSASqo=\r\nREV:2024-02-28T22:04:34Z\r\nUID:0efc819a-536a-4d77-8070-733ebf12b49c\r\nEND:VCARD",
		};
		mockFetchContacts.mockResolvedValueOnce([updatedTestVCard]);

		const api = new ICloudContactsApi(
			mockObsidianApi,
			MOCK_DEFAULT_SETTINGS,
			mockFetchContacts,
			mockNoticeShower,
		);

		await api.updateContacts();

		expect(
			mockObsidianApi.app.fileManager.renameFile,
		).toHaveBeenCalledTimes(1);
		expect(mockObsidianApi.app.fileManager.renameFile).toHaveBeenCalledWith(
			"TFile",
			"Contacts/Testesen Nordmann.md",
		);

		expect(mockObsidianApi.app.vault.process).toHaveBeenCalledTimes(1);
		expect(newFileContent).toEqual("# Testesen Nordmann");
	});

	test("Should handle all types of characters in name", async () => {});
});
