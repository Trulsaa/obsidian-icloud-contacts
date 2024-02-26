import {
	Notice,
	parseYaml,
	Plugin,
	stringifyYaml,
	TFile,
	TFolder,
	normalizePath,
} from "obsidian";
import { createFrontmatter } from "src/frontMatter";
import { fetchContacts } from "src/iCloudClient";
import { parseVCard, getFullName } from "src/parser";
import { VCards } from "src/VCards";
import {
	DEFAULT_SETTINGS,
	ICloudContactsSettings,
	SettingTab,
} from "src/SettingTab";

type ICloudVCard = {
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

export default class ICloudContacts extends Plugin {
	settings: ICloudContactsSettings;
	private newContacts: ICloudVCard[] = [];
	private modifiedContacts: ICloudVCard[] = [];
	private deletedContacts: ICloudVCard[] = [];
	private skippedContacts: ICloudVCard[] = [];

	async onload() {
		await this.loadSettings();

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: "update-contacts",
			name: "Update Contacts",
			callback: () => this.updateContacts(),
		});

		this.addCommand({
			id: "update-all-contacts",
			name: "Update all Contacts",
			callback: () => this.updateContacts({ rewriteAll: true }),
		});

		this.addRibbonIcon("sync", "Update Contacts", () =>
			this.updateContacts(),
		);

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SettingTab(this.app, this));
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData(),
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async updateContacts(options = { rewriteAll: false }) {
		try {
			const startMessage = new Notice(
				`${pluginName}: Updating contacts...`,
				0,
			);
			this.validateSettings();
			await this.getCreateFolder(this.settings.folder);
			const iCloudVCards = await fetchContacts(
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

			startMessage.hide();
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
		new Notice(noticeText, 7000);
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
			const deletedContactFullName = normalizePath(
				getFullName(iCloudVCard.data),
			);
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
		const { contactHeader, fullName } =
			this.createContactHeader(iCloudVCard);
		if (!existingContact.properties[iCloudVCardPropertieName].data) {
			throw new Error(
				`existingContact.properties[${iCloudVCardPropertieName}].data`,
			);
		}
		const existingContactFullName = normalizePath(
			getFullName(
				existingContact.properties[iCloudVCardPropertieName].data,
			),
		);
		const isFullNameModified =
			existingContactFullName.replace(/\\/g, "") !== fullName;
		if (isFullNameModified) {
			await this.renameContactFile(existingContactFullName, fullName);
		}
		const fileName = `${fullName}.md`;
		const filePath = this.settings.folder + "/" + fileName;
		const content = contactHeader + existingContact.body;
		const contactFile = this.app.vault.getAbstractFileByPath(
			filePath.replace(/\\/g, ""),
		);
		if (contactFile instanceof TFile) {
			this.app.vault.modify(contactFile, content);
		}
	}

	private async createContactFile(iCloudVCard: ICloudVCard) {
		if (!iCloudVCard.data) {
			throw new Error("iCloudVCard.data is undefined");
		}

		const unShowedKeys = this.settings.excludeKeys.split(/\s+/);
		const parsedVCards = parseVCard(iCloudVCard.data);
		const fullName = normalizePath(getFullName(iCloudVCard.data));
		const frontMatter = createFrontmatter(
			parsedVCards as VCards[],
			unShowedKeys,
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
		const contactFile = this.app.vault.getAbstractFileByPath(
			this.settings.folder + "/" + existingContactFullName + ".md",
		);
		if (contactFile instanceof TFile) {
			await this.app.fileManager.renameFile(
				contactFile,
				this.settings.folder + "/" + fullName + ".md",
			);
		}
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
		const contactFile = this.app.vault.getAbstractFileByPath(
			filePath.replace(/\\/g, ""),
		);

		if (contactFile instanceof TFile) {
			const content = await this.app.vault.read(contactFile);
			const delimiter = "---";
			const endOfProperties = content.indexOf(delimiter, 4);
			const propertiesString = content
				.slice(0, endOfProperties)
				.replace(delimiter, "");
			const properties: {
				[key: string]: string | string[] | ICloudVCard;
				iCloudVCard: ICloudVCard;
			} = parseYaml(propertiesString);
			if (
				!properties[iCloudVCardPropertieName] ||
				!properties[iCloudVCardPropertieName].data
			) {
				throw new Error(
					`properties[${iCloudVCardPropertieName}].data is undefined`,
				);
			}
			const fullName = normalizePath(
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

	private createContactHeader(iCloudVCard: ICloudVCard) {
		if (!iCloudVCard.data) {
			throw new Error("iCloudVCard.data is undefined");
		}

		const unShowedKeys = this.settings.excludeKeys.split(/\s+/);
		const parsedVCards = parseVCard(iCloudVCard.data);
		const fullName = normalizePath(getFullName(iCloudVCard.data));
		const contact = createFrontmatter(
			parsedVCards as VCards[],
			unShowedKeys,
			fullName,
			this.settings,
		);

		const properties = stringifyYaml(contact);
		const contactHeader = `---
${properties}${iCloudVCardPropertieName}: ${JSON.stringify(iCloudVCard)}
---
# ${fullName}`;

		return { contactHeader, fullName };
	}

	private async getCreateFolder(folderPath: string) {
		try {
			const stat = await this.app.vault.adapter.stat(folderPath);
			if (stat && stat.type === "folder")
				return this.app.vault.getAbstractFileByPath(
					folderPath,
				) as TFolder;
			if (stat && stat.type === "file")
				throw new Error(`${folderPath} already exists as a file`);
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
		const stat = await this.app.vault.adapter.stat(filePath);
		if (stat && stat.type === "file")
			return this.app.vault.getAbstractFileByPath(filePath);
		if (stat && stat.type === "folder")
			throw new Error(`${filePath} already exists as a folder`);
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
		if (errorFile instanceof TFile) {
			await this.app.vault.append(errorFile, errorText);
			await this.app.workspace.getLeaf().openFile(errorFile);
		}
	}
}
