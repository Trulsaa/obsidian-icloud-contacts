import { ICloudContactsSettings } from "./SettingTab";
import { VCards } from "./VCards";
import { createFrontmatter } from "./frontMatter";
import { getFullName, parseVCard } from "./parser";

export type ICloudVCard = {
	url: string;
	etag: string;
	data: string;
};

type Properties = {
	[key: string]: any;
};

const deletedFolder = "Deleted";
const iCloudVCardPropertieName = "iCloudVCard";
const errorsFileName = "Errors";
const pluginName = "iCloud Contacts";

interface ListedFiles {
	files: string[];
	folders: string[];
}

type TAbstractFile = {
	vault: Vault;
	path: string;
	name: string;
	parent: TFolder | null;
};

type Vault = {
	adapter: {
		list: (normalizedPath: string) => Promise<ListedFiles>;
		write: (normalizedPath: string, data: string) => Promise<void>;
	};
	append: (file: TFile, data: string) => Promise<void>;
	create: (path: string, data: string) => Promise<TFile>;
	createFolder: (path: string) => Promise<TFolder>;
	getFileByPath: (path: string) => TFile | null;
	getFolderByPath: (path: string) => TFolder | null;
	process: (file: TFile, fn: (data: string) => string) => Promise<string>;
};

type TFile = {
	stat: {
		ctime: number;
		mtime: number;
		size: number;
	};
	basename: string;
	extension: string;
} & TAbstractFile;

type TFolder = {
	children: TAbstractFile[];
	isRoot: () => boolean;
};

export type CachedMetadata = { frontmatter?: Properties };

export interface OnlyRequiredFromObsidianApi {
	normalizePath: (path: string) => string;
	app: {
		fileManager: {
			processFrontMatter: (
				file: TFile,
				fn: (frontmatter: any) => void,
			) => Promise<void>;
			renameFile: (file: TFile, newPath: string) => Promise<void>;
		};
		vault: Vault;
		workspace: {
			getLeaf: () => {
				openFile: (file: TFile) => Promise<void>;
			};
		};
		metadataCache: {
			getCache: (path: string) => CachedMetadata | null;
		};
	};
}

type NoticeShower = (
	message: string,
	duration: number,
) => {
	setMessage: (message: string) => void;
	hide: () => void;
};

export default class ICloudContactsApi {
	private app: OnlyRequiredFromObsidianApi["app"];
	private normalizePath: OnlyRequiredFromObsidianApi["normalizePath"];
	private newContacts: ICloudVCard[] = [];
	private modifiedContacts: ICloudVCard[] = [];
	private deletedContacts: ICloudVCard[] = [];
	private skippedContacts: ICloudVCard[] = [];

	constructor(
		onlyRequiredFromObsidianApp: OnlyRequiredFromObsidianApi,
		private settings: ICloudContactsSettings,
		private fetchContacts: (
			username: string,
			password: string,
		) => Promise<ICloudVCard[]>,
		private showNotice: NoticeShower,
	) {
		this.app = onlyRequiredFromObsidianApp.app;
		this.normalizePath = onlyRequiredFromObsidianApp.normalizePath;
	}

	async updateContacts(options = { rewriteAll: false }) {
		const haveSettingsChanged =
			!!this.settings.previousUpdateSettings &&
			!this.isSameSettings(
				this.settings,
				this.settings.previousUpdateSettings,
			);
		if (haveSettingsChanged) options.rewriteAll = true;
		const startNotice = this.showNotice(
			`${pluginName}: Updating contacts...`,
			0,
		);

		try {
			this.validateSettings();
			await this.getCreateFolder(this.settings.folder);
			const iCloudVCards = await this.fetchContacts(
				this.settings.username,
				this.settings.password,
			);

			const existingContacts = await this.getAllCurrentContacts(
				this.settings.folder,
			);

			const previousUpdateData = this.settings.previousUpdateData || [];

			for (const iCloudVCard of iCloudVCards) {
				const previousUpdateVCard = previousUpdateData.find(
					(vCard) => vCard.url === iCloudVCard.url,
				);
				const existingContact = existingContacts.find(
					(c) =>
						c.frontmatter[iCloudVCardPropertieName].url ===
						iCloudVCard.url,
				);

				await this.processVCard(
					iCloudVCard,
					previousUpdateVCard,
					existingContact,
					options,
				);
			}

			await this.moveDeletedContacts(existingContacts, iCloudVCards);
		} catch (e) {
			console.error(e);
			this.handleError("Error when running updateContacts", e, {
				options,
			});
		}
		const usedSettings = { ...this.settings };

		const updateData = [
			...this.newContacts,
			...this.modifiedContacts,
			...this.skippedContacts,
		];

		startNotice.hide();
		this.reportHappenings(haveSettingsChanged);

		this.newContacts = [];
		this.modifiedContacts = [];
		this.deletedContacts = [];
		this.skippedContacts = [];

		return { updateData, usedSettings };
	}

