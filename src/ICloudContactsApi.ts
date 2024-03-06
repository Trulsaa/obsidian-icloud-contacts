import { ICloudContactsSettings, compareSettings } from "./SettingTab";
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
		try {
			const startNotice = this.showNotice(
				`${pluginName}: Updating contacts...`,
				0,
			);
			this.validateSettings();
			await this.getCreateFolder(this.settings.folder);
			const iCloudVCards = await this.fetchContacts(
				this.settings.username,
				this.settings.password,
			);

			const existingContacts = await this.getAllCurrentProperties(
				this.settings.folder,
			);

			const previousUpdateData = this.settings.previousUpdateData || [];

			for (const iCloudVCard of iCloudVCards) {
				const previousUpdateVCard = previousUpdateData.find(
					(vCard) => vCard.url === iCloudVCard.url,
				);
				const existingContactFrontmatter = existingContacts.find(
					(c) => c[iCloudVCardPropertieName].url === iCloudVCard.url,
				);

				if (
					this.settings.previousUpdateSettings &&
					compareSettings(
						this.settings,
						this.settings.previousUpdateSettings,
					)
				)
					options.rewriteAll = true;

				await this.processVCard(
					previousUpdateVCard,
					iCloudVCard,
					options,
					existingContactFrontmatter,
				);
			}

			await this.moveDeletedContacts(existingContacts, iCloudVCards);

			startNotice.hide();
			this.reportHappenings();
			return [
				...this.newContacts,
				...this.modifiedContacts,
				...this.skippedContacts,
			];
		} catch (e) {
			console.error(e);
			this.handleError("Error when running updateContacts", e, {
				options,
			});
		}
		return [];
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
		previousVCard: ICloudVCard | undefined,
		iCloudVCard: ICloudVCard,
		options: { rewriteAll: boolean },
		existingContactFrontmatter?: Properties,
	) {
		try {
			if (existingContactFrontmatter) {
				const isModified = this.isModified(
					existingContactFrontmatter,
					iCloudVCard,
				);
				if (isModified || options.rewriteAll) {
					await this.updateContactFile(
						iCloudVCard,
						existingContactFrontmatter,
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

	private reportHappenings() {
		let noticeText = pluginName + ":\n";
		if (this.newContacts.length > 0)
			noticeText += `Created ${this.newContacts.length}\n`;
		if (this.modifiedContacts.length > 0)
			noticeText += `Modified ${this.modifiedContacts.length}\n`;
		if (this.deletedContacts.length > 0)
			noticeText += `Deleted ${this.deletedContacts.length}\n`;
		if (this.skippedContacts.length > 0)
			noticeText += `Skipped ${this.skippedContacts.length}\n`;
		this.showNotice(noticeText, 7000);
		console.log(pluginName, {
			newContacts: this.newContacts,
			modifiedContacts: this.modifiedContacts,
			deletedContacts: this.deletedContacts,
			skippedContacts: this.skippedContacts,
		});
	}

	private async moveDeletedContacts(
		existingFrontmatter: Properties[],
		iCloudVCards: ICloudVCard[],
	) {
		this.deletedContacts = existingFrontmatter
			.filter(
				(c) =>
					!iCloudVCards.some(
						(i) => i.url === c[iCloudVCardPropertieName].url,
					),
			)
			.map((c) => c[iCloudVCardPropertieName]);

		if (this.deletedContacts.length > 0) {
			const folderPath = this.settings.folder + "/" + deletedFolder;
			await this.getCreateFolder(folderPath);
		}

		// Move deleted contacts to deleted folder
		for (const deletedContact of this.deletedContacts) {
			await this.moveDeletedContact(deletedContact);
		}
	}

	private async moveDeletedContact(iCloudVCard: ICloudVCard) {
		try {
			const deletedContactFullName = getFullName(iCloudVCard.data);
			await this.renameContactFile(
				deletedContactFullName,
				deletedFolder + "/" + deletedContactFullName,
			);
		} catch (e) {
			this.handleError(
				"Error trying to move deleted contact",
				e,
				iCloudVCard,
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
		existingFrontmatter: Properties,
		previousVCard: ICloudVCard | undefined,
	) {
		const newFullName = getFullName(iCloudVCard.data);
		if (!existingFrontmatter[iCloudVCardPropertieName].data) {
			throw new Error(
				`existingContact.properties[${iCloudVCardPropertieName}].data is missing`,
			);
		}

		const contactFile = this.getContactFile(existingFrontmatter.name);
		if (!contactFile) {
			throw new Error("contactFile not found");
		}

		const isFullNameModified = existingFrontmatter.name !== newFullName;
		if (isFullNameModified) {
			await this.renameContactFile(existingFrontmatter.name, newFullName);
			await this.app.vault.process(contactFile, (data) => {
				return data.replace(
					`# ${existingFrontmatter.name}`,
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

		let prevFrontMatter: Properties;
		if (previousVCard && this.settings.previousUpdateSettings)
			prevFrontMatter = createFrontmatter(
				parseVCard(previousVCard.data) as VCards[],
				getFullName(previousVCard.data),
				this.settings.previousUpdateSettings,
			);

		await this.app.fileManager.processFrontMatter(
			contactFile,
			(fileFrontmatter) => {
				for (const [key] of Object.entries(prevFrontMatter)) {
					// If the kay exists in prev but not in new delete it
					if (!newFrontMatter[key]) {
						delete fileFrontmatter[key];
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

	private getContactFile(fullName: string) {
		const fileName = `${fullName}.md`;
		const filePath = this.settings.folder + "/" + fileName;
		const contactFile = this.app.vault.getFileByPath(
			this.normalizePath(filePath),
		);
		return contactFile;
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
		existingContactFullName: string,
		fullName: string | string[],
	) {
		const existingContactFilePath = this.normalizePath(
			this.settings.folder + "/" + existingContactFullName + ".md",
		);
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

	private async getAllCurrentProperties(folder: string) {
		// Get all files in folder
		const listedFiles = await this.app.vault.adapter.list(folder);
		return Promise.all(
			listedFiles.files
				.filter(
					(fileName) =>
						fileName.endsWith(".md") &&
						!fileName.includes(errorsFileName),
				)
				.map((fileName) => this.getContactProperties(fileName)),
		);
	}

	private async getContactProperties(filePath: string) {
		const cache = this.app.metadataCache.getCache(filePath);
		if (!cache) {
			throw new Error(`cache is falsy in ${filePath}`);
		}
		const frontmatter = cache.frontmatter;
		if (!frontmatter) {
			throw new Error(`frontmatter is falsy in ${filePath})}`);
		}
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
