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
				>(async (_normalizedPath: string) => mockListedFiles),
				exists: jest.fn<
					(
						normalizedPath: string,
						sensitive: boolean,
					) => Promise<boolean>
				>(
					async (_normalizedPath: string, _sensitive: boolean) =>
						false,
				),
			},
			append: jest.fn<
				(file: any, data: string, options?: any) => Promise<void>
			>(),
			create: jest.fn<
				(path: string, data: string, options?: any) => Promise<any>
			>(),
			createBinary:
				jest.fn<(path: string, data: ArrayBuffer) => Promise<any>>(),
			modifyBinary:
				jest.fn<(file: any, data: ArrayBuffer) => Promise<void>>(),
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
	isNameHeading: true,
	telLabels: false,
	emailLabels: false,
	urlLabels: false,
	relatedLabels: false,
	addressLabels: false,
	excludedKeys:
		"n photo prodid rev uid version xAbadr xAbLabel xAblabel xAbShowAs xImagehash xImagetype xSharedPhotoDisplayPref xAddressingGrammar xAppleSubadministrativearea xAppleSublocality",
	settingsChanged: false,
	iCloudServerUrl: "https://contacts.icloud.com",
	groups: [],
	previousUpdateSettings: {
		username: "username",
		password: "password",
		folder: "Contacts",
		isNameHeading: true,
		telLabels: false,
		emailLabels: false,
		urlLabels: false,
		relatedLabels: false,
		addressLabels: false,
		excludedKeys:
			"n photo prodid rev uid version xAbadr xAbLabel xAblabel xAbShowAs xImagehash xImagetype xSharedPhotoDisplayPref xAddressingGrammar xAppleSubadministrativearea xAppleSublocality",
		settingsChanged: false,
		iCloudServerUrl: "https://contacts.icloud.com",
		previousUpdateSettings: undefined,
		previousUpdateData: [],
		groups: [],
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

	test("Should handle no files of iCloudVCards", async () => {
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
		await expect(api.updateContacts()).resolves.not.toThrow();
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
			frontmatter: { ...mockFrontMatter },
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
			frontmatter: { ...mockFrontMatter },
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

	test("Adding a key to Excluded keys should remove the key from existing contacts", async () => {
		const mockFrontMatter = {
			propertyToNotTouch: "value",
			name: "Test Nordmann",
			email: ["test@test.test"],
			telephone: ["87654321"],
			iCloudVCard: JSON.stringify(testVCard),
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
			frontmatter: { ...mockFrontMatter },
		});

		mockFetchContacts.mockResolvedValueOnce([testVCard]);

		const mockSettings = {
			...MOCK_DEFAULT_SETTINGS,
			excludedKeys:
				"email n photo prodid rev uid version xAbadr xAbLabel xAblabel xAbShowAs xImagehash xImagetype xSharedPhotoDisplayPref xAddressingGrammar xAppleSubadministrativearea xAppleSublocality",
		};
		const api = new ICloudContactsApi(
			mockObsidianApi,
			mockSettings,
			mockFetchContacts,
			mockNoticeShower,
		);

		await api.updateContacts();

		expect(mockFrontMatter).toEqual({
			propertyToNotTouch: "value",
			name: "Test Nordmann",
			telephone: ["87654321"],
			iCloudVCard: JSON.stringify(testVCard),
		});
	});

	test("Should create contact file with a new unique name when a contact file with the same contact name exists", async () => {
		const mockFrontMatter = {
			name: "Test Nordmann",
			email: ["test@test.test"],
			telephone: ["87654321"],
			iCloudVCard: testVCard,
		};
		const sameNameTestVCard = {
			url: "https://contacts.icloud.com/123456789/carddavhome/card/samenametestvcard.vcf",
			etag: '"samenametestvcard"',
			data: "BEGIN:VCARD\r\nVERSION:3.0\r\nPRODID:-//Apple Inc.//macOS 14.2.1//EN\r\nN:Nordmann;Test;;;\r\nFN:Test Nordmann\r\nEMAIL;type=INTERNET;type=HOME;type=pref:testnordmann@test.test\r\nTEL;type=pref:12345678\r\nREV:2024-02-28T22:04:34Z\r\nUID:samenametestvcard\r\nEND:VCARD",
		};
		const sameNameMockFrontMatter = {};
		mockObsidianApi.app.fileManager.processFrontMatter.mockImplementationOnce(
			async (_file: any, fn: any) => {
				fn(sameNameMockFrontMatter);
			},
		);
		mockObsidianApi.app.vault.adapter.list.mockResolvedValueOnce({
			files: ["Contacts/Test Nordmann.md"],
			folders: [],
		});
		mockObsidianApi.app.metadataCache.getCache.mockReturnValueOnce({
			frontmatter: { ...mockFrontMatter },
		});
		mockFetchContacts.mockResolvedValueOnce([testVCard, sameNameTestVCard]);

		mockObsidianApi.app.vault.adapter.exists.mockImplementation(
			async (path: string, _sensitive: boolean) =>
				path === "Contacts/Test Nordmann.md",
		);

		const api = new ICloudContactsApi(
			mockObsidianApi,
			MOCK_DEFAULT_SETTINGS,
			mockFetchContacts,
			mockNoticeShower,
		);

		await api.updateContacts();

		expect(mockObsidianApi.app.vault.process).not.toHaveBeenCalled();
		expect(
			mockObsidianApi.app.fileManager.renameFile,
		).not.toHaveBeenCalled();
		expect(mockObsidianApi.app.vault.create).toHaveBeenCalledTimes(1);
		expect(mockObsidianApi.app.vault.create).toHaveBeenCalledWith(
			"Contacts/Test Nordmann 2.md",
			"# Test Nordmann",
		);
		expect(sameNameMockFrontMatter).toEqual({
			name: "Test Nordmann",
			email: ["testnordmann@test.test"],
			telephone: ["12345678"],
			iCloudVCard: JSON.stringify(sameNameTestVCard),
		});
	});

	test("Should rename contact file with a new unique name when a contact file with the same contact name exists", async () => {
		const mockFrontMatter = {
			name: "Test Nordmann",
			email: ["test@test.test"],
			telephone: ["87654321"],
			iCloudVCard: testVCard,
		};
		const toBecomeSameNameTestVCard = {
			url: "https://contacts.icloud.com/123456789/carddavhome/card/tobecomesamenametestvcard.vcf",
			etag: '"tobecomesamenametestvcard"',
			data: "BEGIN:VCARD\r\nVERSION:3.0\r\nPRODID:-//Apple Inc.//macOS 14.2.1//EN\r\nN:Nordmann;Ola;;;\r\nFN:Ola Nordmann\r\nEMAIL;type=INTERNET;type=HOME;type=pref:testnordmann@test.test\r\nTEL;type=pref:12345678\r\nREV:2024-02-28T22:04:34Z\r\nUID:samenametestvcard\r\nEND:VCARD",
		};
		const toBecomeSameNameMockFrontMatter = {
			name: "Ola Nordmann",
			email: ["test@test.test"],
			telephone: ["87654321"],
			iCloudVCard: toBecomeSameNameTestVCard,
		};
		mockObsidianApi.app.fileManager.processFrontMatter.mockImplementationOnce(
			async (_file: any, fn: any) => {
				fn(toBecomeSameNameMockFrontMatter);
			},
		);
		mockObsidianApi.app.vault.adapter.list.mockResolvedValueOnce({
			files: ["Contacts/Test Nordmann.md", "Contacts/Ola Nordmann.md"],
			folders: [],
		});
		mockObsidianApi.app.metadataCache.getCache.mockImplementation(
			(path: string) => {
				if (path === "Contacts/Test Nordmann.md") {
					return { frontmatter: { ...mockFrontMatter } };
				}
				if (path === "Contacts/Ola Nordmann.md") {
					return {
						frontmatter: { ...toBecomeSameNameMockFrontMatter },
					};
				}
				return null;
			},
		);
		const sameNameTestVCard = {
			url: "https://contacts.icloud.com/123456789/carddavhome/card/tobecomesamenametestvcard.vcf",
			etag: '"samenametestvcard"',
			data: "BEGIN:VCARD\r\nVERSION:3.0\r\nPRODID:-//Apple Inc.//macOS 14.2.1//EN\r\nN:Nordmann;Test;;;\r\nFN:Test Nordmann\r\nEMAIL;type=INTERNET;type=HOME;type=pref:testnordmann@test.test\r\nTEL;type=pref:12345678\r\nREV:2024-02-28T22:04:34Z\r\nUID:samenametestvcard\r\nEND:VCARD",
		};
		mockFetchContacts.mockResolvedValueOnce([testVCard, sameNameTestVCard]);

		mockObsidianApi.app.vault.getFileByPath.mockImplementation(
			(path: string) => {
				if (path === "Contacts/Test Nordmann.md")
					return "TFile " + path;
				if (path === "Contacts/Ola Nordmann.md") return "TFile " + path;
			},
		);

		const api = new ICloudContactsApi(
			mockObsidianApi,
			MOCK_DEFAULT_SETTINGS,
			mockFetchContacts,
			mockNoticeShower,
		);

		await api.updateContacts();

		expect(mockObsidianApi.app.vault.process).toHaveBeenCalledTimes(1);
		expect(
			mockObsidianApi.app.fileManager.renameFile,
		).toHaveBeenCalledTimes(1);
		expect(mockObsidianApi.app.fileManager.renameFile).toHaveBeenCalledWith(
			"TFile Contacts/Ola Nordmann.md",
			"Contacts/Test Nordmann 2.md",
		);
		expect(mockObsidianApi.app.vault.create).not.toHaveBeenCalled();
		expect(toBecomeSameNameMockFrontMatter).toEqual({
			name: "Test Nordmann",
			email: ["testnordmann@test.test"],
			telephone: ["12345678"],
			iCloudVCard: JSON.stringify(sameNameTestVCard),
		});
	});

	test("Should move contact file to deleted folder with a new unique name when a contact file in the delted folder with the same contact name exists", async () => {
		mockFetchContacts.mockResolvedValueOnce([]);
		const mockFrontMatter = {
			name: "Test Nordmann",
			email: ["test@test.test"],
			telephone: ["87654321"],
			iCloudVCard: testVCard,
		};
		mockObsidianApi.app.metadataCache.getCache.mockReturnValueOnce({
			frontmatter: { ...mockFrontMatter },
		});
		mockObsidianApi.app.vault.adapter.list.mockResolvedValueOnce({
			files: ["Contacts/Test Nordmann.md"],
			folders: ["Deleted"],
		});
		mockObsidianApi.app.vault.adapter.exists.mockImplementation(
			async (path: string, _sensitive: boolean) =>
				path === "Contacts/Deleted/Test Nordmann.md",
		);
		mockObsidianApi.app.vault.getFileByPath.mockReturnValueOnce({
			basename: "Test Nordmann",
		});
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
			{
				basename: "Test Nordmann",
			},
			"Contacts/Deleted/Test Nordmann 2.md",
		);
	});

	test("Should handle all types of characters in name", async () => {});

	test("Should not do anything if previousUpdateSettings.isNameHeading is undefined and isNameHeading is true", async () => {
		mockFetchContacts.mockResolvedValueOnce([testVCard]);
		const mockFrontMatter = {
			name: "Test Nordmann",
			email: ["test@test.test"],
			telephone: ["87654321"],
			iCloudVCard: testVCard,
		};
		mockObsidianApi.app.metadataCache.getCache.mockReturnValueOnce({
			frontmatter: { ...mockFrontMatter },
		});
		mockObsidianApi.app.vault.adapter.list.mockResolvedValueOnce({
			files: ["Contacts/Test Nordmann.md"],
			folders: [""],
		});
		mockObsidianApi.app.vault.getFileByPath.mockReturnValueOnce({
			basename: "Test Nordmann",
		});
		if (MOCK_DEFAULT_SETTINGS.previousUpdateSettings)
			MOCK_DEFAULT_SETTINGS.previousUpdateSettings.isNameHeading =
				undefined;
		MOCK_DEFAULT_SETTINGS.isNameHeading = true;
		const api = new ICloudContactsApi(
			mockObsidianApi,
			MOCK_DEFAULT_SETTINGS,
			mockFetchContacts,
			mockNoticeShower,
		);

		await api.updateContacts();
		expect(mockObsidianApi.app.vault.process).toHaveBeenCalledTimes(0);
	});

	test("Should remove heading if previousUpdateSettings.isNameHeading is undefined and isNameHeading is false", async () => {
		mockFetchContacts.mockResolvedValueOnce([testVCard]);
		const mockFrontMatter = {
			name: "Test Nordmann",
			email: ["test@test.test"],
			telephone: ["87654321"],
			iCloudVCard: testVCard,
		};
		mockObsidianApi.app.metadataCache.getCache.mockReturnValueOnce({
			frontmatter: { ...mockFrontMatter },
		});
		mockObsidianApi.app.vault.adapter.list.mockResolvedValueOnce({
			files: ["Contacts/Test Nordmann.md"],
			folders: [""],
		});
		mockObsidianApi.app.vault.getFileByPath.mockReturnValueOnce({
			basename: "Test Nordmann",
		});
		const mockFileContent = "\n---\n# Test Nordmann";

		let usedSearchValue: any = "";
		let usedReplaceValue: any = "";
		// Save the original implementation
		const originalReplace = String.prototype.replace;
		const replaceMock = jest
			.spyOn(String.prototype, "replace")
			.mockImplementation(function (searchValue, replaceValue) {
				// Apply the mock only if the string matches the specific one
				if (this === mockFileContent) {
					usedSearchValue = searchValue;
					usedReplaceValue = replaceValue;
					return "mocked string";
				}

				// For all other cases, use the original replace function
				return originalReplace.apply(this, arguments as any);
			});
		mockObsidianApi.app.vault.process.mockImplementationOnce(
			async (
				_file: any,
				fn: (data: string) => string,
				_options?: any,
			) => {
				return fn(mockFileContent);
			},
		);
		if (MOCK_DEFAULT_SETTINGS.previousUpdateSettings)
			MOCK_DEFAULT_SETTINGS.previousUpdateSettings.isNameHeading =
				undefined;
		MOCK_DEFAULT_SETTINGS.isNameHeading = false;
		const api = new ICloudContactsApi(
			mockObsidianApi,
			MOCK_DEFAULT_SETTINGS,
			mockFetchContacts,
			mockNoticeShower,
		);

		await api.updateContacts();
		expect(mockObsidianApi.app.vault.process).toHaveBeenCalledTimes(1);
		expect(usedSearchValue).toEqual("# Test Nordmann");
		expect(usedReplaceValue).toEqual("");

		replaceMock.mockRestore();
	});

	test("Should remove heading if previousUpdateSettings.isNameHeading is true and isNameHeading is false", async () => {
		mockFetchContacts.mockResolvedValueOnce([testVCard]);
		const mockFrontMatter = {
			name: "Test Nordmann",
			email: ["test@test.test"],
			telephone: ["87654321"],
			iCloudVCard: testVCard,
		};
		mockObsidianApi.app.metadataCache.getCache.mockReturnValueOnce({
			frontmatter: { ...mockFrontMatter },
		});
		mockObsidianApi.app.vault.adapter.list.mockResolvedValueOnce({
			files: ["Contacts/Test Nordmann.md"],
			folders: [""],
		});
		mockObsidianApi.app.vault.getFileByPath.mockReturnValueOnce({
			basename: "Test Nordmann",
		});
		const mockFileContent = "\n---\n# Test Nordmann";

		let usedSearchValue: any = "";
		let usedReplaceValue: any = "";
		// Save the original implementation
		const originalReplace = String.prototype.replace;
		const replaceMock = jest
			.spyOn(String.prototype, "replace")
			.mockImplementation(function (searchValue, replaceValue) {
				// Apply the mock only if the string matches the specific one
				if (this === mockFileContent) {
					usedSearchValue = searchValue;
					usedReplaceValue = replaceValue;
					return "mocked string";
				}

				// For all other cases, use the original replace function
				return originalReplace.apply(this, arguments as any);
			});
		mockObsidianApi.app.vault.process.mockImplementationOnce(
			async (
				_file: any,
				fn: (data: string) => string,
				_options?: any,
			) => {
				return fn(mockFileContent);
			},
		);
		if (MOCK_DEFAULT_SETTINGS.previousUpdateSettings)
			MOCK_DEFAULT_SETTINGS.previousUpdateSettings.isNameHeading = true;
		MOCK_DEFAULT_SETTINGS.isNameHeading = false;
		const api = new ICloudContactsApi(
			mockObsidianApi,
			MOCK_DEFAULT_SETTINGS,
			mockFetchContacts,
			mockNoticeShower,
		);

		await api.updateContacts();
		expect(mockObsidianApi.app.vault.process).toHaveBeenCalledTimes(1);
		expect(usedSearchValue).toEqual("# Test Nordmann");
		expect(usedReplaceValue).toEqual("");

		replaceMock.mockRestore();
	});

	test("Should add heading if previousUpdateSettings.isNameHeading is false and isNameHeading is true", async () => {
		mockFetchContacts.mockResolvedValueOnce([testVCard]);
		const mockFrontMatter = {
			name: "Test Nordmann",
			email: ["test@test.test"],
			telephone: ["87654321"],
			iCloudVCard: testVCard,
		};
		mockObsidianApi.app.metadataCache.getCache.mockReturnValueOnce({
			frontmatter: { ...mockFrontMatter },
		});
		mockObsidianApi.app.vault.adapter.list.mockResolvedValueOnce({
			files: ["Contacts/Test Nordmann.md"],
			folders: [""],
		});
		mockObsidianApi.app.vault.getFileByPath.mockReturnValueOnce({
			basename: "Test Nordmann",
		});
		const mockFileContent = "\n---\n";

		let usedSearchValue: any = "";
		let usedReplaceValue: any = "";
		// Save the original implementation
		const originalReplace = String.prototype.replace;
		const replaceMock = jest
			.spyOn(String.prototype, "replace")
			.mockImplementation(function (searchValue, replaceValue) {
				// Apply the mock only if the string matches the specific one
				if (this === mockFileContent) {
					usedSearchValue = searchValue;
					usedReplaceValue = replaceValue;
					// For all other cases, use the original replace function
					return originalReplace.apply(this, arguments as any);
				}

				// For all other cases, use the original replace function
				return originalReplace.apply(this, arguments as any);
			});

		let newFileContent = "";
		mockObsidianApi.app.vault.process.mockImplementationOnce(
			async (
				_file: any,
				fn: (data: string) => string,
				_options?: any,
			) => {
				newFileContent = fn(mockFileContent);
				return newFileContent;
			},
		);
		if (MOCK_DEFAULT_SETTINGS.previousUpdateSettings)
			MOCK_DEFAULT_SETTINGS.previousUpdateSettings.isNameHeading = false;
		MOCK_DEFAULT_SETTINGS.isNameHeading = true;
		const api = new ICloudContactsApi(
			mockObsidianApi,
			MOCK_DEFAULT_SETTINGS,
			mockFetchContacts,
			mockNoticeShower,
		);

		await api.updateContacts();
		expect(mockObsidianApi.app.vault.process).toHaveBeenCalledTimes(1);
		expect(usedSearchValue).toEqual("\n---\n");
		expect(usedReplaceValue).toEqual("\n---\n# Test Nordmann");
		expect(newFileContent).toEqual("\n---\n# Test Nordmann");

		replaceMock.mockRestore();
	});

	test("Should add heading with trailing new line if previousUpdateSettings.isNameHeading is false, isNameHeading is true and the file hase content beyond the frontmatter", async () => {
		mockFetchContacts.mockResolvedValueOnce([testVCard]);
		const mockFrontMatter = {
			name: "Test Nordmann",
			email: ["test@test.test"],
			telephone: ["87654321"],
			iCloudVCard: testVCard,
		};
		mockObsidianApi.app.metadataCache.getCache.mockReturnValueOnce({
			frontmatter: { ...mockFrontMatter },
		});
		mockObsidianApi.app.vault.adapter.list.mockResolvedValueOnce({
			files: ["Contacts/Test Nordmann.md"],
			folders: [""],
		});
		mockObsidianApi.app.vault.getFileByPath.mockReturnValueOnce({
			basename: "Test Nordmann",
		});
		const mockFileContent = "\n---\nhei du der";

		let usedSearchValue: any = "";
		let usedReplaceValue: any = "";
		// Save the original implementation
		const originalReplace = String.prototype.replace;
		const replaceMock = jest
			.spyOn(String.prototype, "replace")
			.mockImplementation(function (searchValue, replaceValue) {
				// Apply the mock only if the string matches the specific one
				if (this === mockFileContent) {
					usedSearchValue = searchValue;
					usedReplaceValue = replaceValue;
					// For all other cases, use the original replace function
					return originalReplace.apply(this, arguments as any);
				}

				// For all other cases, use the original replace function
				return originalReplace.apply(this, arguments as any);
			});

		let newFileContent = "";
		mockObsidianApi.app.vault.process.mockImplementationOnce(
			async (
				_file: any,
				fn: (data: string) => string,
				_options?: any,
			) => {
				newFileContent = fn(mockFileContent);
				return newFileContent;
			},
		);
		if (MOCK_DEFAULT_SETTINGS.previousUpdateSettings)
			MOCK_DEFAULT_SETTINGS.previousUpdateSettings.isNameHeading = false;
		MOCK_DEFAULT_SETTINGS.isNameHeading = true;
		const api = new ICloudContactsApi(
			mockObsidianApi,
			MOCK_DEFAULT_SETTINGS,
			mockFetchContacts,
			mockNoticeShower,
		);

		await api.updateContacts();
		expect(mockObsidianApi.app.vault.process).toHaveBeenCalledTimes(1);
		expect(usedSearchValue).toEqual("\n---\n");
		expect(usedReplaceValue).toEqual("\n---\n# Test Nordmann\n");
		expect(newFileContent).toEqual("\n---\n# Test Nordmann\nhei du der");

		replaceMock.mockRestore();
	});

	// Regression test: toggling `nameOrder` (or any other setting that changes
	// the computed contact name) used to leave an extra blank line behind every
	// time, because the heading-replace logic always added a newline unless the
	// heading was the very last thing in the file.
	test("Should not insert an extra blank line when the contact name changes but the heading itself is not being added", async () => {
		mockFetchContacts.mockResolvedValueOnce([testVCard]);
		const mockFrontMatter = {
			name: "Test Nordmann",
			email: ["test@test.test"],
			telephone: ["87654321"],
			iCloudVCard: testVCard,
		};
		mockObsidianApi.app.metadataCache.getCache.mockReturnValueOnce({
			frontmatter: { ...mockFrontMatter },
		});
		mockObsidianApi.app.vault.adapter.list.mockResolvedValueOnce({
			files: ["Contacts/Test Nordmann.md"],
			folders: [""],
		});
		mockObsidianApi.app.vault.getFileByPath.mockReturnValueOnce({
			basename: "Test Nordmann",
		});
		const mockFileContent = "\n---\n# Test Nordmann\n\nhei du der";

		let usedSearchValue: any = "";
		let usedReplaceValue: any = "";
		const originalReplace = String.prototype.replace;
		const replaceMock = jest
			.spyOn(String.prototype, "replace")
			.mockImplementation(function (searchValue, replaceValue) {
				if (this === mockFileContent) {
					usedSearchValue = searchValue;
					usedReplaceValue = replaceValue;
				}
				return originalReplace.apply(this, arguments as any);
			});

		let newFileContent = "";
		mockObsidianApi.app.vault.process.mockImplementationOnce(
			async (
				_file: any,
				fn: (data: string) => string,
				_options?: any,
			) => {
				newFileContent = fn(mockFileContent);
				return newFileContent;
			},
		);
		if (MOCK_DEFAULT_SETTINGS.previousUpdateSettings) {
			MOCK_DEFAULT_SETTINGS.previousUpdateSettings.isNameHeading = true;
			MOCK_DEFAULT_SETTINGS.previousUpdateSettings.nameOrder =
				"givenFirst";
		}
		MOCK_DEFAULT_SETTINGS.isNameHeading = true;
		MOCK_DEFAULT_SETTINGS.nameOrder = "familyFirst";
		const api = new ICloudContactsApi(
			mockObsidianApi,
			MOCK_DEFAULT_SETTINGS,
			mockFetchContacts,
			mockNoticeShower,
		);

		await api.updateContacts();
		expect(mockObsidianApi.app.vault.process).toHaveBeenCalledTimes(1);
		expect(usedSearchValue).toEqual("# Test Nordmann");
		expect(usedReplaceValue).toEqual("# Nordmann Test");
		expect(newFileContent).toEqual("\n---\n# Nordmann Test\n\nhei du der");

		replaceMock.mockRestore();
		MOCK_DEFAULT_SETTINGS.nameOrder = undefined;
		if (MOCK_DEFAULT_SETTINGS.previousUpdateSettings)
			MOCK_DEFAULT_SETTINGS.previousUpdateSettings.nameOrder = undefined;
	});

	test("Should only create files for the contacts that are in the settings.groups", async () => {
		// vCard representing a group with a specific UID
		const groupUid = "group-uid-123";
		const contactUidInGroup = "contact-uid-in-group";
		const contactUidNotInGroup = "contact-uid-not-in-group";

		const groupVCard: ICloudVCard = {
			url: "https://contacts.icloud.com/123456789/carddavhome/card/group.vcf",
			etag: '"group-etag"',
			data:
				"BEGIN:VCARD\r\n" +
				"VERSION:3.0\r\n" +
				"PRODID:-//Apple Inc.//macOS 14.2.1//EN\r\n" +
				`UID:${groupUid}\r\n` +
				"X-ADDRESSBOOKSERVER-KIND:group\r\n" +
				`X-ADDRESSBOOKSERVER-MEMBER:urn:uuid:${contactUidInGroup}\r\n` +
				"END:VCARD",
		};

		const inGroupContactVCard: ICloudVCard = {
			url: "https://contacts.icloud.com/123456789/carddavhome/card/in-group.vcf",
			etag: '"in-group-etag"',
			data:
				"BEGIN:VCARD\r\n" +
				"VERSION:3.0\r\n" +
				"PRODID:-//Apple Inc.//macOS 14.2.1//EN\r\n" +
				"N:Doe;InGroup;;;\r\n" +
				"FN:InGroup Doe\r\n" +
				`UID:${contactUidInGroup}\r\n` +
				"EMAIL;type=INTERNET;type=HOME;type=pref:ingroup@example.com\r\n" +
				"TEL;type=pref:11111111\r\n" +
				"END:VCARD",
		};

		const notInGroupContactVCard: ICloudVCard = {
			url: "https://contacts.icloud.com/123456789/carddavhome/card/not-in-group.vcf",
			etag: '"not-in-group-etag"',
			data:
				"BEGIN:VCARD\r\n" +
				"VERSION:3.0\r\n" +
				"PRODID:-//Apple Inc.//macOS 14.2.1//EN\r\n" +
				"N:Doe;NotInGroup;;;\r\n" +
				"FN:NotInGroup Doe\r\n" +
				`UID:${contactUidNotInGroup}\r\n` +
				"EMAIL;type=INTERNET;type=HOME;type=pref:notingroup@example.com\r\n" +
				"TEL;type=pref:22222222\r\n" +
				"END:VCARD",
		};

		mockFetchContacts.mockResolvedValueOnce([
			groupVCard,
			inGroupContactVCard,
			notInGroupContactVCard,
		]);

		const mockFrontMatter: any = {};
		mockObsidianApi.app.fileManager.processFrontMatter.mockImplementationOnce(
			async (_file: any, fn: any) => {
				fn(mockFrontMatter);
			},
		);

		const settingsWithGroup: ICloudContactsSettings = {
			...MOCK_DEFAULT_SETTINGS,
			groups: [groupUid],
		};

		const api = new ICloudContactsApi(
			mockObsidianApi,
			settingsWithGroup,
			mockFetchContacts,
			mockNoticeShower,
		);

		await api.updateContacts();

		// Should only have created a file for the contact that is a member of the selected group
		expect(mockObsidianApi.app.vault.create).toHaveBeenCalledTimes(1);
		expect(mockObsidianApi.app.vault.create).toHaveBeenCalledWith(
			"Contacts/InGroup Doe.md",
			"# InGroup Doe",
		);
		expect(mockFrontMatter).toEqual({
			name: "InGroup Doe",
			email: ["ingroup@example.com"],
			telephone: ["11111111"],
			// The vCard stored in frontmatter should be the contact's vCard, not the group vCard
			iCloudVCard: JSON.stringify(inGroupContactVCard),
		});
	});

	describe("lists property", () => {
		beforeEach(() => {
			mockObsidianApi.app.fileManager.processFrontMatter.mockReset();
			mockObsidianApi.app.metadataCache.getCache.mockReset();
			mockObsidianApi.app.vault.adapter.list.mockReset();
			mockObsidianApi.app.vault.adapter.list.mockResolvedValue(
				mockListedFiles,
			);
			mockObsidianApi.app.vault.getFileByPath.mockReset();
			mockObsidianApi.app.vault.getFileByPath.mockReturnValue("TFile");
		});

		const makeGroup = (
			uid: string,
			name: string | undefined,
			members: string[],
		) => ({
			url: `https://contacts.icloud.com/123456789/carddavhome/card/${uid}.vcf`,
			etag: `"${uid}-etag"`,
			data:
				"BEGIN:VCARD\r\nVERSION:3.0\r\n" +
				(name ? `FN:${name}\r\n` : "") +
				`UID:${uid}\r\n` +
				"X-ADDRESSBOOKSERVER-KIND:group\r\n" +
				members
					.map((m) => `X-ADDRESSBOOKSERVER-MEMBER:urn:uuid:${m}\r\n`)
					.join("") +
				"END:VCARD",
		});
		const makeContact = (uid: string, name: string) => ({
			url: `https://contacts.icloud.com/123456789/carddavhome/card/${uid}.vcf`,
			etag: `"${uid}-etag"`,
			data: `BEGIN:VCARD\r\nVERSION:3.0\r\nN:Doe;${name};;;\r\nFN:${name} Doe\r\nUID:${uid}\r\nEND:VCARD`,
		});

		test("Should add sorted list names to contacts, ignoring lists without a name", async () => {
			mockFetchContacts.mockResolvedValueOnce([
				makeGroup("g-work", "Work", ["alice"]),
				makeGroup("g-family", "Family", ["alice", "bob"]),
				makeGroup("g-noname", undefined, ["bob", "carol"]),
				makeContact("alice", "Alice"),
				makeContact("bob", "Bob"),
				makeContact("carol", "Carol"),
			]);
			const frontMatters: any[] = [{}, {}, {}];
			for (const fm of frontMatters) {
				mockObsidianApi.app.fileManager.processFrontMatter.mockImplementationOnce(
					async (_file: any, fn: any) => fn(fm),
				);
			}

			const api = new ICloudContactsApi(
				mockObsidianApi,
				{
					...MOCK_DEFAULT_SETTINGS,
					listsProperty: true,
					previousUpdateSettings: undefined,
				},
				mockFetchContacts,
				mockNoticeShower,
			);
			await api.updateContacts();

			expect(frontMatters[0].lists).toEqual(["Family", "Work"]);
			expect(frontMatters[1].lists).toEqual(["Family"]);
			expect(frontMatters[2]).not.toHaveProperty("lists");
		});

		test("Should add lists without limiting which contacts are synced", async () => {
			mockFetchContacts.mockResolvedValueOnce([
				makeGroup("g-family", "Family", ["alice"]),
				makeContact("alice", "Alice"),
				makeContact("bob", "Bob"),
			]);
			mockObsidianApi.app.fileManager.processFrontMatter.mockImplementation(
				async (_file: any, fn: any) => fn({}),
			);

			const api = new ICloudContactsApi(
				mockObsidianApi,
				{
					...MOCK_DEFAULT_SETTINGS,
					listsProperty: true,
					previousUpdateSettings: undefined,
				},
				mockFetchContacts,
				mockNoticeShower,
			);
			await api.updateContacts();

			expect(mockObsidianApi.app.vault.create).toHaveBeenCalledTimes(2);
		});

		test("Should not add lists when the setting is off", async () => {
			mockFetchContacts.mockResolvedValueOnce([
				makeGroup("g-family", "Family", ["alice"]),
				makeContact("alice", "Alice"),
			]);
			const fm: any = {};
			mockObsidianApi.app.fileManager.processFrontMatter.mockImplementationOnce(
				async (_file: any, fn: any) => fn(fm),
			);

			const api = new ICloudContactsApi(
				mockObsidianApi,
				MOCK_DEFAULT_SETTINGS,
				mockFetchContacts,
				mockNoticeShower,
			);
			await api.updateContacts();

			expect(fm).not.toHaveProperty("lists");
		});

		test("Should update an existing contact when its lists change but its etag does not", async () => {
			const alice = makeContact("alice", "Alice");
			const fm: any = {
				name: "Alice Doe",
				lists: ["Family"],
				iCloudVCard: alice,
			};
			mockObsidianApi.app.fileManager.processFrontMatter.mockImplementationOnce(
				async (_file: any, f: any) => f(fm),
			);
			mockObsidianApi.app.vault.adapter.list.mockResolvedValueOnce({
				files: ["Contacts/Alice Doe.md"],
				folders: [],
			});
			mockObsidianApi.app.metadataCache.getCache.mockReturnValueOnce({
				frontmatter: { ...fm },
			});
			mockFetchContacts.mockResolvedValueOnce([
				makeGroup("g-friends", "Friends", ["alice"]),
				alice,
			]);

			const api = new ICloudContactsApi(
				mockObsidianApi,
				{
					...MOCK_DEFAULT_SETTINGS,
					listsProperty: true,
					previousUpdateSettings: {
						...MOCK_DEFAULT_SETTINGS.previousUpdateSettings!,
						listsProperty: true,
					},
				},
				mockFetchContacts,
				mockNoticeShower,
			);
			await api.updateContacts();

			expect(fm.lists).toEqual(["Friends"]);
		});

		test("Should remove the lists property when the contact leaves all lists", async () => {
			const alice = makeContact("alice", "Alice");
			const fm: any = {
				name: "Alice Doe",
				lists: ["Family"],
				iCloudVCard: alice,
			};
			mockObsidianApi.app.fileManager.processFrontMatter.mockImplementationOnce(
				async (_file: any, f: any) => f(fm),
			);
			mockObsidianApi.app.vault.adapter.list.mockResolvedValueOnce({
				files: ["Contacts/Alice Doe.md"],
				folders: [],
			});
			mockObsidianApi.app.metadataCache.getCache.mockReturnValueOnce({
				frontmatter: { ...fm },
			});
			mockFetchContacts.mockResolvedValueOnce([alice]);

			const api = new ICloudContactsApi(
				mockObsidianApi,
				{
					...MOCK_DEFAULT_SETTINGS,
					listsProperty: true,
					previousUpdateSettings: {
						...MOCK_DEFAULT_SETTINGS.previousUpdateSettings!,
						listsProperty: true,
					},
				},
				mockFetchContacts,
				mockNoticeShower,
			);
			await api.updateContacts();

			expect(fm).not.toHaveProperty("lists");
		});
	});

	test("Should create files for all contacts if settings.groups is an empty array", async () => {
		const groupUid = "group-uid-123";
		const contactUidInGroup = "contact-uid-in-group";
		const contactUidNotInGroup = "contact-uid-not-in-group";

		const groupVCard: ICloudVCard = {
			url: "https://contacts.icloud.com/123456789/carddavhome/card/group.vcf",
			etag: '"group-etag"',
			data:
				"BEGIN:VCARD\r\n" +
				"VERSION:3.0\r\n" +
				"PRODID:-//Apple Inc.//macOS 14.2.1//EN\r\n" +
				`UID:${groupUid}\r\n` +
				"X-ADDRESSBOOKSERVER-KIND:group\r\n" +
				`X-ADDRESSBOOKSERVER-MEMBER:urn:uuid:${contactUidInGroup}\r\n` +
				"END:VCARD",
		};

		const inGroupContactVCard: ICloudVCard = {
			url: "https://contacts.icloud.com/123456789/carddavhome/card/in-group.vcf",
			etag: '"in-group-etag"',
			data:
				"BEGIN:VCARD\r\n" +
				"VERSION:3.0\r\n" +
				"PRODID:-//Apple Inc.//macOS 14.2.1//EN\r\n" +
				"N:Doe;InGroup;;;\r\n" +
				"FN:InGroup Doe\r\n" +
				`UID:${contactUidInGroup}\r\n` +
				"EMAIL;type=INTERNET;type=HOME;type=pref:ingroup@example.com\r\n" +
				"TEL;type=pref:11111111\r\n" +
				"END:VCARD",
		};

		const notInGroupContactVCard: ICloudVCard = {
			url: "https://contacts.icloud.com/123456789/carddavhome/card/not-in-group.vcf",
			etag: '"not-in-group-etag"',
			data:
				"BEGIN:VCARD\r\n" +
				"VERSION:3.0\r\n" +
				"PRODID:-//Apple Inc.//macOS 14.2.1//EN\r\n" +
				"N:Doe;NotInGroup;;;\r\n" +
				"FN:NotInGroup Doe\r\n" +
				`UID:${contactUidNotInGroup}\r\n` +
				"EMAIL;type=INTERNET;type=HOME;type=pref:notingroup@example.com\r\n" +
				"TEL;type=pref:22222222\r\n" +
				"END:VCARD",
		};

		mockFetchContacts.mockResolvedValueOnce([
			groupVCard,
			inGroupContactVCard,
			notInGroupContactVCard,
		]);

		mockObsidianApi.app.fileManager.processFrontMatter.mockImplementationOnce(
			async (_file: any, fn: any) => {
				fn({});
			},
		);

		const api = new ICloudContactsApi(
			mockObsidianApi,
			MOCK_DEFAULT_SETTINGS,
			mockFetchContacts,
			mockNoticeShower,
		);

		await api.updateContacts();

		expect(mockObsidianApi.app.vault.create).toHaveBeenCalledTimes(2);
		expect(mockObsidianApi.app.vault.create).toHaveBeenNthCalledWith(
			1,
			"Contacts/InGroup Doe.md",
			"# InGroup Doe",
		);
		expect(mockObsidianApi.app.vault.create).toHaveBeenNthCalledWith(
			2,
			"Contacts/NotInGroup Doe.md",
			"# NotInGroup Doe",
		);
	});

	test("Should not create files for contacts that are only members of unselected groups", async () => {
		const selectedGroupUid = "selected-group-uid";
		const unselectedGroupUid = "unselected-group-uid";
		const contactUidInSelectedGroup = "contact-uid-in-selected-group";
		const contactUidOnlyInUnselectedGroup =
			"contact-uid-only-in-unselected-group";

		const selectedGroupVCard: ICloudVCard = {
			url: "https://contacts.icloud.com/123456789/carddavhome/card/selected-group.vcf",
			etag: '"selected-group-etag"',
			data:
				"BEGIN:VCARD\r\n" +
				"VERSION:3.0\r\n" +
				"PRODID:-//Apple Inc.//macOS 14.2.1//EN\r\n" +
				`UID:${selectedGroupUid}\r\n` +
				"X-ADDRESSBOOKSERVER-KIND:group\r\n" +
				`X-ADDRESSBOOKSERVER-MEMBER:urn:uuid:${contactUidInSelectedGroup}\r\n` +
				"END:VCARD",
		};

		const unselectedGroupVCard: ICloudVCard = {
			url: "https://contacts.icloud.com/123456789/carddavhome/card/unselected-group.vcf",
			etag: '"unselected-group-etag"',
			data:
				"BEGIN:VCARD\r\n" +
				"VERSION:3.0\r\n" +
				"PRODID:-//Apple Inc.//macOS 14.2.1//EN\r\n" +
				`UID:${unselectedGroupUid}\r\n` +
				"X-ADDRESSBOOKSERVER-KIND:group\r\n" +
				`X-ADDRESSBOOKSERVER-MEMBER:urn:uuid:${contactUidOnlyInUnselectedGroup}\r\n` +
				"END:VCARD",
		};

		const inSelectedGroupContactVCard: ICloudVCard = {
			url: "https://contacts.icloud.com/123456789/carddavhome/card/in-selected-group.vcf",
			etag: '"in-selected-group-etag"',
			data:
				"BEGIN:VCARD\r\n" +
				"VERSION:3.0\r\n" +
				"PRODID:-//Apple Inc.//macOS 14.2.1//EN\r\n" +
				"N:Doe;InSelectedGroup;;;\r\n" +
				"FN:InSelectedGroup Doe\r\n" +
				`UID:${contactUidInSelectedGroup}\r\n` +
				"EMAIL;type=INTERNET;type=HOME;type=pref:inselected@example.com\r\n" +
				"TEL;type=pref:11111111\r\n" +
				"END:VCARD",
		};

		const onlyInUnselectedGroupContactVCard: ICloudVCard = {
			url: "https://contacts.icloud.com/123456789/carddavhome/card/only-in-unselected-group.vcf",
			etag: '"only-in-unselected-group-etag"',
			data:
				"BEGIN:VCARD\r\n" +
				"VERSION:3.0\r\n" +
				"PRODID:-//Apple Inc.//macOS 14.2.1//EN\r\n" +
				"N:Doe;OnlyInUnselectedGroup;;;\r\n" +
				"FN:OnlyInUnselectedGroup Doe\r\n" +
				`UID:${contactUidOnlyInUnselectedGroup}\r\n` +
				"EMAIL;type=INTERNET;type=HOME;type=pref:onlyinunselected@example.com\r\n" +
				"TEL;type=pref:22222222\r\n" +
				"END:VCARD",
		};

		mockFetchContacts.mockResolvedValueOnce([
			selectedGroupVCard,
			unselectedGroupVCard,
			inSelectedGroupContactVCard,
			onlyInUnselectedGroupContactVCard,
		]);

		const mockFrontMatter: any = {};
		mockObsidianApi.app.fileManager.processFrontMatter.mockImplementationOnce(
			async (_file: any, fn: any) => {
				fn(mockFrontMatter);
			},
		);

		const settingsWithSelectedGroup: ICloudContactsSettings = {
			...MOCK_DEFAULT_SETTINGS,
			groups: [selectedGroupUid],
		};

		const api = new ICloudContactsApi(
			mockObsidianApi,
			settingsWithSelectedGroup,
			mockFetchContacts,
			mockNoticeShower,
		);

		await api.updateContacts();

		// Should only have created a file for the contact that is a member of the selected group
		expect(mockObsidianApi.app.vault.create).toHaveBeenCalledTimes(1);
		expect(mockObsidianApi.app.vault.create).toHaveBeenCalledWith(
			"Contacts/InSelectedGroup Doe.md",
			"# InSelectedGroup Doe",
		);
		expect(mockFrontMatter).toEqual({
			name: "InSelectedGroup Doe",
			email: ["inselected@example.com"],
			telephone: ["11111111"],
			// The vCard stored in frontmatter should be the contact's vCard, not any group vCard
			iCloudVCard: JSON.stringify(inSelectedGroupContactVCard),
		});
	});

	test("Should ignore group vCards themselves and only create files for contact vCards", async () => {
		const groupUid = "group-uid-123";
		const contactUid = "contact-uid-123";

		const groupVCard: ICloudVCard = {
			url: "https://contacts.icloud.com/123456789/carddavhome/card/group.vcf",
			etag: '"group-etag"',
			data:
				"BEGIN:VCARD\r\n" +
				"VERSION:3.0\r\n" +
				"PRODID:-//Apple Inc.//macOS 14.2.1//EN\r\n" +
				`UID:${groupUid}\r\n` +
				"X-ADDRESSBOOKSERVER-KIND:group\r\n" +
				`X-ADDRESSBOOKSERVER-MEMBER:urn:uuid:${contactUid}\r\n` +
				"END:VCARD",
		};

		const contactVCard: ICloudVCard = {
			url: "https://contacts.icloud.com/123456789/carddavhome/card/contact.vcf",
			etag: '"contact-etag"',
			data:
				"BEGIN:VCARD\r\n" +
				"VERSION:3.0\r\n" +
				"PRODID:-//Apple Inc.//macOS 14.2.1//EN\r\n" +
				"N:Doe;Contact;;;\r\n" +
				"FN:Contact Doe\r\n" +
				`UID:${contactUid}\r\n` +
				"EMAIL;type=INTERNET;type=HOME;type=pref:contact@example.com\r\n" +
				"TEL;type=pref:11111111\r\n" +
				"END:VCARD",
		};

		mockFetchContacts.mockResolvedValueOnce([groupVCard, contactVCard]);

		const mockFrontMatter: any = {};
		mockObsidianApi.app.fileManager.processFrontMatter.mockImplementationOnce(
			async (_file: any, fn: any) => {
				fn(mockFrontMatter);
			},
		);

		const api = new ICloudContactsApi(
			mockObsidianApi,
			MOCK_DEFAULT_SETTINGS,
			mockFetchContacts,
			mockNoticeShower,
		);

		await api.updateContacts();

		// Even though fetchContacts returned both a group vCard and a contact vCard,
		// only the contact vCard should result in a created file.
		expect(mockObsidianApi.app.vault.create).toHaveBeenCalledTimes(1);
		expect(mockObsidianApi.app.vault.create).toHaveBeenCalledWith(
			"Contacts/Contact Doe.md",
			"# Contact Doe",
		);
		expect(mockFrontMatter).toEqual({
			name: "Contact Doe",
			email: ["contact@example.com"],
			telephone: ["11111111"],
			iCloudVCard: JSON.stringify(contactVCard),
		});
	});

	test("Should handle multiple selected groups and not duplicate contact files when a contact is in several groups", async () => {
		const groupUid1 = "group-uid-1";
		const groupUid2 = "group-uid-2";
		const sharedContactUid = "shared-contact-uid";

		const groupVCard1: ICloudVCard = {
			url: "https://contacts.icloud.com/123456789/carddavhome/card/group1.vcf",
			etag: '"group1-etag"',
			data:
				"BEGIN:VCARD\r\n" +
				"VERSION:3.0\r\n" +
				"PRODID:-//Apple Inc.//macOS 14.2.1//EN\r\n" +
				`UID:${groupUid1}\r\n` +
				"X-ADDRESSBOOKSERVER-KIND:group\r\n" +
				`X-ADDRESSBOOKSERVER-MEMBER:urn:uuid:${sharedContactUid}\r\n` +
				"END:VCARD",
		};

		const groupVCard2: ICloudVCard = {
			url: "https://contacts.icloud.com/123456789/carddavhome/card/group2.vcf",
			etag: '"group2-etag"',
			data:
				"BEGIN:VCARD\r\n" +
				"VERSION:3.0\r\n" +
				"PRODID:-//Apple Inc.//macOS 14.2.1//EN\r\n" +
				`UID:${groupUid2}\r\n` +
				"X-ADDRESSBOOKSERVER-KIND:group\r\n" +
				`X-ADDRESSBOOKSERVER-MEMBER:urn:uuid:${sharedContactUid}\r\n` +
				"END:VCARD",
		};

		const sharedContactVCard: ICloudVCard = {
			url: "https://contacts.icloud.com/123456789/carddavhome/card/shared-contact.vcf",
			etag: '"shared-contact-etag"',
			data:
				"BEGIN:VCARD\r\n" +
				"VERSION:3.0\r\n" +
				"PRODID:-//Apple Inc.//macOS 14.2.1//EN\r\n" +
				"N:Doe;Shared;;;\r\n" +
				"FN:Shared Doe\r\n" +
				`UID:${sharedContactUid}\r\n` +
				"EMAIL;type=INTERNET;type=HOME;type=pref:shared@example.com\r\n" +
				"TEL;type=pref:33333333\r\n" +
				"END:VCARD",
		};

		mockFetchContacts.mockResolvedValueOnce([
			groupVCard1,
			groupVCard2,
			sharedContactVCard,
		]);

		const mockFrontMatter: any = {};
		mockObsidianApi.app.fileManager.processFrontMatter.mockImplementationOnce(
			async (_file: any, fn: any) => {
				fn(mockFrontMatter);
			},
		);

		const settingsWithMultipleGroups: ICloudContactsSettings = {
			...MOCK_DEFAULT_SETTINGS,
			groups: [groupUid1, groupUid2],
		};

		const api = new ICloudContactsApi(
			mockObsidianApi,
			settingsWithMultipleGroups,
			mockFetchContacts,
			mockNoticeShower,
		);

		await api.updateContacts();

		// The contact is a member of two selected groups,
		// but only a single contact file should be created.
		expect(mockObsidianApi.app.vault.create).toHaveBeenCalledTimes(1);
		expect(mockObsidianApi.app.vault.create).toHaveBeenCalledWith(
			"Contacts/Shared Doe.md",
			"# Shared Doe",
		);
		expect(mockFrontMatter).toEqual({
			name: "Shared Doe",
			email: ["shared@example.com"],
			telephone: ["33333333"],
			iCloudVCard: JSON.stringify(sharedContactVCard),
		});
	});

	test("Should not create any files when selected groups have no members", async () => {
		const groupUid = "group-uid-with-no-members";

		const groupVCard: ICloudVCard = {
			url: "https://contacts.icloud.com/123456789/carddavhome/card/group-no-members.vcf",
			etag: '"group-no-members-etag"',
			data:
				"BEGIN:VCARD\r\n" +
				"VERSION:3.0\r\n" +
				"PRODID:-//Apple Inc.//macOS 14.2.1//EN\r\n" +
				`UID:${groupUid}\r\n` +
				"X-ADDRESSBOOKSERVER-KIND:group\r\n" +
				"END:VCARD",
		};

		// A regular contact vCard that is not a member of the selected group
		const contactVCard: ICloudVCard = {
			url: "https://contacts.icloud.com/123456789/carddavhome/card/contact-not-in-group.vcf",
			etag: '"contact-not-in-group-etag"',
			data:
				"BEGIN:VCARD\r\n" +
				"VERSION:3.0\r\n" +
				"PRODID:-//Apple Inc.//macOS 14.2.1//EN\r\n" +
				"N:Doe;NotInGroup;;;}\r\n" +
				"FN:NotInGroup Doe\r\n" +
				"UID:contact-uid-not-in-group\r\n" +
				"EMAIL;type=INTERNET;type=HOME;type=pref:notingroup@example.com\r\n" +
				"TEL;type=pref:22222222\r\n" +
				"END:VCARD",
		};

		// The selected group has no members, and the only contact
		// returned is not in that group
		mockFetchContacts.mockResolvedValueOnce([groupVCard, contactVCard]);

		const settingsWithGroup: ICloudContactsSettings = {
			...MOCK_DEFAULT_SETTINGS,
			groups: [groupUid],
		};

		const api = new ICloudContactsApi(
			mockObsidianApi,
			settingsWithGroup,
			mockFetchContacts,
			mockNoticeShower,
		);

		await api.updateContacts();

		// No contact files should be created when the selected groups have no members
		expect(mockObsidianApi.app.vault.create).not.toHaveBeenCalled();
	});

	test("Should detect settings change when groups array content changes", async () => {
		const groupUid1 = "group-uid-1";
		const groupUid2 = "group-uid-2";
		const contactUid1 = "contact-uid-1";
		const contactUid2 = "contact-uid-2";

		const groupVCard1: ICloudVCard = {
			url: "https://contacts.icloud.com/123456789/carddavhome/card/group1.vcf",
			etag: '"group1-etag"',
			data:
				"BEGIN:VCARD\r\n" +
				"VERSION:3.0\r\n" +
				"PRODID:-//Apple Inc.//macOS 14.2.1//EN\r\n" +
				`UID:${groupUid1}\r\n` +
				"X-ADDRESSBOOKSERVER-KIND:group\r\n" +
				`X-ADDRESSBOOKSERVER-MEMBER:urn:uuid:${contactUid1}\r\n` +
				"END:VCARD",
		};

		const groupVCard2: ICloudVCard = {
			url: "https://contacts.icloud.com/123456789/carddavhome/card/group2.vcf",
			etag: '"group2-etag"',
			data:
				"BEGIN:VCARD\r\n" +
				"VERSION:3.0\r\n" +
				"PRODID:-//Apple Inc.//macOS 14.2.1//EN\r\n" +
				`UID:${groupUid2}\r\n` +
				"X-ADDRESSBOOKSERVER-KIND:group\r\n" +
				`X-ADDRESSBOOKSERVER-MEMBER:urn:uuid:${contactUid2}\r\n` +
				"END:VCARD",
		};

		const contactVCard1: ICloudVCard = {
			url: "https://contacts.icloud.com/123456789/carddavhome/card/contact1.vcf",
			etag: '"contact1-etag"',
			data:
				"BEGIN:VCARD\r\n" +
				"VERSION:3.0\r\n" +
				"PRODID:-//Apple Inc.//macOS 14.2.1//EN\r\n" +
				"N:Doe;Contact One;;;\r\n" +
				"FN:Contact One Doe\r\n" +
				`UID:${contactUid1}\r\n` +
				"EMAIL;type=INTERNET;type=HOME;type=pref:contactone@example.com\r\n" +
				"TEL;type=pref:11111111\r\n" +
				"END:VCARD",
		};

		const contactVCard2: ICloudVCard = {
			url: "https://contacts.icloud.com/123456789/carddavhome/card/contact2.vcf",
			etag: '"contact2-etag"',
			data:
				"BEGIN:VCARD\r\n" +
				"VERSION:3.0\r\n" +
				"PRODID:-//Apple Inc.//macOS 14.2.1//EN\r\n" +
				"N:Doe;Contact Two;;;\r\n" +
				"FN:Contact Two Doe\r\n" +
				`UID:${contactUid2}\r\n` +
				"EMAIL;type=INTERNET;type=HOME;type=pref:contacttwo@example.com\r\n" +
				"TEL;type=pref:22222222\r\n" +
				"END:VCARD",
		};

		// First run: groups contains only groupUid1, so only Contact One is created.
		mockFetchContacts.mockResolvedValueOnce([
			groupVCard1,
			groupVCard2,
			contactVCard1,
			contactVCard2,
		]);
		mockObsidianApi.app.vault.adapter.list.mockResolvedValueOnce({
			files: [],
			folders: [],
		});

		const firstRunSettings: ICloudContactsSettings = {
			...MOCK_DEFAULT_SETTINGS,
			groups: [groupUid1],
			previousUpdateSettings: undefined,
			previousUpdateData: [],
		};

		const apiFirst = new ICloudContactsApi(
			mockObsidianApi,
			firstRunSettings,
			mockFetchContacts,
			mockNoticeShower,
		);

		const { updateData, usedSettings } = await apiFirst.updateContacts();

		// Verify that the first run created the file for Contact One
		expect(mockObsidianApi.app.vault.create).toHaveBeenCalledTimes(1);
		expect(mockObsidianApi.app.vault.create).toHaveBeenCalledWith(
			"Contacts/Contact One Doe.md",
			"# Contact One Doe",
		);

		// Prepare mocks for the second run: one existing file for Contact One
		mockObsidianApi.app.vault.adapter.list.mockResolvedValueOnce({
			files: ["Contacts/Contact One Doe.md"],
			folders: [],
		});
		mockObsidianApi.app.metadataCache.getCache.mockImplementation(
			(path: string) => {
				if (path === "Contacts/Contact One Doe.md") {
					return {
						frontmatter: {
							name: "Contact One Doe",
							iCloudVCard: JSON.stringify(contactVCard1),
						},
					};
				}
				return null;
			},
		);
		mockObsidianApi.app.vault.getFileByPath.mockImplementation(
			(path: string) => {
				if (path === "Contacts/Contact One Doe.md") {
					return { basename: "Contact One Doe" } as any;
				}
				return null;
			},
		);

		// Second run: groups contains only groupUid2, so Contact One
		// should be moved to the Deleted folder and Contact Two created.
		mockFetchContacts.mockResolvedValueOnce([
			groupVCard1,
			groupVCard2,
			contactVCard1,
			contactVCard2,
		]);

		const secondRunSettings: ICloudContactsSettings = {
			...MOCK_DEFAULT_SETTINGS,
			groups: [groupUid2],
			previousUpdateSettings: usedSettings,
			previousUpdateData: updateData,
		};

		const apiSecond = new ICloudContactsApi(
			mockObsidianApi,
			secondRunSettings,
			mockFetchContacts,
			mockNoticeShower,
		);

		await apiSecond.updateContacts();

		// Existing file (Contact One) should have been moved to the Deleted folder
		expect(
			mockObsidianApi.app.fileManager.renameFile,
		).toHaveBeenCalledTimes(1);
		expect(mockObsidianApi.app.fileManager.renameFile).toHaveBeenCalledWith(
			{ basename: "Contact One Doe" },
			"Contacts/Deleted/Contact One Doe.md",
		);

		// And a new file for Contact Two should have been created
		expect(mockObsidianApi.app.vault.create).toHaveBeenCalledTimes(2);
		expect(mockObsidianApi.app.vault.create).toHaveBeenNthCalledWith(
			2,
			"Contacts/Contact Two Doe.md",
			"# Contact Two Doe",
		);
	});

	test("Should detect settings change when groups array length changes", async () => {
		mockFetchContacts.mockResolvedValueOnce([]);

		const previousSettings: ICloudContactsSettings = {
			...MOCK_DEFAULT_SETTINGS,
			groups: [],
			previousUpdateSettings: undefined,
			previousUpdateData: [],
		};

		const currentSettings: ICloudContactsSettings = {
			...MOCK_DEFAULT_SETTINGS,
			groups: ["group-uid-1"],
			previousUpdateSettings: previousSettings,
			previousUpdateData: [],
		};

		const api = new ICloudContactsApi(
			mockObsidianApi,
			currentSettings,
			mockFetchContacts,
			mockNoticeShower,
		);

		await api.updateContacts();

		// The final summary notice should indicate that settings changed
		// and that all contacts were updated to reflect the new settings.
		expect(mockNoticeShower).toHaveBeenCalledTimes(2);
		const summaryCall =
			mockNoticeShower.mock.calls[mockNoticeShower.mock.calls.length - 1];
		const summaryMessage = summaryCall[0] as string;
		expect(summaryMessage).toContain(
			"All contacts were updated to reflect new settings",
		);
	});

	test("Should only compare array settings like groups by value and not by reference", async () => {
		mockFetchContacts.mockResolvedValueOnce([]);

		const previousSettings: ICloudContactsSettings = {
			...MOCK_DEFAULT_SETTINGS,
			groups: ["group-uid-1"],
			previousUpdateSettings: undefined,
			previousUpdateData: [],
		};

		const currentSettings: ICloudContactsSettings = {
			...MOCK_DEFAULT_SETTINGS,
			groups: ["group-uid-1"], // same content as previousSettings.groups but different array reference
			previousUpdateSettings: previousSettings,
			previousUpdateData: [],
		};

		const api = new ICloudContactsApi(
			mockObsidianApi,
			currentSettings,
			mockFetchContacts,
			mockNoticeShower,
		);

		await api.updateContacts();

		// When the groups arrays have the same values, a settings change
		// should not be detected even if the array instances differ.
		const summaryCall =
			mockNoticeShower.mock.calls[mockNoticeShower.mock.calls.length - 1];
		const summaryMessage = summaryCall[0] as string;
		expect(summaryMessage).not.toContain(
			"All contacts were updated to reflect new settings",
		);
	});
});

