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
	[key: string]: string | string[] | ICloudVCard;
	iCloudVCard: ICloudVCard;
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
	read: (file: TFile) => Promise<string>;
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

export interface OnlyRequiredFromObsidianApi {
	normalizePath: (path: string) => string;
	parseYaml: (yaml: string) => any;
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
	private parseYaml: OnlyRequiredFromObsidianApi["parseYaml"];
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
		private noticeShower: NoticeShower,
	) {
		this.app = onlyRequiredFromObsidianApp.app;
		this.normalizePath = onlyRequiredFromObsidianApp.normalizePath;
		this.parseYaml = onlyRequiredFromObsidianApp.parseYaml;
	}

	async updateContacts(options = { rewriteAll: false }) {
		try {
			const startNotice = this.noticeShower(
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

			for (const iCloudVCard of iCloudVCards) {
				await this.processVCard(existingContacts, iCloudVCard, options);
			}

			await this.moveDeletedContacts(existingContacts, iCloudVCards);

			await this.app.vault.adapter.write(
				".obsidian/plugins/icloud-contacts/lastDownloadedICloudVCards.json",
				JSON.stringify(iCloudVCards),
			);
			startNotice.hide();
			this.reportHappenings();
		} catch (e) {
			console.error(e);
			this.handleError("Error when running updateContacts", e, {
				options,
			});
		}
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
		existingContacts: {
			properties: Properties;
			body: string;
		}[],
		iCloudVCard: ICloudVCard,
		options: { rewriteAll: boolean },
	) {
		try {
			const existingContact = this.getExistingContact(
				existingContacts,
				iCloudVCard,
			);
			if (existingContact) {
				const isModified = this.isModified(
					existingContact,
					iCloudVCard,
				);
				if (isModified || options.rewriteAll) {
					await this.updateContactFile(iCloudVCard, existingContact);
					this.modifiedContacts.push(iCloudVCard);
				} else {
					this.skippedContacts.push(iCloudVCard);
				}
			} else {
				await this.createContactFile(iCloudVCard);
				this.newContacts.push(iCloudVCard);
			}
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
		this.noticeShower(noticeText, 7000);
		console.log(pluginName, {
			newContacts: this.newContacts,
			modifiedContacts: this.modifiedContacts,
			deletedContacts: this.deletedContacts,
			skippedContacts: this.skippedContacts,
		});
		this.newContacts = [];
		this.modifiedContacts = [];
		this.deletedContacts = [];
		this.skippedContacts = [];
	}

	private async moveDeletedContacts(
		existingContacts: {
			properties: Properties;
			body: string;
		}[],
		iCloudVCards: ICloudVCard[],
	) {
		this.deletedContacts = existingContacts
			.filter(
				(c) =>
					!iCloudVCards.some(
						(i) =>
							i.url ===
							c.properties[iCloudVCardPropertieName].url,
					),
			)
			.map((c) => c.properties[iCloudVCardPropertieName]);

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
		existingContact: { properties: Properties; body: string },
		iCloudVCard: ICloudVCard,
	) {
		return (
			existingContact.properties[iCloudVCardPropertieName].etag !==
			iCloudVCard.etag
		);
	}

	private getExistingContact(
		currentContacts: {
			properties: Properties;
			body: string;
		}[],
		iCloudVCard: ICloudVCard,
	) {
		return currentContacts.find(
			(c) =>
				c.properties[iCloudVCardPropertieName].url === iCloudVCard.url,
		);
	}

	private async updateContactFile(
		iCloudVCard: ICloudVCard,
		existingContact: {
			properties: Properties;
			body: string;
		},
	) {
		const newFullName = getFullName(iCloudVCard.data);
		if (!existingContact.properties[iCloudVCardPropertieName].data) {
			throw new Error(
				`existingContact.properties[${iCloudVCardPropertieName}].data is missing`,
			);
		}
		const existingContactFullName = getFullName(
			existingContact.properties[iCloudVCardPropertieName].data,
		);

		const contactFile = this.getContactFile(existingContactFullName);
		if (!contactFile) {
			throw new Error("contactFile not found");
		}

		const isFullNameModified = existingContactFullName !== newFullName;
		if (isFullNameModified) {
			await this.renameContactFile(existingContactFullName, newFullName);
			await this.app.vault.process(contactFile, (data) => {
				return data.replace(
					`# ${existingContactFullName}`,
					`# ${newFullName}`,
				);
			});
		}

		const parsedVCards = parseVCard(iCloudVCard.data);
		const newFrontMatter = createFrontmatter(
			parsedVCards as VCards[],
			newFullName,
			this.settings,
		);
		// TODO: for at man skal være sikker på å kunne generere opp de samme frontmatterene som forrige gang
		// Så må man ha samme settings som forrige gang. Det en diff på settings kan også brukes til å kjøre update all når settings er endret.
		const prevFrontMatter = createFrontmatter(
			parseVCard(
				existingContact.properties[iCloudVCardPropertieName].data,
			) as VCards[],
			getFullName(
				existingContact.properties[iCloudVCardPropertieName].data,
			),
			this.settings,
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
				fileFrontmatter[iCloudVCardPropertieName] = iCloudVCard;
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
			fm[iCloudVCardPropertieName] = iCloudVCard;
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
						!fileName.contains(errorsFileName),
				)
				.map((fileName) => this.getContactProperties(fileName)),
		);
	}

	private async getContactProperties(filePath: string) {
		const contactFile = this.app.vault.getFileByPath(
			this.normalizePath(filePath),
		);

		if (contactFile) {
			const content = await this.app.vault.read(contactFile);
			const delimiter = "---";
			const endOfProperties = content.indexOf(delimiter, 4);
			const propertiesString = content
				.slice(0, endOfProperties)
				.replace(delimiter, "");
			const properties: {
				[key: string]: string | string[] | ICloudVCard;
				iCloudVCard: ICloudVCard;
			} = this.parseYaml(propertiesString);
			if (
				!properties[iCloudVCardPropertieName] ||
				!properties[iCloudVCardPropertieName].data
			) {
				throw new Error(
					`properties[${iCloudVCardPropertieName}].data is undefined`,
				);
			}
			const fullName = this.normalizePath(
				getFullName(properties[iCloudVCardPropertieName].data),
			);
			const title = `# ${fullName}`;
			const endOfContactHeader = content.indexOf(title) + title.length;
			const body = content.slice(endOfContactHeader);
			return { properties, body };
		}
		return {
			properties: {
				[iCloudVCardPropertieName]: {
					url: "",
					etag: "",
					data: "",
				},
			},
			body: "",
		};
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
