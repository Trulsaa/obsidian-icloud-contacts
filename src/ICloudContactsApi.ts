import { ICloudContactsSettings } from "./SettingTab";
import { updateCustomContent } from "./customContent";
import { createFrontmatter } from "./frontMatter";
import { parseVCardToJCard } from "./parser";
import {
	base64ToArrayBuffer,
	detectImageExtension,
	getPhotoBaseName,
	getPhotoSource,
	isSamePhotoSource,
	isTrustedPhotoUrl,
	photoPathFromLink,
	updatePhotoEmbed,
} from "./photo";

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
const photoFileProperty = "photo file";
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
	createBinary: (path: string, data: ArrayBuffer) => Promise<TFile>;
	createFolder: (path: string) => Promise<TFolder>;
	getFileByPath: (path: string) => TFile | null;
	getFolderByPath: (path: string) => TFolder | null;
	modifyBinary: (file: TFile, data: ArrayBuffer) => Promise<void>;
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
	private failedPhotos = 0;

	constructor(
		onlyRequiredFromObsidianApp: OnlyRequiredFromObsidianApi,
		private settings: ICloudContactsSettings,
		private fetchContacts: (
			username: string,
			password: string,
			serverUrl: string,
		) => Promise<ICloudVCard[]>,
		private showNotice: NoticeShower,
		private getPassword: () => string = () => settings.password,
		private fetchPhoto?: (
			url: string,
			username: string,
			password: string,
		) => Promise<ArrayBuffer>,
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
		let interval: ReturnType<typeof setInterval> | null = null;

		try {
			this.validateSettings();
			await this.getCreateFolder(this.settings.folder);
			if (this.settings.downloadPhotos) {
				await this.getCreateFolder(this.photoFolder);
			}

			// Starte a interval that sets setMessage every 1 second
			let nDots = 0;
			interval = setInterval(() => {
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
				this.getPassword(),
				this.settings.iCloudServerUrl,
			);

			const listsByContactUid = this.settings.listsProperty
				? this.getListsByContactUid(iCloudVCards)
				: new Map<string, string[]>();

			if (this.settings.groups.length > 0) {
				// Find all chosen group cards
				const groupVCards = iCloudVCards.filter(
					(vCard) =>
						// Only include group cards
						this.isGroupCard(vCard) &&
						// That are in the selected groups
						parseVCardToJCard(vCard.data)
							.filter((jCard) => jCard.key === "uid")
							.filter((jCard) =>
								this.settings.groups.some(
									(id) => id === (jCard.value as string),
								),
							).length > 0,
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

				// Keep only the cards that have a uid in the list from the selected groups
				iCloudVCards = iCloudVCards.filter((vCard) =>
					contactUids.some((uid) =>
						vCard.data.includes("UID:" + uid),
					),
				);
			}

			// Remove group vCards so only actual contact cards are processed
			iCloudVCards = iCloudVCards.filter(
				(vCard) => !this.isGroupCard(vCard),
			);

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
					this.getContactLists(iCloudVCard, listsByContactUid),
				);
			}

			await this.moveDeletedContacts(existingContacts, iCloudVCards);
		} catch (e) {
			console.error(e);
			this.handleError("Error when running updateContacts", e, {
				options,
			});
		} finally {
			if (interval) clearInterval(interval);
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
		this.failedPhotos = 0;

		return { updateData, usedSettings };
	}

	private isGroupCard(vCard: ICloudVCard) {
		return vCard.data.includes("X-ADDRESSBOOKSERVER-KIND:group");
	}

	private getListsByContactUid(iCloudVCards: ICloudVCard[]) {
		const listsByContactUid = new Map<string, string[]>();
		for (const groupVCard of iCloudVCards.filter((v) =>
			this.isGroupCard(v),
		)) {
			const jCard = parseVCardToJCard(groupVCard.data);
			const name = jCard.find((part) => part.key === "fn")?.value;
			if (typeof name !== "string" || !name) continue;
			const listName = name.replace(/\\/g, "");

			for (const part of jCard) {
				if (part.key !== "xAddressbookserverMember") continue;
				const uid = (part.value as string).replace("urn:uuid:", "");
				const lists = listsByContactUid.get(uid) ?? [];
				if (!lists.includes(listName)) lists.push(listName);
				listsByContactUid.set(uid, lists);
			}
		}
		return listsByContactUid;
	}

	private getContactLists(
		iCloudVCard: ICloudVCard,
		listsByContactUid: Map<string, string[]>,
	) {
		if (listsByContactUid.size === 0) return [];
		const uid = parseVCardToJCard(iCloudVCard.data).find(
			(part) => part.key === "uid",
		)?.value;
		if (typeof uid !== "string") return [];
		return [...(listsByContactUid.get(uid) ?? [])].sort();
	}

	private validateSettings() {
		if (!this.settings.username) {
			throw new Error("ICloud username is required in settings");
		}
		if (!this.getPassword()) {
			throw new Error(
				"ICloud app specific password is required in settings (secrets are stored per device, so it may need to be selected again on this device)",
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
		lists: string[],
	) {
		try {
			if (existingContact) {
				const isModified = this.isModified(
					existingContact.frontmatter,
					iCloudVCard,
					lists,
				);
				if (isModified || options.rewriteAll) {
					await this.updateContactFile(
						iCloudVCard,
						existingContact,
						previousVCard,
						lists,
					);
					this.modifiedContacts.push(iCloudVCard);
				} else {
					this.skippedContacts.push(iCloudVCard);
				}
				return;
			}

			await this.createContactFile(iCloudVCard, lists);
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
		if (this.failedPhotos > 0)
			noticeText += `Photos not downloaded ${this.failedPhotos} (see console)\n`;
		if (haveSettingsChanged)
			noticeText += "All contacts were updated to reflect new settings";
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
		lists: string[],
	) {
		// List membership lives on the group cards, so it can change without the contact's etag changing
		const existingLists: unknown[] = Array.isArray(
			existingFrontmatter.lists,
		)
			? existingFrontmatter.lists
			: [];
		const areListsChanged =
			!!this.settings.listsProperty &&
			(existingLists.length !== lists.length ||
				existingLists.some((list, i) => list !== lists[i]));
		return (
			existingFrontmatter[iCloudVCardPropertieName].etag !==
				iCloudVCard.etag || areListsChanged
		);
	}

	private async updateContactFile(
		iCloudVCard: ICloudVCard,
		existingContact: { frontmatter: Properties; path: string },
		previousVCard: ICloudVCard | undefined,
		lists: string[],
	) {
		const newFrontMatter = createFrontmatter(
			iCloudVCard.data,
			this.settings,
			lists,
		);
		const photoLink = await this.syncPhoto(iCloudVCard, existingContact);

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
				// Only adding the heading needs a separating newline inserted:
				// the heading's own line already has one when it is renamed or
				// removed, so adding one here would leave a blank line behind.
				if (isAddHeading && !data.endsWith(searchValue)) {
					replaceValue += "\n";
				}
				return data.replace(searchValue, replaceValue);
			});
		}

		await this.syncPhotoEmbed(
			contactFile,
			existingContact.frontmatter[photoFileProperty],
			photoLink,
			newFrontMatter.name as string,
		);

		await this.syncCustomContent(
			contactFile,
			newFrontMatter.name as string,
			photoLink,
		);

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
				if (
					!newFrontMatter.lists &&
					(this.settings.listsProperty ||
						this.settings.previousUpdateSettings?.listsProperty)
				) {
					delete fileFrontmatter.lists;
				}
				for (const [key, value] of Object.entries(newFrontMatter)) {
					fileFrontmatter[key] = value;
				}
				if (photoLink) {
					fileFrontmatter[photoFileProperty] = photoLink;
				} else if (
					(this.settings.downloadPhotos ||
						this.settings.previousUpdateSettings?.downloadPhotos) &&
					typeof fileFrontmatter[photoFileProperty] === "string" &&
					/^\[\[.*\]\]$/.test(fileFrontmatter[photoFileProperty])
				) {
					delete fileFrontmatter[photoFileProperty];
				}
				fileFrontmatter[iCloudVCardPropertieName] =
					JSON.stringify(iCloudVCard);
			},
		);
	}

	private async createContactFile(iCloudVCard: ICloudVCard, lists: string[]) {
		if (!iCloudVCard.data) {
			throw new Error("iCloudVCard.data is undefined");
		}

		const frontMatter = createFrontmatter(
			iCloudVCard.data,
			this.settings,
			lists,
		);
		const photoLink = await this.syncPhoto(iCloudVCard);

		let filePath = await this.createUniqeContactFilePath(
			frontMatter.name as string,
		);

		let content = this.settings.isNameHeading
			? `# ${frontMatter.name}`
			: "";
		if (this.settings.embedPhoto && photoLink) {
			content = updatePhotoEmbed(content, {
				path: photoPathFromLink(photoLink),
				insertIfMissing: true,
				heading: this.settings.isNameHeading
					? (frontMatter.name as string)
					: undefined,
			});
		}
		content = updateCustomContent(content, this.settings.customContent, {
			heading: this.settings.isNameHeading
				? (frontMatter.name as string)
				: undefined,
			photoPath: this.settings.embedPhoto
				? photoPathFromLink(photoLink)
				: undefined,
		});
		const newFile = await this.app.vault.create(
			this.normalizePath(filePath.replace(/\\/g, "")),
			content,
		);
		await this.app.fileManager.processFrontMatter(newFile, (fm) => {
			for (const [key, value] of Object.entries(frontMatter)) {
				fm[key] = value;
			}
			if (photoLink) fm[photoFileProperty] = photoLink;
			fm[iCloudVCardPropertieName] = JSON.stringify(iCloudVCard);
		});
	}

	private async syncPhotoEmbed(
		file: TFile,
		existingLink: unknown,
		photoLink: string | undefined,
		name: string,
	) {
		const wasEmbedding = !!this.settings.previousUpdateSettings?.embedPhoto;
		if (!this.settings.embedPhoto && !wasEmbedding) return;

		const previousPath = photoPathFromLink(existingLink);
		const path = this.settings.embedPhoto
			? photoPathFromLink(photoLink)
			: undefined;
		if (!previousPath && !path) return;

		// Re-add the embed only for a new photo or when embedding was just turned on,
		// so a line the user deleted by hand stays deleted.
		const insertIfMissing = !previousPath || !wasEmbedding;
		await this.app.vault.process(file, (data) =>
			updatePhotoEmbed(data, {
				previousPath,
				path,
				insertIfMissing,
				heading: this.settings.isNameHeading ? name : undefined,
			}),
		);
	}

	private async syncCustomContent(
		file: TFile,
		name: string,
		photoLink: string | undefined,
	) {
		const hasContent = !!this.settings.customContent?.trim();
		const hadContent =
			!!this.settings.previousUpdateSettings?.customContent?.trim();
		if (!hasContent && !hadContent) return;

		await this.app.vault.process(file, (data) =>
			updateCustomContent(data, this.settings.customContent, {
				previousContent:
					this.settings.previousUpdateSettings?.customContent,
				heading: this.settings.isNameHeading ? name : undefined,
				photoPath: this.settings.embedPhoto
					? photoPathFromLink(photoLink)
					: undefined,
			}),
		);
	}

	private get photoFolder() {
		const folder =
			this.settings.photoFolder?.trim() ||
			`${this.settings.folder}/Photos`;
		return this.normalizePath(folder.replace(/\/+$/, ""));
	}

	private async syncPhoto(
		iCloudVCard: ICloudVCard,
		existingContact?: { frontmatter: Properties; path: string },
	): Promise<string | undefined> {
		if (!this.settings.downloadPhotos) return undefined;

		const existingLink: string | undefined =
			typeof existingContact?.frontmatter[photoFileProperty] === "string"
				? existingContact.frontmatter[photoFileProperty]
				: undefined;

		try {
			const source = getPhotoSource(iCloudVCard.data);
			if (!source) return undefined;

			const baseName = getPhotoBaseName(
				iCloudVCard.data,
				iCloudVCard.url,
			);
			const reusableLink = this.getReusablePhotoLink(
				existingContact,
				source,
				baseName,
			);
			if (reusableLink) return reusableLink;

			let data: ArrayBuffer;
			if ("base64" in source) {
				data = base64ToArrayBuffer(source.base64);
			} else {
				if (
					!this.fetchPhoto ||
					!isTrustedPhotoUrl(
						source.url,
						this.settings.iCloudServerUrl,
					)
				) {
					throw new Error(`Photo url is not trusted: ${source.url}`);
				}
				data = await this.fetchPhoto(
					source.url,
					this.settings.username,
					this.getPassword(),
				);
			}

			const extension = detectImageExtension(data);
			if (!extension) throw new Error("Photo data is not a known image");

			const path = this.normalizePath(
				`${this.photoFolder}/${baseName}.${extension}`,
			);
			const file = this.app.vault.getFileByPath(path);
			if (file) {
				await this.app.vault.modifyBinary(file, data);
			} else {
				await this.app.vault.createBinary(path, data);
			}
			return `[[${path}]]`;
		} catch (e) {
			// iCloud can list a photo url whose image no longer exists
			if ((e as { status?: number })?.status === 404) return undefined;
			this.failedPhotos++;
			console.error(
				pluginName,
				"Could not download photo",
				iCloudVCard.url,
				e,
			);
			return existingLink;
		}
	}

	private getReusablePhotoLink(
		existingContact: { frontmatter: Properties; path: string } | undefined,
		source: ReturnType<typeof getPhotoSource>,
		baseName: string,
	): string | undefined {
		const link = existingContact?.frontmatter[photoFileProperty];
		const previousData =
			existingContact?.frontmatter[iCloudVCardPropertieName]?.data;
		if (typeof link !== "string" || typeof previousData !== "string")
			return;

		const match = /^\[\[(.*)\]\]$/.exec(link);
		if (!match) return;
		const path = match[1];
		if (!path.startsWith(`${this.photoFolder}/${baseName}.`)) return;
		if (!this.app.vault.getFileByPath(path)) return;

		return isSamePhotoSource(source, getPhotoSource(previousData))
			? link
			: undefined;
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
					key !== "previousUpdateData" &&
					key !== "password" &&
					key !== "passwordSecretName",
			)
			.every(([key, value]) => {
				const other = b[key];

				// Handle array settings (like `groups`) by value, not reference
				if (Array.isArray(value) && Array.isArray(other)) {
					if (value.length !== other.length) return false;
					const sortedValue = [...value].sort();
					const sortedOther = [...other].sort();
					return sortedValue.every((v, i) => v === sortedOther[i]);
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