describe("downloadPhotos", () => {
	const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]).buffer;
	const photoUrl = "https://gateway.icloud.com/contacts/1/ck/card/abc";
	const photoVCard = {
		...testVCard,
		data: testVCard.data.replace(
			"REV:",
			`PHOTO;VALUE=uri:${photoUrl}\r\nREV:`,
		),
	};
	const photoSettings = { ...MOCK_DEFAULT_SETTINGS, downloadPhotos: true };
	const mockFetchPhoto =
		jest.fn<(url: string, u: string, p: string) => Promise<ArrayBuffer>>();

	beforeEach(() => {
		jest.clearAllMocks();
		mockObsidianApi.app.vault.getFileByPath.mockReset();
		mockObsidianApi.app.vault.adapter.exists.mockReset();
		mockObsidianApi.app.vault.adapter.exists.mockResolvedValue(false);
		mockObsidianApi.app.metadataCache.getCache.mockReset();
	});

	function createApi(settings: ICloudContactsSettings) {
		return new ICloudContactsApi(
			mockObsidianApi,
			settings,
			mockFetchContacts,
			mockNoticeShower,
			undefined,
			mockFetchPhoto,
		);
	}

	test("Should save the photo and link it in a new contact", async () => {
		const fm: Record<string, any> = {};
		mockObsidianApi.app.fileManager.processFrontMatter.mockImplementationOnce(
			async (_file: any, fn: any) => fn(fm),
		);
		mockFetchContacts.mockResolvedValueOnce([photoVCard]);
		mockFetchPhoto.mockResolvedValueOnce(JPEG);

		await createApi(photoSettings).updateContacts();

		expect(mockFetchPhoto).toHaveBeenCalledWith(
			photoUrl,
			"username",
			"password",
		);
		expect(mockObsidianApi.app.vault.createBinary).toHaveBeenCalledWith(
			"Contacts/Photos/0efc819a-536a-4d77-8070-733ebf12b49c.jpg",
			JPEG,
		);
		expect(fm["photo file"]).toBe(
			"[[Contacts/Photos/0efc819a-536a-4d77-8070-733ebf12b49c.jpg]]",
		);
	});

	test("Should create the file with the photo embedded under the title", async () => {
		mockObsidianApi.app.fileManager.processFrontMatter.mockImplementationOnce(
			async (_file: any, fn: any) => fn({}),
		);
		mockFetchContacts.mockResolvedValueOnce([photoVCard]);
		mockFetchPhoto.mockResolvedValueOnce(JPEG);

		await createApi({
			...photoSettings,
			embedPhoto: true,
		}).updateContacts();

		expect(mockObsidianApi.app.vault.create).toHaveBeenCalledWith(
			"Contacts/Test Nordmann.md",
			"# Test Nordmann\n\n![[Contacts/Photos/0efc819a-536a-4d77-8070-733ebf12b49c.jpg]]\n",
		);
	});

	test("Should keep text written under the photo when updating", async () => {
		const path = "Contacts/Photos/0efc819a-536a-4d77-8070-733ebf12b49c.jpg";
		const fm: Record<string, any> = {
			name: "Test Nordmann",
			"photo file": `[[${path}]]`,
			iCloudVCard: photoVCard,
		};
		mockObsidianApi.app.fileManager.processFrontMatter.mockImplementationOnce(
			async (_file: any, fn: any) => fn(fm),
		);
		mockObsidianApi.app.vault.adapter.list.mockResolvedValueOnce({
			files: ["Contacts/Test Nordmann.md"],
			folders: [],
		});
		mockObsidianApi.app.metadataCache.getCache.mockReturnValue({
			frontmatter: { ...fm },
		});
		mockObsidianApi.app.vault.getFileByPath.mockReturnValue("TFile");
		mockFetchContacts.mockResolvedValueOnce([
			{
				...photoVCard,
				etag: '"newEtag"',
				data: photoVCard.data.replace(photoUrl, photoUrl + "2"),
			},
		]);
		mockFetchPhoto.mockResolvedValueOnce(JPEG);
		let content = `# Test Nordmann\n\n![[${path}]]\n\nMy own notes\n- keep me`;
		mockObsidianApi.app.vault.process.mockImplementation(
			async (_file: any, fn: (data: string) => string) => {
				content = fn(content);
				return content;
			},
		);

		await createApi({
			...photoSettings,
			embedPhoto: true,
			previousUpdateSettings: { ...photoSettings, embedPhoto: true },
		}).updateContacts();

		expect(content).toBe(
			`# Test Nordmann\n\n![[${path}]]\n\nMy own notes\n- keep me`,
		);
		mockObsidianApi.app.vault.process.mockReset();
	});

	test("Should add the embed under the title when embedding is turned on", async () => {
		const path = "Contacts/Photos/0efc819a-536a-4d77-8070-733ebf12b49c.jpg";
		const fm: Record<string, any> = {
			name: "Test Nordmann",
			"photo file": `[[${path}]]`,
			iCloudVCard: photoVCard,
		};
		mockObsidianApi.app.fileManager.processFrontMatter.mockImplementationOnce(
			async (_file: any, fn: any) => fn(fm),
		);
		mockObsidianApi.app.vault.adapter.list.mockResolvedValueOnce({
			files: ["Contacts/Test Nordmann.md"],
			folders: [],
		});
		mockObsidianApi.app.metadataCache.getCache.mockReturnValue({
			frontmatter: { ...fm },
		});
		mockObsidianApi.app.vault.getFileByPath.mockReturnValue("TFile");
		mockFetchContacts.mockResolvedValueOnce([photoVCard]);
		let content = "# Test Nordmann\n\nMy own notes";
		mockObsidianApi.app.vault.process.mockImplementation(
			async (_file: any, fn: (data: string) => string) => {
				content = fn(content);
				return content;
			},
		);

		await createApi({
			...photoSettings,
			embedPhoto: true,
			previousUpdateSettings: { ...photoSettings, embedPhoto: false },
		}).updateContacts();

		expect(content).toBe(`# Test Nordmann\n\n![[${path}]]\n\nMy own notes`);
		mockObsidianApi.app.vault.process.mockReset();
	});

	test("Should not fetch photos when the setting is off", async () => {
		mockObsidianApi.app.fileManager.processFrontMatter.mockImplementationOnce(
			async (_file: any, fn: any) => fn({}),
		);
		mockFetchContacts.mockResolvedValueOnce([photoVCard]);

		await createApi(MOCK_DEFAULT_SETTINGS).updateContacts();

		expect(mockFetchPhoto).not.toHaveBeenCalled();
		expect(mockObsidianApi.app.vault.createBinary).not.toHaveBeenCalled();
	});

	test("Should not send credentials to untrusted photo hosts", async () => {
		const evil = {
			...photoVCard,
			data: photoVCard.data.replace(
				photoUrl,
				"https://evil.example.com/x",
			),
		};
		const fm: Record<string, any> = {};
		mockObsidianApi.app.fileManager.processFrontMatter.mockImplementationOnce(
			async (_file: any, fn: any) => fn(fm),
		);
		mockFetchContacts.mockResolvedValueOnce([evil]);

		await createApi(photoSettings).updateContacts();

		expect(mockFetchPhoto).not.toHaveBeenCalled();
		expect(fm["photo file"]).toBeUndefined();
		expect(fm.name).toBe("Test Nordmann");
	});

	test("Should keep creating the contact when the photo download fails", async () => {
		const fm: Record<string, any> = {};
		mockObsidianApi.app.fileManager.processFrontMatter.mockImplementationOnce(
			async (_file: any, fn: any) => fn(fm),
		);
		mockFetchContacts.mockResolvedValueOnce([photoVCard]);
		mockFetchPhoto.mockRejectedValueOnce(new Error("401"));
		jest.spyOn(console, "error").mockImplementationOnce(() => {});

		await createApi(photoSettings).updateContacts();

		expect(fm.name).toBe("Test Nordmann");
		expect(fm["photo file"]).toBeUndefined();
	});

	test("Should treat a 404 photo as no photo without reporting a failure", async () => {
		const fm: Record<string, any> = {};
		mockObsidianApi.app.fileManager.processFrontMatter.mockImplementationOnce(
			async (_file: any, fn: any) => fn(fm),
		);
		mockFetchContacts.mockResolvedValueOnce([photoVCard]);
		mockFetchPhoto.mockRejectedValueOnce(
			Object.assign(new Error("Request failed, status 404"), {
				status: 404,
			}),
		);

		await createApi(photoSettings).updateContacts();

		expect(fm.name).toBe("Test Nordmann");
		expect(fm["photo file"]).toBeUndefined();
		const notices = mockNoticeShower.mock.calls.map(([m]) => m).join("\n");
		expect(notices).not.toContain("Photos not downloaded");
	});

	test("Should reuse the existing photo when the photo url is unchanged", async () => {
		const link =
			"[[Contacts/Photos/0efc819a-536a-4d77-8070-733ebf12b49c.jpg]]";
		const fm: Record<string, any> = {
			name: "Test Nordmann",
			"photo file": link,
			iCloudVCard: photoVCard,
		};
		mockObsidianApi.app.fileManager.processFrontMatter.mockImplementationOnce(
			async (_file: any, fn: any) => fn(fm),
		);
		mockObsidianApi.app.vault.adapter.list.mockResolvedValueOnce({
			files: ["Contacts/Test Nordmann.md"],
			folders: [],
		});
		mockObsidianApi.app.metadataCache.getCache.mockReturnValue({
			frontmatter: { ...fm },
		});
		mockObsidianApi.app.vault.getFileByPath.mockReturnValue("TFile");
		mockFetchContacts.mockResolvedValueOnce([
			{ ...photoVCard, etag: '"newEtag"' },
		]);

		await createApi(photoSettings).updateContacts();

		expect(mockFetchPhoto).not.toHaveBeenCalled();
		expect(fm["photo file"]).toBe(link);
	});

	test("Should overwrite the photo file when the photo url has changed", async () => {
		const path = "Contacts/Photos/0efc819a-536a-4d77-8070-733ebf12b49c.jpg";
		const fm: Record<string, any> = {
			name: "Test Nordmann",
			"photo file": `[[${path}]]`,
			iCloudVCard: photoVCard,
		};
		mockObsidianApi.app.fileManager.processFrontMatter.mockImplementationOnce(
			async (_file: any, fn: any) => fn(fm),
		);
		mockObsidianApi.app.vault.adapter.list.mockResolvedValueOnce({
			files: ["Contacts/Test Nordmann.md"],
			folders: [],
		});
		mockObsidianApi.app.metadataCache.getCache.mockReturnValue({
			frontmatter: { ...fm },
		});
		mockObsidianApi.app.vault.getFileByPath.mockReturnValue("TFile");
		mockFetchContacts.mockResolvedValueOnce([
			{
				...photoVCard,
				etag: '"newEtag"',
				data: photoVCard.data.replace(photoUrl, photoUrl + "2"),
			},
		]);
		mockFetchPhoto.mockResolvedValueOnce(JPEG);

		await createApi(photoSettings).updateContacts();

		expect(mockFetchPhoto).toHaveBeenCalledTimes(1);
		expect(mockObsidianApi.app.vault.modifyBinary).toHaveBeenCalledWith(
			"TFile",
			JPEG,
		);
		expect(fm["photo file"]).toBe(`[[${path}]]`);
	});

	test("Should remove the photo property when the photo is removed in iCloud", async () => {
		const fm: Record<string, any> = {
			name: "Test Nordmann",
			"photo file": "[[Contacts/Photos/x.jpg]]",
			iCloudVCard: photoVCard,
		};
		mockObsidianApi.app.fileManager.processFrontMatter.mockImplementationOnce(
			async (_file: any, fn: any) => fn(fm),
		);
		mockObsidianApi.app.vault.adapter.list.mockResolvedValueOnce({
			files: ["Contacts/Test Nordmann.md"],
			folders: [],
		});
		mockObsidianApi.app.metadataCache.getCache.mockReturnValue({
			frontmatter: { ...fm },
		});
		mockObsidianApi.app.vault.getFileByPath.mockReturnValue("TFile");
		mockFetchContacts.mockResolvedValueOnce([
			{ ...testVCard, etag: '"newEtag"' },
		]);

		await createApi(photoSettings).updateContacts();

		expect(fm["photo file"]).toBeUndefined();
	});
});