	private validateSettings() {
		if (!this.settings.username) {
			throw new Error("ICloud username is required in settings");
		}
		if (!this.settings.password) {
			throw new Error(
				"ICloud app specific password is required in settings",
			);
		}
	}

	private async processVCard(
		iCloudVCard: ICloudVCard,
		previousVCard: ICloudVCard | undefined,
		existingContact: { frontmatter: Properties; path: string } | undefined,
		options: { rewriteAll: boolean },
	) {
		try {
			if (existingContact) {
				const isModified = this.isModified(
					existingContact.frontmatter,
					iCloudVCard,
				);
				if (isModified || options.rewriteAll) {
					await this.updateContactFile(
						iCloudVCard,
						existingContact,
						previousVCard,
					);
					this.modifiedContacts.push(iCloudVCard);
				} else {
					this.skippedContacts.push(iCloudVCard);
				}
				return;
			}

			await this.createContactFile(iCloudVCard);
			this.newContacts.push(iCloudVCard);
		} catch (e) {
			this.handleError("Error trying to process contact", e, iCloudVCard);
		}
	}

	private reportHappenings(haveSettingsChanged: boolean) {
		let noticeText = pluginName + ":\n";
		if (this.newContacts.length > 0)
			noticeText += `Created ${this.newContacts.length}\n`;
		if (this.modifiedContacts.length > 0)
			noticeText += `Modified ${this.modifiedContacts.length}\n`;
		if (this.deletedContacts.length > 0)
			noticeText += `Deleted ${this.deletedContacts.length}\n`;
		if (this.skippedContacts.length > 0)
			noticeText += `Skipped ${this.skippedContacts.length}\n`;
		if (haveSettingsChanged)
			noticeText += "All contacts where updated to reflect new settings";
		this.showNotice(noticeText, 7000);
		console.log(pluginName, {
			newContacts: this.newContacts,
			modifiedContacts: this.modifiedContacts,
			deletedContacts: this.deletedContacts,
			skippedContacts: this.skippedContacts,
		});
	}

	private async moveDeletedContacts(
		existingContacts: { frontmatter: Properties; path: string }[],
		iCloudVCards: ICloudVCard[],
	) {
		const deletedContacts = existingContacts.filter(
			(c) =>
				!iCloudVCards.some(
					(i) =>
						i.url === c.frontmatter[iCloudVCardPropertieName].url,
				),
		);

		this.deletedContacts = deletedContacts.map(
			(c) => c.frontmatter[iCloudVCardPropertieName],
		);
		if (deletedContacts.length > 0) {
			const folderPath = this.settings.folder + "/" + deletedFolder;
			await this.getCreateFolder(folderPath);
		}

		// Move deleted contacts to deleted folder
		for (const deletedContact of deletedContacts) {
			await this.moveDeletedContact(deletedContact);
		}
	}

	private async moveDeletedContact(deletedContact: {
		frontmatter: Properties;
		path: string;
	}) {
		try {
			await this.renameContactFile(
				deletedContact.path,
				deletedFolder +
					deletedContact.path
						.replace(this.settings.folder, "")
						.replace(".md", ""),
			);
		} catch (e) {
			this.handleError(
				"Error trying to move deleted contact",
				e,
				deletedContact.frontmatter[iCloudVCardPropertieName],
			);
		}
	}

	private isModified(
		existingFrontmatter: Properties,
		iCloudVCard: ICloudVCard,
	) {
		return (
			existingFrontmatter[iCloudVCardPropertieName].etag !==
			iCloudVCard.etag
		);
	}

	private async updateContactFile(
		iCloudVCard: ICloudVCard,
		existingContact: { frontmatter: Properties; path: string },
		previousVCard: ICloudVCard | undefined,
	) {
		const newFullName = getFullName(iCloudVCard.data);

		const contactFile = this.app.vault.getFileByPath(
			this.normalizePath(existingContact.path),
		);
		if (!contactFile) {
			throw new Error("contactFile not found");
		}

		const isFullNameModified =
			existingContact.frontmatter.name !== newFullName;
		if (isFullNameModified) {
			await this.renameContactFile(existingContact.path, newFullName);
			await this.app.vault.process(contactFile, (data) => {
				return data.replace(
					`# ${existingContact.frontmatter.name}`,
					`# ${newFullName}`,
				);
			});
		}

		const parsedVCard = parseVCard(iCloudVCard.data);
		const newFrontMatter = createFrontmatter(
			parsedVCard as VCards[],
			newFullName,
			this.settings,
		);

		const previousData = previousVCard
			? previousVCard.data
			: existingContact.frontmatter[iCloudVCardPropertieName].data;
		const prevFrontMatter = createFrontmatter(
			parseVCard(previousData) as VCards[],
			getFullName(previousData),
			this.settings.previousUpdateSettings || this.settings,
		);

		await this.app.fileManager.processFrontMatter(
			contactFile,
			(fileFrontmatter) => {
				if (prevFrontMatter) {
					for (const [key] of Object.entries(prevFrontMatter)) {
						// If the kay exists in prev but not in new delete it
						if (!newFrontMatter[key]) {
							delete fileFrontmatter[key];
						}
					}
				}
				for (const [key, value] of Object.entries(newFrontMatter)) {
					fileFrontmatter[key] = value;
				}
				fileFrontmatter[iCloudVCardPropertieName] =
					JSON.stringify(iCloudVCard);
			},
		);
	}

