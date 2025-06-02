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
		expect(api.updateContacts()).resolves.not.toThrow();
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
			// THIS LINE CREATES HELL .spyOn(String.prototype, "replace")
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
			// THIS LINE CREATES HELL .spyOn(String.prototype, "replace")
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
			// THIS LINE CREATES HELL .spyOn(String.prototype, "replace")
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
			// THIS LINE CREATES HELL .spyOn(String.prototype, "replace")
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
});
