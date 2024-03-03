import { describe, expect, jest, test } from "@jest/globals";
import ICloudContactsApi, { ICloudVCard } from "./ICloudContactsApi";
import { ICloudContactsSettings } from "./SettingTab";

const mockObsidianApi = {
	normalizePath: jest.fn<(path: string) => string>(),
	parseYaml: jest.fn<(yaml: string) => any>(),
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
				list: jest.fn<(normalizePath: string) => Promise<any>>(),
				stat: jest.fn<(normalizePath: string) => Promise<any | null>>(),
				write: jest.fn<
					(
						normalizePath: string,
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
			getFileByPath: jest.fn<(path: string) => any>(),
			getFolderByPath: jest.fn<(path: string) => any>(),
			process:
				jest.fn<
					(
						file: any,
						fn: (data: string) => string,
						options?: any,
					) => Promise<string>
				>(),
			read: jest.fn<(file: any) => Promise<string>>(),
		},
		workspace: {
			getLeaf: () => ({
				openFile:
					jest.fn<(file: any, openState?: any) => Promise<void>>(),
			}),
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

export const DEFAULT_SETTINGS: ICloudContactsSettings = {
	username: "username",
	password: "password",
	folder: "Contacts",
	telLabels: false,
	emailLabels: false,
	urlLabels: false,
	relatedLabels: false,
	excludedKeys:
		"n photo prodid rev uid version xAbadr xAbLabel xAblabel xAbShowAs xImagehash xImagetype xSharedPhotoDisplayPref xAddressingGrammar xAppleSubadministrativearea xAppleSublocality",
};

const mockListedFiles = {
	files: [],
	folders: [],
};

describe("updateContacts", () => {
	test("Should handle no files of iCloudVCards", () => {
		mockFetchContacts.mockResolvedValueOnce([]);
		mockObsidianApi.app.vault.adapter.list.mockResolvedValueOnce(
			mockListedFiles,
		);

		const api = new ICloudContactsApi(
			mockObsidianApi,
			DEFAULT_SETTINGS,
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
			DEFAULT_SETTINGS,
			mockFetchContacts,
			mockNoticeShower,
		);
		await api.updateContacts();
		expect(mockObsidianApi.app.vault.append).toHaveBeenCalledWith(
			"errorFile",
			expect.stringContaining("error"),
		);
	});
});
