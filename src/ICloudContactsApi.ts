import { ICloudContactsSettings } from "./SettingTab";
import { createFrontmatter } from "./frontMatter";
import { JCardPart, parseVCardToJCard } from "./parser";

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
		exists: (path: string, sensitive?: boolean) => Promise<boolean>;
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
			serverUrl: string,
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

			// Starte a interval that sets setMessage every 1 second
			let nDots = 0;
			const interval = setInterval(() => {
				// Update the number ofr dots at the end every secoon
				if (nDots > 3) nDots = 0;
				// Pad the number of dots to 3
				const dots = ".".repeat(nDots).padEnd(3, " ");
				startNotice.setMessage(
					`${pluginName}: Downloading contacts${dots}`,
				);
				nDots++;
			}, 500);

			let iCloudVCards = await this.fetchContacts(
				this.settings.username,
				this.settings.password,
				this.settings.iCloudServerUrl,
			);
			clearInterval(interval);

			if (this.settings.groups.length > 0) {
				// Finnd al chosen group cards
				const groupVCards = iCloudVCards.filter((vCard) =>
					this.settings.groups.some((id) => vCard.data.includes(id)),
				);

				// Create a list of all uids in the group cards
				const contactUids = groupVCards.flatMap((vCard) =>
					parseVCardToJCard(vCard.data)
						.filter(
							(jCard) => jCard.key === "xAddressbookserverMember",
						)
						.map((jCard) =>
							(jCard.value as string).replace("urn:uuid:", ""),
						),
				);

				// Keep only the cards that have a uid in the list
				if (contactUids.length > 0) {
					iCloudVCards = iCloudVCards.filter(
						(vCard) =>
							!vCard.data.includes(
								"X-ADDRESSBOOKSERVER-KIND:group",
							) &&
							contactUids.some((uid) => vCard.data.includes(uid)),
					);
				}
			}

			const existingContacts = await this.getAllCurrentContacts(
				this.settings.folder,
			);

			const previousUpdateData = this.settings.previousUpdateData || [];

			let i = 0;
			for (const iCloudVCard of iCloudVCards) {
				startNotice.setMessage(
					`${pluginName}: Updating contact ${i++} of ${iCloudVCards.length}`,
				);
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
		if (!this.settings.folder) {
			throw new Error("Folder is required in settings");
		}
		const normalizedFolderPath = this.normalizePath(this.settings.folder);
		if (this.settings.folder !== normalizedFolderPath) {
			throw new Error(
				`Folder "${this.settings.folder}" is not valid, How about using "${normalizedFolderPath}"`,
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
		const newCount = this.newContacts.length;
		const modifiedCount = this.modifiedContacts.length;
		const deletedCount = this.deletedContacts.length;
		const skippedCount = this.skippedContacts.length;
		let noticeText = pluginName + ":\n";
		noticeText += `Created ${newCount}\n`;
		noticeText += `Modified ${modifiedCount}\n`;
		noticeText += `Deleted ${deletedCount}\n`;
		noticeText += `Skipped ${skippedCount}\n`;
		if (haveSettingsChanged)
			noticeText += "All contacts where updated to reflect new settings";
		if (newCount + modifiedCount + deletedCount === 0)
			noticeText += "Already up to date";
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
			const contactFile = this.app.vault.getFileByPath(
				deletedContact.path,
			);
			if (!contactFile)
				throw new Error(deletedContact.path + " not found");

			const uniqueFilePath = await this.createUniqeContactFilePath(
				`${deletedFolder}/${contactFile.basename}`,
			);
			await this.app.fileManager.renameFile(
				contactFile,
				this.normalizePath(uniqueFilePath),
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
		const newFrontMatter = createFrontmatter(
			iCloudVCard.data,
			this.settings,
		);

		const contactFile = this.app.vault.getFileByPath(existingContact.path);
		if (!contactFile) {
			throw new Error("contactFile not found");
		}

		const isFullNameModified =
			existingContact.frontmatter.name !== newFrontMatter.name;
		if (isFullNameModified) {
			const uniqueFilePath = await this.createUniqeContactFilePath(
				newFrontMatter.name as string,
			);
			await this.app.fileManager.renameFile(
				contactFile,
				this.normalizePath(uniqueFilePath),
			);
		}

		let isPrevNameHeading =
			this.settings.previousUpdateSettings?.isNameHeading;
		// This takes into acoount the first time, when the isNameHeading is not in previousUpdateSettings
		if (isPrevNameHeading === undefined) isPrevNameHeading = true;
		const isNameHeading = this.settings.isNameHeading;

		const isRemoveHeading = isPrevNameHeading && !isNameHeading;
		const isAddHeading = !isPrevNameHeading && isNameHeading;

		let searchValue = `# ${existingContact.frontmatter.name}`;
		let replaceValue = `# ${newFrontMatter.name}`;

		if (isRemoveHeading) {
			replaceValue = "";
		} else if (isAddHeading) {
			searchValue = `\n---\n`;
			replaceValue = `\n---\n# ${newFrontMatter.name}`;
		}

		if (
			searchValue !== replaceValue &&
			(isPrevNameHeading || isNameHeading)
		) {
			await this.app.vault.process(contactFile, (data) => {
				if (!data.endsWith(searchValue)) replaceValue += "\n";
				return data.replace(searchValue, replaceValue);
			});
		}

		const previousData = previousVCard
			? previousVCard.data
			: existingContact.frontmatter[iCloudVCardPropertieName].data;
		const prevFrontMatter = createFrontmatter(
			previousData,
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

		const frontMatter = createFrontmatter(iCloudVCard.data, this.settings);

		let filePath = await this.createUniqeContactFilePath(
			frontMatter.name as string,
		);

		const newFile = await this.app.vault.create(
			this.normalizePath(filePath.replace(/\\/g, "")),
			this.settings.isNameHeading ? `# ${frontMatter.name}` : "",
		);
		await this.app.fileManager.processFrontMatter(newFile, (fm) => {
			for (const [key, value] of Object.entries(frontMatter)) {
				fm[key] = value;
			}
			fm[iCloudVCardPropertieName] = JSON.stringify(iCloudVCard);
		});
	}

	private async createUniqeContactFilePath(subPath: string) {
		let filePath = `${this.settings.folder}/${subPath}.md`;
		let i = 1;
		while (true) {
			const fileExists = await this.app.vault.adapter.exists(
				this.normalizePath(filePath),
				true,
			);
			if (!fileExists) break;
			i++;
			filePath = `${this.settings.folder}/${subPath} ${i}.md`;
		}
		return filePath;
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
		return Object.entries(a)
			.filter(
				([key]) =>
					key !== "previousUpdateSettings" &&
					key !== "previousUpdateData",
			)
			.every(([key, value]) => {
				const other = b[key];

				// Handle array settings (like `groups`) by value, not reference
				if (Array.isArray(value) && Array.isArray(other)) {
					if (value.length !== other.length) return false;
					return value.every((v, i) => v === other[i]);
				}

				return value == other;
			});
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
