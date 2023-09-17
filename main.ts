import { normalizePath, Plugin, TFile, Notice } from "obsidian";
import * as path from "path";
import { fetchContacts } from "src/iCloudClient";
import { parseVCard } from "src/parser";
import {
	DEFAULT_SETTINGS,
	ObsidianDavSettings,
	SettingTab,
} from "src/SettingTab";
import * as YAML from "yaml";

// Remember to rename these classes and interfaces!

type ICloudVCard = {
	url: string;
	etag: string;
	data?: string;
};

const deletedFolder = "Deleted";
const iCloudVCardPropertieName = "iCloudVCard";
const errorsFileName = "Errors";

export default class ObsidianDav extends Plugin {
	settings: ObsidianDavSettings;

	async onload() {
		await this.loadSettings();

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: "update-contacts",
			name: "Update Contacts",
			callback: async () => {
				try {
					await this.updateContacts(
						this.settings.username,
						this.settings.password
					);
				} catch (e) {
					console.error(e);
				}
			},
		});

		this.addCommand({
			id: "update-all-contacts",
			name: "Update all Contacts",
			callback: () => {
				try {
					this.updateContacts(
						this.settings.username,
						this.settings.password,
						{ rewriteAll: true }
					);
				} catch (e) {
					console.error(e);
				}
			},
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SettingTab(this.app, this));
	}

	async updateContacts(
		username: string,
		password: string,
		options = { rewriteAll: false }
	) {
		await this.createContactsFolder();
		const iCloudVCards = await fetchContacts(username, password);

		const folder = normalizePath(this.settings.folder);
		const currentContacts = await this.getAllCurrentProperties(folder);

		let newContacts: any[] = [];
		let modifiedContacts: any[] = [];
		let skippedContacts: any[] = [];
		for (const iCloudVCard of iCloudVCards) {
			const existingContact = currentContacts.find((c) => {
				return (
					c.properties[iCloudVCardPropertieName].url ===
					iCloudVCard.url
				);
			});
			if (existingContact) {
				const isModified =
					existingContact.properties[iCloudVCardPropertieName]
						.etag !== iCloudVCard.etag;
				if (isModified || options.rewriteAll) {
					const { contactHeader, fullName } =
						this.createContactHeader(iCloudVCard);
					if (
						!existingContact.properties[iCloudVCardPropertieName]
							.data
					) {
						throw new Error(
							`existingContact.properties[${iCloudVCardPropertieName}].data`
						);
					}
					const { fn: existingContactFullName } = parseVCard(
						existingContact.properties[iCloudVCardPropertieName]
							.data
					);
					const isFullNameModified =
						existingContactFullName.replace(/\\/g, "") !== fullName;
					if (isFullNameModified) {
						await this.renameContactFile(
							existingContactFullName,
							fullName
						);
					}
					const fileName = `${fullName}.md`;
					const filePath = path.join(folder, fileName);
					const content = contactHeader + existingContact.body;
					const contactFile =
						this.app.vault.getAbstractFileByPath(filePath);
					if (contactFile instanceof TFile) {
						this.app.vault.modify(contactFile, content);
					}
					modifiedContacts.push(iCloudVCard);
				} else {
					skippedContacts.push(iCloudVCard);
				}
			} else {
				// Create contact file
				const { contactHeader, fullName } =
					this.createContactHeader(iCloudVCard);
				const fileName = `${fullName}.md`;
				const filePath = path.join(folder, fileName);
				try {
					await this.app.vault.create(filePath, contactHeader);
				} catch (e) {
					const errorFile = await this.createErrorFile();
					if (errorFile instanceof TFile) {
						const errorText = `## Error trying to create \`${filePath}\`
### Error message

${e.message}

### iCloudVCard

\`\`\`json
${JSON.stringify(iCloudVCard)}
\`\`\`
`;
						await this.app.vault.append(errorFile, errorText);
						await this.app.workspace.getLeaf().openFile(errorFile);
					}
				}
				newContacts.push(iCloudVCard);
			}
		}

		// Find all current contacts that do not exist in icloudVCards
		const deletedContacts = currentContacts.filter(
			(c) =>
				!iCloudVCards.some(
					(i) => i.url === c.properties[iCloudVCardPropertieName].url
				)
		);

		if (deletedContacts.length > 0) {
			await this.createDeletedFolder();
		}

		// Move deleted contacts to deleted folder
		for (const deletedContact of deletedContacts) {
			if (!deletedContact.properties[iCloudVCardPropertieName].data) {
				throw new Error(
					`deletedContact.properties[${iCloudVCardPropertieName}].data`
				);
			}
			const { fn: deletedContactFullName } = parseVCard(
				deletedContact.properties[iCloudVCardPropertieName].data
			);
			await this.renameContactFile(
				deletedContactFullName,
				path.join(deletedFolder, deletedContactFullName)
			);
		}

		let noticeText = "";
		if (newContacts.length > 0)
			noticeText += `Created ${newContacts.length}\n`;
		if (modifiedContacts.length > 0)
			noticeText += `Modified ${modifiedContacts.length}\n`;
		if (deletedContacts.length > 0)
			noticeText += `Deleted ${deletedContacts.length}\n`;
		if (skippedContacts.length > 0)
			noticeText += `Skipped ${skippedContacts.length}\n`;
		new Notice(noticeText);
		console.log({
			newContacts,
			modifiedContacts,
			deletedContacts,
			skippedContacts,
		});
	}

	private async renameContactFile(
		existingContactFullName: string,
		fullName: string | string[]
	) {
		const contactFile = this.app.vault.getAbstractFileByPath(
			path.join(this.settings.folder, existingContactFullName + ".md")
		);
		if (contactFile instanceof TFile) {
			await this.app.vault.rename(
				contactFile,
				path.join(this.settings.folder, fullName + ".md")
			);
		}
	}

	async getAllCurrentProperties(folder: string) {
		// Get all files in folder
		const listedFiles = await this.app.vault.adapter.list(folder);
		return Promise.all(
			listedFiles.files
				.filter(
					(fileName) =>
						fileName.endsWith(".md") &&
						!fileName.contains(errorsFileName)
				)
				.map((fileName) => this.getFileProperties(fileName))
		);
	}

	async getFileProperties(filePath: string) {
		const contactFile = this.app.vault.getAbstractFileByPath(filePath);

		if (contactFile instanceof TFile) {
			const content = await this.app.vault.read(contactFile);
			const delimiter = "---";
			const endOfProperties = content.indexOf(delimiter, 4);
			const propertiesString = content
				.slice(0, endOfProperties)
				.replace(delimiter, "");
			const properties: { [key: string]: string | string[] } & {
				iCloudVCard: ICloudVCard;
			} = YAML.parse(propertiesString);
			if (
				!properties[iCloudVCardPropertieName] ||
				!properties[iCloudVCardPropertieName].data
			) {
				throw new Error(
					`properties[${iCloudVCardPropertieName}].data is undefined`
				);
			}
			const { fn: fullName } = parseVCard(
				properties[iCloudVCardPropertieName].data
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

	createContactHeader(iCloudVCard: ICloudVCard) {
		if (!iCloudVCard.data) {
			throw new Error("iCloudVCard.data is undefined");
		}

		const parsedVCard: { [key: string]: string | string[] } = parseVCard(
			iCloudVCard.data
		);

		const unShowedKeys = [
			"n",
			"photo",
			"prodid",
			"rev",
			"uid",
			"version",
			"xAbadr",
			"xAbLabel",
			"xAbShowAs",
			"xImagehash",
			"xImagetype",
		];

		const contact = Object.entries(parsedVCard).reduce(
			(o, [key, value]) => {
				if (unShowedKeys.indexOf(key) > -1) return o;
				if (key === "org")
					return {
						...o,
						organization: (value as string).replace(";", ""),
					};
				if (key === "tel")
					return {
						...o,
						telephone: Array.isArray(value) ? value : [value],
					};
				if (key === "email")
					return {
						...o,
						email: Array.isArray(value) ? value : [value],
					};
				if (key === "adr")
					return {
						...o,
						addresses: Array.isArray(value) ? value : [value],
					};
				if (key === "url")
					return {
						...o,
						url: Array.isArray(value) ? value : [value],
					};
				if (key === "bday") return { ...o, birthday: value };
				if (key === "fn") return { ...o, name: value };
				return { ...o, [key]: value };
			},
			{}
		);

		const fullName = (parsedVCard.fn as string).replace(/\\/g, "");
		const properties = YAML.stringify(contact);
		const contactHeader = `---
${properties}iCloudVCard: ${JSON.stringify(iCloudVCard)}
---
# ${fullName}`;

		return { contactHeader, fullName };
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async createContactsFolder() {
		try {
			const stat = await this.app.vault.adapter.stat(
				this.settings.folder
			);
			if (!stat || stat.type !== "folder") {
				throw new Error(`The ${this.settings.folder} is not a folder`);
			}
		} catch (error) {
			this.app.vault.createFolder(this.settings.folder);
		}
	}

	async createDeletedFolder() {
		const folderPath = path.join(this.settings.folder, deletedFolder);
		try {
			const stat = await this.app.vault.adapter.stat(folderPath);
			if (!stat || stat.type !== "folder") {
				throw new Error(`The ${this.settings.folder} is not a folder`);
			}
		} catch (error) {
			this.app.vault.createFolder(folderPath);
		}
	}

	async createErrorFile() {
		const filePath = path.join(
			this.settings.folder,
			`${errorsFileName}.md`
		);
		try {
			const stat = await this.app.vault.adapter.stat(filePath);
			if (!stat || stat.type !== "file") {
				throw new Error(`The ${filePath} is not a file`);
			}
		} catch (error) {
			await this.app.vault.create(filePath, "");
		}
		return this.app.vault.getAbstractFileByPath(filePath);
	}
}