	private async createContactFile(iCloudVCard: ICloudVCard) {
		if (!iCloudVCard.data) {
			throw new Error("iCloudVCard.data is undefined");
		}

		const parsedVCards = parseVCard(iCloudVCard.data);
		const fullName = getFullName(iCloudVCard.data);
		const frontMatter = createFrontmatter(
			parsedVCards as VCards[],
			fullName,
			this.settings,
		);
		const filePath = `${this.settings.folder}/${fullName}.md`;
		const newFile = await this.app.vault.create(
			filePath.replace(/\\/g, ""),
			`# ${fullName}`,
		);
		await this.app.fileManager.processFrontMatter(newFile, (fm) => {
			for (const [key, value] of Object.entries(frontMatter)) {
				fm[key] = value;
			}
			fm[iCloudVCardPropertieName] = JSON.stringify(iCloudVCard);
		});
	}

	private async renameContactFile(
		existingContactFilePath: string,
		fullName: string | string[],
	) {
		const contactFile = this.app.vault.getFileByPath(
			existingContactFilePath,
		);
		if (!contactFile)
			throw new Error(existingContactFilePath + " not found");
		await this.app.fileManager.renameFile(
			contactFile,
			this.normalizePath(this.settings.folder + "/" + fullName + ".md"),
		);
	}

	private async getAllCurrentContacts(folder: string) {
		// Get all files in folder
		const listedFiles = await this.app.vault.adapter.list(folder);
		const contacts = listedFiles.files
			.filter(
				(path) =>
					path.endsWith(".md") && !path.includes(errorsFileName),
			)
			.map((path) => ({
				frontmatter: this.getContactProperties(path),
				path,
			}))
			.filter((x) => x.frontmatter !== undefined);
		return contacts as { frontmatter: Properties; path: string }[];
	}

	private getContactProperties(filePath: string) {
		const cache = this.app.metadataCache.getCache(filePath);
		if (!cache) {
			throw new Error(`cache is falsy in ${filePath}`);
		}
		const frontmatter = cache.frontmatter;
		if (!frontmatter || !frontmatter[iCloudVCardPropertieName])
			return undefined;

		if (typeof frontmatter[iCloudVCardPropertieName] === "string")
			if (frontmatter[iCloudVCardPropertieName])
				frontmatter[iCloudVCardPropertieName] = JSON.parse(
					frontmatter[iCloudVCardPropertieName],
				);
		return frontmatter;
	}

	private async getCreateFolder(folderPath: string) {
		try {
			const folder = this.app.vault.getFolderByPath(folderPath);
			if (folder) return folder;
			return this.app.vault.createFolder(folderPath);
		} catch (error) {
			this.handleError(
				`Error trying to create the ${folderPath} folder`,
				error,
				{ folderPath },
			);
		}
	}

	private isSameSettings(
		a: ICloudContactsSettings,
		b: ICloudContactsSettings,
	) {
		const result = Object.entries(a)
			.filter(
				([key]) =>
					key !== "previousUpdateSettings" &&
					key !== "previousUpdateData",
			)
			.every(([key, value]) => value == b[key]);
		return result;
	}

	private async createErrorFile() {
		const filePath = this.settings.folder + "/" + `${errorsFileName}.md`;
		const file = this.app.vault.getFileByPath(filePath);
		if (file) return file;
		return await this.app.vault.create(filePath, "");
	}

	private async handleError(heading: string, error: Error, data?: any) {
		let errorText = `## ${heading}
### Error message

${error.message}
`;
		if (data)
			errorText += `### Data

\`\`\`json
${JSON.stringify(data)}
\`\`\`
`;

		const errorFile = await this.createErrorFile();
		if (errorFile) {
			await this.app.vault.append(errorFile, errorText);
			await this.app.workspace.getLeaf().openFile(errorFile);
		}
	}
}
