import { normalizePath, Plugin, TFile } from "obsidian";
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

export default class ObsidianDav extends Plugin {
	settings: ObsidianDavSettings;

	async onload() {
		await this.loadSettings();

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: "update-contacts",
			name: "Update Contacts",
			callback: () => {
				try {
					this.updateContacts(
						this.settings.username,
						this.settings.password,
						normalizePath(this.settings.folder)
					);
				} catch (e) {
					console.error(e);
				}
			},
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SettingTab(this.app, this));
	}

	async updateContacts(username: string, password: string, folder: string) {
		await this.createContactsFolder();
		const iCloudVCards = await fetchContacts(username, password);

		const currentContacts = await this.getAllCurrentProperties(folder);

		let newContacts: any[] = [];
		let modifiedContacts: any[] = [];
		let skippedContactsCount = 0;
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
				if (isModified) {
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
						existingContactFullName !== fullName;
					if (isFullNameModified) {
						this.renameContactFile(
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
					skippedContactsCount++;
				}
			} else {
				// Create contact file
				const { contactHeader, fullName } =
					this.createContactHeader(iCloudVCard);
				const fileName = `${fullName}.md`;
				const filePath = path.join(folder, fileName);
				const contactFile =
					this.app.vault.getAbstractFileByPath(filePath);
				if (contactFile instanceof TFile) {
					this.app.vault.modify(contactFile, contactHeader);
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
		// How to format a path in nodejs

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
			this.renameContactFile(
				path.join(folder, deletedContactFullName + ".md"),
				path.join(folder, deletedFolder, deletedContactFullName + ".md")
			);
		}

		console.log(
			JSON.stringify(
				{
					newContacts,
					modifiedContacts,
					deletedContacts,
					skippedContactsCount,
				},
				null,
				2
			)
		);
	}

	private renameContactFile(
		existingContactFullName: string,
		fullName: string | string[]
	) {
		const contactFile = this.app.vault.getAbstractFileByPath(
			path.join(this.settings.folder, existingContactFullName + ".md")
		);
		if (contactFile instanceof TFile) {
			this.app.vault.rename(
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
				.filter((fileName) => fileName.endsWith(".md"))
				.map(this.getFileProperties)
		);
	}

	async getFileProperties(fileName: string) {
		const filePath = path.join(this.settings.folder, fileName);
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
			if (!properties[iCloudVCardPropertieName].data) {
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
			"fn",
			"photo",
			"prodid",
			"rev",
			"uid",
			"version",
			"xAbadr",
			"xAbLabel",
			"xImagehash",
			"xImagetype",
		];

		const contact = Object.entries(parsedVCard).reduce(
			(o, [key, value]) => {
				if (unShowedKeys.indexOf(key) > -1) return o;
				if (key === "adr") return { ...o, address: value };
				if (key === "tel") return { ...o, telephone: value };
				if (key === "org") return { ...o, organization: value };
				if (key === "bday") return { ...o, birthday: value };
				return { ...o, [key]: value };
			},
			{}
		);

		const fullName = parsedVCard.fn;
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
			if (stat && stat.type !== "folder") {
				throw new Error(`The ${this.settings.folder} is not a folder`);
			}
		} catch (error) {
			this.app.vault.createFolder(this.settings.folder);
		}
	}
}