describe("customContent", () => {
	const content = '```dataviewjs\ndv.view("Scripts/Contact")\n```';
	const block = content;
	const settings = { ...MOCK_DEFAULT_SETTINGS, customContent: content };
	const existingFm = {
		name: "Test Nordmann",
		iCloudVCard: testVCard,
	};

	beforeEach(() => {
		jest.clearAllMocks();
		mockObsidianApi.app.vault.getFileByPath.mockReset();
		mockObsidianApi.app.vault.getFileByPath.mockReturnValue("TFile");
		mockObsidianApi.app.vault.adapter.exists.mockReset();
		mockObsidianApi.app.vault.adapter.exists.mockResolvedValue(false);
		mockObsidianApi.app.metadataCache.getCache.mockReset();
	});

	function createApi(s: ICloudContactsSettings) {
		return new ICloudContactsApi(
			mockObsidianApi,
			s,
			mockFetchContacts,
			mockNoticeShower,
		);
	}

	function mockExistingFile(initial: string) {
		let content = initial;
		mockObsidianApi.app.fileManager.processFrontMatter.mockImplementationOnce(
			async (_file: any, fn: any) => fn({ ...existingFm }),
		);
		mockObsidianApi.app.vault.adapter.list.mockResolvedValueOnce({
			files: ["Contacts/Test Nordmann.md"],
			folders: [],
		});
		mockObsidianApi.app.metadataCache.getCache.mockReturnValue({
			frontmatter: { ...existingFm },
		});
		mockObsidianApi.app.vault.process.mockImplementation(
			async (_file: any, fn: (data: string) => string) => {
				content = fn(content);
				return content;
			},
		);
		return () => content;
	}

	test("Should create the file with the content under the title", async () => {
		mockObsidianApi.app.fileManager.processFrontMatter.mockImplementationOnce(
			async (_file: any, fn: any) => fn({}),
		);
		mockFetchContacts.mockResolvedValueOnce([testVCard]);

		await createApi(settings).updateContacts();

		expect(mockObsidianApi.app.vault.create).toHaveBeenCalledWith(
			"Contacts/Test Nordmann.md",
			`# Test Nordmann\n\n${block}\n`,
		);
	});

	test("Should create the file without the title when it is turned off", async () => {
		mockObsidianApi.app.fileManager.processFrontMatter.mockImplementationOnce(
			async (_file: any, fn: any) => fn({}),
		);
		mockFetchContacts.mockResolvedValueOnce([testVCard]);

		await createApi({ ...settings, isNameHeading: false }).updateContacts();

		expect(mockObsidianApi.app.vault.create).toHaveBeenCalledWith(
			"Contacts/Test Nordmann.md",
			`${block}\n`,
		);
	});

	test("Should not add anything when the setting is empty", async () => {
		mockObsidianApi.app.fileManager.processFrontMatter.mockImplementationOnce(
			async (_file: any, fn: any) => fn({}),
		);
		mockFetchContacts.mockResolvedValueOnce([testVCard]);

		await createApi(MOCK_DEFAULT_SETTINGS).updateContacts();

		expect(mockObsidianApi.app.vault.create).toHaveBeenCalledWith(
			"Contacts/Test Nordmann.md",
			"# Test Nordmann",
		);
	});

	test("Should add the block to an existing file without touching what is already written", async () => {
		const own = '```dataviewjs\ndv.view("Own/Script")\n```';
		const getContent = mockExistingFile(
			`# Test Nordmann\n\n${own}\n\nMy own notes\n- keep me`,
		);
		mockFetchContacts.mockResolvedValueOnce([testVCard]);

		await createApi({
			...settings,
			previousUpdateSettings: { ...settings, customContent: undefined },
		}).updateContacts();

		expect(getContent()).toBe(
			`# Test Nordmann\n\n${block}\n\n${own}\n\nMy own notes\n- keep me`,
		);
		mockObsidianApi.app.vault.process.mockReset();
	});

	test("Should update only the block when the content is changed", async () => {
		const getContent = mockExistingFile(
			"# Test Nordmann\n\nold\n\nMy own notes",
		);
		mockFetchContacts.mockResolvedValueOnce([testVCard]);

		await createApi({
			...settings,
			previousUpdateSettings: { ...settings, customContent: "old" },
		}).updateContacts();

		expect(getContent()).toBe(
			`# Test Nordmann\n\n${block}\n\nMy own notes`,
		);
		mockObsidianApi.app.vault.process.mockReset();
	});

	test("Should not add the content again when the user edited or removed it", async () => {
		const getContent = mockExistingFile("# Test Nordmann\n\nMy own notes");
		mockFetchContacts.mockResolvedValueOnce([testVCard]);

		await createApi({
			...settings,
			previousUpdateSettings: settings,
		}).updateContacts();

		expect(getContent()).toBe("# Test Nordmann\n\nMy own notes");
		mockObsidianApi.app.vault.process.mockReset();
	});

	test("Should remove only the block when the setting is cleared", async () => {
		const getContent = mockExistingFile(
			`# Test Nordmann\n\n${block}\n\nMy own notes`,
		);
		mockFetchContacts.mockResolvedValueOnce([testVCard]);

		await createApi({
			...settings,
			customContent: "",
			previousUpdateSettings: settings,
		}).updateContacts();

		expect(getContent()).toBe("# Test Nordmann\n\nMy own notes");
		mockObsidianApi.app.vault.process.mockReset();
	});

	test("Should not rewrite the file when the setting has never been used", async () => {
		const getContent = mockExistingFile("# Test Nordmann\n\nMy own notes");
		mockFetchContacts.mockResolvedValueOnce([testVCard]);

		await createApi({
			...MOCK_DEFAULT_SETTINGS,
			previousUpdateSettings: undefined,
		}).updateContacts();

		expect(getContent()).toBe("# Test Nordmann\n\nMy own notes");
		mockObsidianApi.app.vault.process.mockReset();
	});
});
